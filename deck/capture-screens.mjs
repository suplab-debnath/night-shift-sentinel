// Captures the deck screenshots (DECK §3) from the offline build at 1920×1080, presenter mode.
// Usage: node deck/capture-screens.mjs   (run `npm run build:offline` first; `npm run deck` does both)
import { existsSync, mkdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { chromium } from '@playwright/test';

const here = path.dirname(fileURLToPath(import.meta.url));
const OFFLINE = path.resolve(here, '../apps/web/dist-offline/index.html');
const OUT = path.join(here, 'assets/screens');

if (!existsSync(OFFLINE)) {
  console.error('Offline build missing. Run: npm run build:offline');
  process.exit(1);
}
mkdirSync(OUT, { recursive: true });

const FILE = pathToFileURL(OFFLINE).href;
// Presenter mode per DECK §3; notes strip off because it is for the presenter's eyes only.
// take=0: the canonical script, so decks show the lines in SCENARIO.md.
const BASE = 'take=0&speed=8&autoplay=1&presenter=1&notes=0';

/** @type {{ file: string; query: string; after?: (page: import('@playwright/test').Page) => Promise<void> }[]} */
const SHOTS = [
  { file: '01-alert', query: 'pauseAt=a1.b09' },
  { file: '02-fanout', query: 'pauseAt=a2.b06' },
  { file: '03-evidence', query: 'pauseAt=a3.b21' },
  { file: '04-guardian', query: 'pauseAt=a4.b12' },
  { file: '05-gate', query: 'pauseAt=a5.b01' },
  { file: '06-recovery', query: 'pauseAt=a6.b03&autoDecide=g1:approved' },
  { file: '07-scorecard', query: 'pauseAt=a7.b06&autoDecide=g1:approved' },
  {
    file: '08-split',
    query: 'pauseAt=a7.b07&autoDecide=g1:approved',
    after: async (page) => {
      await page.keyboard.press('s');
      await page.getByTestId('split-view').waitFor();
    },
  },
  {
    file: '09-chaos',
    query: 'pauseAt=a4.b12',
    after: async (page) => {
      await page.evaluate(() => {
        const s = window.__nightShift.source;
        s.setSpeed(2);
        s.triggerChaos();
      });
      await page.waitForFunction(() => window.__nightShift.source.getSnapshot().state.permissionDenied !== null, null, { timeout: 30_000 });
      await page.evaluate(() => window.__nightShift.source.pause());
    },
  },
  {
    file: '10-inspector',
    query: 'pauseAt=a4.b06',
    after: async (page) => {
      await page.locator('[data-agent="fixer"]').click();
      await page.getByTestId('inspector').waitFor();
    },
  },
];

const browser = await chromium.launch();
const context = await browser.newContext({ viewport: { width: 1920, height: 1080 }, deviceScaleFactor: 1, offline: true });
const page = await context.newPage();
const errors = [];
page.on('pageerror', (e) => errors.push(String(e)));
const crops = {};

for (const shot of SHOTS) {
  await page.goto(`${FILE}?${BASE}&${shot.query}`);
  await page.waitForFunction(
    () => {
      const s = window.__nightShift?.source.getSnapshot();
      return s && (!s.playing || s.status === 'awaitingGate');
    },
    null,
    { timeout: 90_000 },
  );
  // Let the beat's last line finish typing, without reaching the next beat.
  await page.evaluate(() => {
    const src = window.__nightShift.source;
    const s = src.getSnapshot();
    if (s.status === 'awaitingGate') return;
    const next = s.timeline.beats.map((b) => b.t).filter((t) => t > s.t).sort((a, b) => a - b)[0] ?? Infinity;
    src.seek(Math.min(s.t + 1600, next - 1));
  });
  if (shot.after) await shot.after(page);
  await page.evaluate(() => document.fonts.ready);
  await page.waitForTimeout(800); // let sheet transitions settle
  await page.screenshot({ path: path.join(OUT, `${shot.file}.png`) });
  if (shot.file === '06-recovery') {
    const band = await page.getByTestId('heartbeat').boundingBox();
    crops.heartbeat = band;
  }
  console.log(`captured ${shot.file}`);
}

writeFileSync(path.join(OUT, 'crops.json'), JSON.stringify(crops, null, 2));
await browser.close();
if (errors.length) {
  console.error('Page errors:', errors);
  process.exit(1);
}
