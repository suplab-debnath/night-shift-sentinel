// Builds the live-mode Lambda for a manual (console) deploy: one esbuild bundle, zipped, then
// smoke-tested locally with the mock provider. Same bundling as the CDK stack (infra/lib):
// CJS, node22, minified, AWS SDK included, no Docker.
// Usage: npm run build:lambda -w @night-shift/server   → apps/server/dist-lambda/lambda.zip
import { mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import path from 'node:path';
import { PassThrough } from 'node:stream';
import { fileURLToPath } from 'node:url';
import { deflateRawSync } from 'node:zlib';
import { build } from 'esbuild';

const serverDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const outDir = path.join(serverDir, 'dist-lambda');
rmSync(outDir, { recursive: true, force: true });
mkdirSync(outDir, { recursive: true });
// The bundle is CommonJS; this package is ESM, so mark the output folder as CommonJS.
writeFileSync(path.join(outDir, 'package.json'), '{ "type": "commonjs" }\n');

await build({
  entryPoints: [path.join(serverDir, 'src/http/lambda.ts')],
  outfile: path.join(outDir, 'index.js'),
  bundle: true,
  platform: 'node',
  target: 'node22',
  format: 'cjs',
  minify: true,
  sourcemap: true,
  tsconfig: path.join(serverDir, 'tsconfig.json'),
  logLevel: 'warning',
});

// ---------------------------------------------------------------- zip (no external tools)
const crcTable = Array.from({ length: 256 }, (_, n) => {
  let c = n;
  for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  return c >>> 0;
});
const crc32 = (buf) => {
  let c = 0xffffffff;
  for (const b of buf) c = crcTable[(c ^ b) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
};

function zip(files) {
  const locals = [];
  const centrals = [];
  let offset = 0;
  for (const name of files) {
    const data = readFileSync(path.join(outDir, name));
    const packed = deflateRawSync(data, { level: 9 });
    const nameBuf = Buffer.from(name);
    const crc = crc32(data);
    const local = Buffer.alloc(30);
    local.writeUInt32LE(0x04034b50, 0);
    local.writeUInt16LE(20, 4); // version needed
    local.writeUInt16LE(0, 6); // flags
    local.writeUInt16LE(8, 8); // deflate
    local.writeUInt32LE(0, 10); // time/date
    local.writeUInt32LE(crc, 14);
    local.writeUInt32LE(packed.length, 18);
    local.writeUInt32LE(data.length, 22);
    local.writeUInt16LE(nameBuf.length, 26);
    local.writeUInt16LE(0, 28);
    locals.push(local, nameBuf, packed);
    const central = Buffer.alloc(46);
    central.writeUInt32LE(0x02014b50, 0);
    central.writeUInt16LE(0x0314, 4); // made by: Unix, 2.0
    central.writeUInt16LE(20, 6);
    central.writeUInt16LE(0, 8);
    central.writeUInt16LE(8, 10);
    central.writeUInt32LE(0, 12);
    central.writeUInt32LE(crc, 16);
    central.writeUInt32LE(packed.length, 20);
    central.writeUInt32LE(data.length, 24);
    central.writeUInt16LE(nameBuf.length, 28);
    central.writeUInt32LE((0o100644 << 16) >>> 0, 38); // -rw-r--r--
    central.writeUInt32LE(offset, 42);
    centrals.push(central, nameBuf);
    offset += local.length + nameBuf.length + packed.length;
  }
  const centralSize = centrals.reduce((n, b) => n + b.length, 0);
  const end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50, 0);
  end.writeUInt16LE(files.length, 8);
  end.writeUInt16LE(files.length, 10);
  end.writeUInt32LE(centralSize, 12);
  end.writeUInt32LE(offset, 16);
  return Buffer.concat([...locals, ...centrals, end]);
}

const zipPath = path.join(outDir, 'lambda.zip');
writeFileSync(zipPath, zip(['index.js', 'index.js.map', 'package.json']));

// ---------------------------------------------------------------- smoke test with the mock provider
// The Lambda streaming runtime provides the awslambda global; emulate it.
const outputs = [];
globalThis.awslambda = {
  streamifyResponse: (h) => h,
  HttpResponseStream: {
    from: (stream, meta) => {
      const record = { status: meta.statusCode, body: '' };
      outputs.push(record);
      stream.on('data', (c) => (record.body += c.toString()));
      return stream;
    },
  },
};
const savedMode = process.env.AGENT_MODE;
process.env.AGENT_MODE = 'live-mock';
const { handler } = createRequire(import.meta.url)(path.join(outDir, 'index.js'));
const call = async (method, rawPath, body) => {
  const stream = new PassThrough();
  const done = new Promise((r) => stream.on('finish', r));
  await handler({ rawPath, body: body ? JSON.stringify(body) : undefined, headers: {}, requestContext: { http: { method } } }, stream);
  await done;
  return outputs.at(-1);
};
const health = await call('GET', '/api/health');
const seg = await call('POST', '/api/segments', { scenarioId: 'incident-checkout', segment: 'main', decisions: [], context: '' });
process.env.AGENT_MODE = savedMode;
if (health.status !== 200 || seg.status !== 200 || !seg.body.includes('"frame":"segment.end"')) {
  console.error('Smoke test failed', { health: health.status, segment: seg.status });
  process.exit(1);
}
const kb = (n) => `${Math.round(n / 1024)} KB`;
console.log(`Smoke test passed (health 200, a full segment streamed with the mock provider).`);
console.log(`Upload: ${path.relative(process.cwd(), zipPath)} (${kb(readFileSync(zipPath).length)}). Handler: index.handler. Runtime: Node.js 22.x, arm64.`);
process.exit(0);
