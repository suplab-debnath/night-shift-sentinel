// Builds the decks (DECK.md: executive, technical, patterns slide) with pptxgenjs from repo data: scenario, agents, policies, branding.
// Usage: node deck/build-deck.mjs [--font-safe] [--out <dir>]
// Screenshots come from deck/capture-screens.mjs (npm run deck runs both).
import { existsSync, mkdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import * as Lucide from 'lucide-react';
import sharp from 'sharp';
import pptxgen from 'pptxgenjs';
import { dawnSky, nightSky, phone } from './art.mjs';

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, '..');
const args = process.argv.slice(2);
const FONT_SAFE = args.includes('--font-safe');
const outIdx = args.indexOf('--out');
const OUT = outIdx >= 0 ? path.resolve(args[outIdx + 1]) : path.join(here, 'out');
const SCREENS = path.join(here, 'assets/screens');

const readJson = (p) => JSON.parse(readFileSync(path.join(root, p), 'utf8'));
const branding = readJson('config/branding.json');
const scenario = readJson('packages/scenarios/incident-checkout/scenario.json');
const agentsFile = readJson('packages/scenarios/incident-checkout/agents.json');
const policies = readJson('packages/scenarios/incident-checkout/fixtures/policies.json');

for (const f of ['01-alert', '02-fanout', '03-evidence', '05-gate', '06-recovery', '09-chaos', '11-suspects', '12-pr', '13-audit', '14-inject']) {
  if (!existsSync(path.join(SCREENS, `${f}.png`))) {
    console.error(`Missing ${f}.png. Run: node deck/capture-screens.mjs (after npm run build:offline)`);
    process.exit(1);
  }
}

// ---------------------------------------------------------------- design system (DESIGN §3, DECK §1–§2)
const C = {
  white: 'FFFFFF',
  paper: 'F4F6F9',
  stage: 'EEF1F6',
  line: 'D9DFE8',
  ink: '16202E',
  ink2: '4B5769',
  ink3: '6E7A8D',
  signal: '2F4BDB',
  signalWash: 'E8ECFC',
  alert: 'D93A3F',
  alertWash: 'FDECEC',
  ok: '138A5A',
  okWash: 'E4F4EC',
  caution: 'B87300',
  cautionWash: 'FFF3DC',
};
const HUE = {
  sentinel: '0A8BA8',
  orchestrator: '2F4BDB',
  'log-detective': '7A4FD6',
  'code-archaeologist': 'B0306E',
  fixer: '5F7F12',
  guardian: '3F5A80',
  scribe: '8A5A2B',
  human: '16202E',
};
const ICON_FOR = {
  sentinel: 'Radar',
  orchestrator: 'Network',
  'log-detective': 'ScanSearch',
  'code-archaeologist': 'GitCompare',
  fixer: 'Wrench',
  guardian: 'ShieldCheck',
  scribe: 'NotebookPen',
  human: 'UserRound',
};
const F = FONT_SAFE ? { head: 'Calibri', body: 'Calibri', mono: 'Consolas' } : { head: 'Aptos Display', body: 'Aptos', mono: 'Consolas' };
const W = 13.333;
const H = 7.5;
const M = 0.6;
const CW = W - 2 * M;

// Placeholders stay visible when unfilled (DECK §1).
const fill = (v, key) => (v && v.trim() && !/^\{\{.*\}\}$/.test(v.trim()) ? v : `{{${key}}}`);
const ORG = fill(branding.orgName, 'ORG_NAME');
const CLIENT = fill(branding.clientName, 'CLIENT_NAME');
const PRESENTER = fill(branding.presenterName, 'PRESENTER_NAME');
const DATE = fill(branding.demoDate, 'DEMO_DATE');
const FOOTNOTE = scenario.scorecardFootnote;

// ---------------------------------------------------------------- icons: lucide (same set as the app) → PNG
const iconCache = new Map();
async function icon(name, color = C.white) {
  const key = `${name}:${color}`;
  if (iconCache.has(key)) return iconCache.get(key);
  const Cmp = Lucide[name];
  if (!Cmp) throw new Error(`No lucide icon ${name}`);
  const svg = renderToStaticMarkup(createElement(Cmp, { size: 256, color: `#${color}`, strokeWidth: 2 }));
  const png = await sharp(Buffer.from(svg)).png().toBuffer();
  const data = `image/png;base64,${png.toString('base64')}`;
  iconCache.set(key, data);
  return data;
}

// ---------------------------------------------------------------- helpers
function title(slide, text, opts = {}) {
  slide.addText(text, {
    x: M, y: 0.45, w: opts.w ?? CW, h: 0.8, fontFace: F.head, fontSize: 30, bold: true, color: C.ink, margin: 0, valign: 'top', isTextBox: true,
  });
}

function text(slide, t, o) {
  slide.addText(t, { fontFace: F.body, color: C.ink, margin: 0, valign: 'top', isTextBox: true, ...o });
}

function card(slide, x, y, w, h, o = {}) {
  slide.addShape('roundRect', {
    x, y, w, h, rectRadius: 0.1,
    fill: { color: o.fill ?? C.white },
    line: { color: o.line ?? C.line, width: o.lineWidth ?? 1 },
    ...(o.shadow ? { shadow: { type: 'outer', color: '16202E', opacity: 0.08, blur: 6, offset: 2, angle: 90 } } : {}),
  });
}

async function iconDisc(slide, name, x, y, d, hue, iconColor = C.white) {
  slide.addShape('ellipse', { x, y, w: d, h: d, fill: { color: hue }, line: { color: hue, width: 0 } });
  const s = d * 0.55;
  slide.addImage({ data: await icon(name, iconColor), x: x + (d - s) / 2, y: y + (d - s) / 2, w: s, h: s });
}

function illustrativeTag(slide, x, y) {
  slide.addText('Illustrative', {
    shape: 'roundRect', rectRadius: 0.5, x, y, w: 1.3, h: 0.34, fontFace: F.body, fontSize: 12, color: C.ink2, align: 'center', valign: 'middle',
    line: { color: C.ink2, width: 1 }, fill: { color: C.white }, margin: 0, isTextBox: true,
  });
}

function screen(slide, file, x, y, w) {
  const h = (w * 1080) / 1920;
  slide.addShape('rect', { x: x - 0.01, y: y - 0.01, w: w + 0.02, h: h + 0.02, fill: { color: C.line }, line: { color: C.line, width: 0 } });
  slide.addImage({ path: path.join(SCREENS, `${file}.png`), x, y, w, h });
  return h;
}

/** A region of a screenshot (pixels of the 1920×1080 capture), placed at height h. */
async function screenCrop(slide, file, crop, x, y, h) {
  const buf = await sharp(path.join(SCREENS, `${file}.png`)).extract(crop).png().toBuffer();
  const w = (h * crop.width) / crop.height;
  slide.addShape('rect', { x: x - 0.01, y: y - 0.01, w: w + 0.02, h: h + 0.02, fill: { color: C.line }, line: { color: C.line, width: 0 } });
  slide.addImage({ data: `image/png;base64,${buf.toString('base64')}`, x, y, w, h });
  return w;
}

function arrow(slide, x1, y1, x2, y2, color = C.ink3) {
  slide.addShape('line', {
    x: Math.min(x1, x2), y: Math.min(y1, y2), w: Math.abs(x2 - x1) || 0.001, h: Math.abs(y2 - y1) || 0.001,
    flipH: x2 < x1, flipV: y2 < y1, line: { color, width: 1.5, endArrowType: 'triangle' },
  });
}

function newDeck(titleText) {
  const pres = new pptxgen();
  pres.layout = 'LAYOUT_WIDE';
  pres.author = ORG;
  pres.company = ORG;
  pres.title = titleText;
  pres.theme = { headFontFace: F.head, bodyFontFace: F.body };
  return pres;
}

// ================================================================ EXECUTIVE DECK (DECK §4): a story in four parts
// Part 1 we push the code · Part 2 the traditional night · Rewind · Part 3 the squad's night · Part 4 what changed.
// Night slides are dark; the squad's night is light; the close is dawn (DECISIONS D-076).
const N = {
  bg: '0B1026',
  panel: '131A3D',
  panel2: '1B2450',
  line: '2C3768',
  ink: 'FFFFFF',
  ink2: 'C3CAE8',
  ink3: '8E97C0',
  amber: 'F5A524',
  red: 'FF6B6B',
  green: '4CC38A',
  blue: '8EA2FF',
  code: '070B1D',
};

function kicker(slide, label, color, y = 0.42) {
  text(slide, label.toUpperCase(), { x: M, y, w: CW, h: 0.3, fontSize: 12, bold: true, color, charSpacing: 3 });
}

/** Big mono time stamp: the ticking clock that carries the story. */
function stamp(slide, time, o = {}) {
  text(slide, time, { x: o.x ?? M, y: o.y ?? 0.85, w: o.w ?? 3.2, h: o.h ?? 0.85, fontFace: F.mono, fontSize: o.size ?? 40, bold: true, color: o.color ?? N.amber });
}

function nightTitle(slide, label, o = {}) {
  text(slide, label, { x: o.x ?? M, y: o.y ?? 0.95, w: o.w ?? CW, h: o.h ?? 0.8, fontFace: F.head, fontSize: o.size ?? 30, bold: true, color: N.ink });
}

function lightTitle(slide, label, part, o = {}) {
  kicker(slide, part, C.signal);
  text(slide, label, { x: M, y: 0.75, w: o.w ?? CW, h: 0.75, fontFace: F.head, fontSize: 30, bold: true, color: C.ink });
}

function darkCard(slide, x, y, w, h, fill = N.panel) {
  slide.addShape('roundRect', { x, y, w, h, rectRadius: 0.12, fill: { color: fill }, line: { color: N.line, width: 1 } });
}

function chip(slide, label, x, y, w, color, fill) {
  slide.addText(label, {
    shape: 'roundRect', rectRadius: 0.5, x, y, w, h: 0.36, fontFace: F.body, fontSize: 12, bold: true, color, fill: { color: fill },
    line: { color, width: 1 }, align: 'center', valign: 'middle', margin: 0, isTextBox: true,
  });
}

function dramatization(slide, dark = true) {
  text(slide, 'Dramatization of a typical manual response. Times are illustrative.', {
    x: M, y: 6.95, w: CW, h: 0.3, fontSize: 11, italic: true, color: dark ? N.ink3 : C.ink3,
  });
}

// Speaker notes for the executive deck come from docs/PRESENTER_SCRIPT.md: under each
// "### Slide N · …" heading, quoted lines are spoken text and italic lines are stage directions.
function presenterScript() {
  const file = path.join(root, 'docs/PRESENTER_SCRIPT.md');
  const notes = new Map();
  if (!existsSync(file)) return notes;
  let current = null;
  for (const raw of readFileSync(file, 'utf8').split('\n')) {
    const line = raw.trim();
    const heading = /^### Slide (\d+) ·/.exec(line);
    if (heading) {
      current = [];
      notes.set(Number(heading[1]), current);
      continue;
    }
    if (!current) continue;
    if (line.startsWith('#') || line === '---') {
      current = null;
      continue;
    }
    const plain = (t) => t.replace(/\*\*?([^*]+)\*\*?/g, '$1').replace(/`([^`]+)`/g, '$1').trim();
    if (line.startsWith('>')) {
      const said = plain(line.replace(/^>\s?/, ''));
      if (said) current.push(said);
      else if (current.at(-1) !== '') current.push('');
    } else if (/^\*[^*].*\*$/.test(line)) {
      if (current.length && current.at(-1) !== '') current.push('');
      current.push(`[${plain(line)}]`, '');
    }
  }
  return new Map([...notes].map(([n, lines]) => [n, lines.join('\n').replace(/\n{2,}/g, '\n\n').trim()]));
}

/** Replace each slide's notes with the presenter script, by slide number, when the script has them. */
function useScriptNotes(pres) {
  const script = presenterScript();
  const addSlide = pres.addSlide.bind(pres);
  let n = 0;
  pres.addSlide = (...args) => {
    const slide = addSlide(...args);
    const number = ++n;
    const addNotes = slide.addNotes.bind(slide);
    slide.addNotes = (text) => addNotes(script.get(number) || text);
    return slide;
  };
}

const clockMin = (c) => {
  const [h, m, s] = c.split(':').map(Number);
  return h * 60 + m + (s ?? 0) / 60;
};

async function executive() {
  const pres = newDeck('When the pager rings at 2 AM');
  useScriptNotes(pres);
  const night = await nightSky();
  const dawn = await dawnSky();
  const lock = await phone('lock');
  const app = await phone('app');
  const metrics = readJson('packages/scenarios/incident-checkout/fixtures/metrics.json');
  const split = scenario.splitView;
  const PART1 = 'Part 1 · We push the code';
  const PART2 = 'Part 2 · The traditional night';
  const PART3 = 'Part 3 · The same night, with a squad';
  const PART4 = 'Part 4 · What changed';

  // 1. Title: 2 AM over a sleeping city
  {
    const s = pres.addSlide();
    s.background = { data: night };
    text(s, `${ORG} for ${CLIENT}`, { x: M, y: 0.6, w: 8, h: 0.35, fontSize: 14, bold: true, color: N.ink2 });
    text(s, 'When the pager rings at 2 AM', { x: M, y: 1.85, w: 11, h: 1.9, fontFace: F.head, fontSize: 54, bold: true, color: N.ink });
    text(s, 'One bad deploy. Two ways through the night.', { x: M, y: 3.85, w: 8.6, h: 0.6, fontSize: 24, color: N.ink2 });
    text(s, [{ text: PRESENTER, options: { breakLine: true } }, { text: DATE }], { x: M, y: 4.7, w: 8, h: 0.7, fontSize: 14, color: N.ink3 });
    s.addNotes(
      "This is a story about one night and one bad deploy. First the way it usually goes. Then the same night again, with a squad of AI agents on call and a person still in charge. Then we'll talk about what it could mean for you.",
    );
  }

  // 2. 01:55 — a small change ships, every check is green
  {
    const s = pres.addSlide();
    s.background = { color: N.bg };
    kicker(s, PART1, N.amber);
    stamp(s, '01:55');
    nightTitle(s, 'A small change ships. Every check is green.', { x: M + 2.35, w: CW - 2.35 });
    const steps = [
      ['GitCommitHorizontal', 'Commit', 'Helm values refactor', N.blue],
      ['Package', 'Build', 'Passed', N.green],
      ['FlaskConical', 'Tests and checks', 'All passed', N.green],
      ['Rocket', 'Deploy v2.14.0', '6 of 6 pods ready', N.green],
    ];
    const gap = 0.45;
    const cw = (CW - 3 * gap) / 4;
    for (let i = 0; i < steps.length; i++) {
      const [ic, head, sub, hue] = steps[i];
      const x = M + i * (cw + gap);
      darkCard(s, x, 2.1, cw, 2.0);
      await iconDisc(s, ic, x + 0.3, 2.35, 0.7, hue === N.blue ? C.signal : C.ok);
      if (i > 0) await iconDisc(s, 'Check', x + cw - 0.62, 2.28, 0.4, C.ok);
      text(s, head, { x: x + 0.3, y: 3.2, w: cw - 0.5, h: 0.4, fontSize: 18, bold: true, color: N.ink });
      text(s, sub, { x: x + 0.3, y: 3.6, w: cw - 0.5, h: 0.35, fontSize: 14, color: hue === N.green ? N.green : N.ink2 });
      if (i < steps.length - 1) arrow(s, x + cw + 0.06, 3.1, x + cw + gap - 0.06, 3.1, N.ink3);
    }
    s.addShape('roundRect', { x: M, y: 4.5, w: CW, h: 1.55, rectRadius: 0.1, fill: { color: N.code }, line: { color: N.line, width: 1 } });
    text(s, 'deploy/helm/values-prod.yaml', { x: M + 0.3, y: 4.62, w: 6, h: 0.3, fontFace: F.mono, fontSize: 12, color: N.ink3 });
    text(s, [
      { text: '-  SPRING_DATASOURCE_HIKARI_MAXIMUMPOOLSIZE: "40"', options: { color: N.red, breakLine: true } },
      { text: '+  DB_POOL_MAX: "40"', options: { color: N.green } },
    ], { x: M + 0.3, y: 5.0, w: CW - 0.6, h: 0.9, fontFace: F.mono, fontSize: 18 });
    text(s, 'One setting was renamed. The app still reads the old name. Nothing fails. Yet.', {
      x: M, y: 6.3, w: CW, h: 0.45, fontSize: 18, bold: true, color: N.amber,
    });
    s.addNotes(
      'Friday night, 01:55. A routine release goes out: a tidy-up of the deployment settings. Build green, tests green, six of six pods healthy. But one setting was renamed, and the application still reads the old name. Nothing breaks yet, so nobody notices.',
    );
  }

  // 3. 02:04 — traffic doubles, checkout starts failing
  {
    const s = pres.addSlide();
    s.background = { color: N.bg };
    kicker(s, PART1, N.amber);
    stamp(s, '02:04');
    nightTitle(s, 'Traffic doubles. Checkout starts failing.', { x: M + 2.35, w: CW - 2.35 });
    const series = metrics.series.filter((p) => p.t >= '01:58:00' && p.t <= '02:07:00');
    s.addChart(
      pres.charts.LINE,
      [{ name: 'p99 latency (s)', labels: series.map((p) => (p.t.endsWith(':00') ? p.t.slice(0, 5) : '')), values: series.map((p) => Math.round(p.p99Ms / 100) / 10) }],
      {
        x: M, y: 1.95, w: 7.9, h: 4.15, chartColors: [N.red], lineSize: 3, lineDataSymbol: 'none',
        showTitle: true, title: 'p99 latency, seconds (target: under 0.8 s)', titleFontFace: F.body, titleFontSize: 14, titleColor: N.ink2,
        showLegend: false, catAxisLabelColor: N.ink3, catAxisLabelFontSize: 11, catAxisLabelFrequency: 1, valAxisLabelColor: N.ink3, valAxisLabelFontSize: 11,
        valGridLine: { color: N.line, size: 0.75 }, catGridLine: { style: 'none' }, valAxisMinVal: 0, valAxisMaxVal: 5,
        catAxisLineColor: N.line, valAxisLineShow: false,
      },
    );
    chip(s, '02:03  promo email: traffic ×2.4', M, 6.3, 3.6, N.amber, N.bg);
    chip(s, '02:04  first timeouts', M + 3.8, 6.3, 2.5, N.red, N.bg);
    // A customer's phone at checkout
    const px = 9.45;
    const py = 1.75;
    const pw = 2.6;
    s.addImage({ data: app, x: px, y: py, w: pw, h: pw * 2 });
    text(s, 'Parcelo', { x: px + 0.3, y: py + 0.55, w: pw - 0.6, h: 0.35, fontSize: 15, bold: true, color: C.ink });
    text(s, 'Checkout', { x: px + 0.3, y: py + 0.9, w: pw - 0.6, h: 0.3, fontSize: 11, color: C.ink2 });
    for (let i = 0; i < 3; i++) {
      s.addShape('roundRect', { x: px + 0.3, y: py + 1.4 + i * 0.42, w: pw - 0.6, h: 0.3, rectRadius: 0.06, fill: { color: 'E6EAF0' }, line: { color: 'E6EAF0', width: 0 } });
    }
    s.addShape('roundRect', { x: px + 0.25, y: py + 2.85, w: pw - 0.5, h: 1.0, rectRadius: 0.1, fill: { color: C.alertWash }, line: { color: C.alert, width: 1 } });
    text(s, 'Payment failed', { x: px + 0.4, y: py + 2.95, w: pw - 0.8, h: 0.35, fontSize: 14, bold: true, color: C.alert });
    text(s, 'Something went wrong. Please try again.', { x: px + 0.4, y: py + 3.3, w: pw - 0.8, h: 0.45, fontSize: 10, color: C.ink2 });
    s.addText('Try again', {
      shape: 'roundRect', rectRadius: 0.5, x: px + 0.3, y: py + 4.2, w: pw - 0.6, h: 0.45, fontFace: F.body, fontSize: 12, bold: true,
      color: C.white, fill: { color: C.ink }, line: { color: C.ink, width: 0 }, align: 'center', valign: 'middle', margin: 0, isTextBox: true,
    });
    s.addNotes(
      "At 02:03 a promo email goes out and traffic more than doubles. The smaller connection pool can't keep up. From 02:04, customers trying to pay start seeing this. Nobody is awake to see it.",
    );
  }

  // 4. 02:07 — the pager goes off
  {
    const s = pres.addSlide();
    s.background = { data: night };
    kicker(s, PART2, N.amber);
    stamp(s, '02:07', { y: 1.35, size: 60, h: 1.1 });
    text(s, 'The pager goes off.', { x: M, y: 2.55, w: 7, h: 0.9, fontFace: F.head, fontSize: 42, bold: true, color: N.ink });
    text(s, 'Somewhere, an on-call engineer is asleep. The traditional night starts now.', { x: M, y: 3.55, w: 6.6, h: 1.0, fontSize: 20, color: N.ink2 });
    const px = 8.7;
    const py = 0.85;
    const pw = 2.9;
    s.addImage({ data: lock, x: px, y: py, w: pw, h: pw * 2 });
    text(s, '2:07', { x: px, y: py + 0.75, w: pw, h: 0.9, fontSize: 46, color: N.ink, align: 'center' });
    s.addShape('roundRect', { x: px + 0.25, y: py + 2.2, w: pw - 0.5, h: 1.45, rectRadius: 0.14, fill: { color: 'FFFFFF', transparency: 8 }, line: { color: 'FFFFFF', width: 0 } });
    text(s, 'PAGER · now', { x: px + 0.42, y: py + 2.32, w: pw - 0.8, h: 0.28, fontSize: 9, bold: true, color: C.ink3 });
    text(s, 'SEV-2 · checkout-api', { x: px + 0.42, y: py + 2.6, w: pw - 0.8, h: 0.35, fontSize: 13, bold: true, color: C.alert });
    text(s, 'p99 4.8 s · errors 11.4%. Acknowledge within 5 minutes.', { x: px + 0.42, y: py + 2.95, w: pw - 0.8, h: 0.6, fontSize: 10, color: C.ink });
    s.addNotes('02:07. The SLO alert fires and pages the on-call engineer. It is two in the morning. Let\'s follow what usually happens next.');
  }

  // 5. 02:07 → 02:19 — wake up, log in, find the dashboards
  {
    const s = pres.addSlide();
    s.background = { color: N.bg };
    kicker(s, PART2, N.amber);
    stamp(s, '02:19');
    nightTitle(s, 'Twelve minutes before anyone looks at the data.', { x: M + 2.35, w: CW - 2.35 });
    const steps = [
      ['BellRing', split.manual[0], 'Asleep. The phone buzzes, then buzzes again.'],
      ['Smartphone', split.manual[1], 'Finds the phone, reads the alert, acknowledges.'],
      ['Laptop', split.manual[2], 'Laptop, VPN, sign-in. Which dashboard was it?'],
    ];
    const gap = 0.5;
    const cw = (CW - 2 * gap) / 3;
    s.addShape('line', { x: M + 0.4, y: 2.55, w: CW - 0.8, h: 0, line: { color: N.line, width: 2, dashType: 'dash' } });
    for (let i = 0; i < steps.length; i++) {
      const [ic, entry, body] = steps[i];
      const x = M + i * (cw + gap);
      await iconDisc(s, ic, x + 0.05, 2.1, 0.9, i === 0 ? C.alert : '3F5A80');
      text(s, entry.clock, { x: x + 1.15, y: 2.2, w: cw - 1.2, h: 0.6, fontFace: F.mono, fontSize: 28, bold: true, color: N.amber });
      darkCard(s, x, 3.3, cw, 2.3);
      text(s, entry.label, { x: x + 0.3, y: 3.5, w: cw - 0.6, h: 0.8, fontSize: 20, bold: true, color: N.ink });
      text(s, body, { x: x + 0.3, y: 4.35, w: cw - 0.6, h: 1.0, fontSize: 15, color: N.ink2 });
    }
    text(s, 'Meanwhile, customers keep failing to pay.', { x: M, y: 6.0, w: CW, h: 0.45, fontSize: 18, bold: true, color: N.red });
    dramatization(s);
    s.addNotes(
      "The first twelve minutes are the human part nobody puts in a diagram: waking up, finding the phone, getting onto the VPN, remembering which dashboard to open. All while customers can't pay.",
    );
  }

  // 6. 02:27 — the war room fills up
  {
    const s = pres.addSlide();
    s.background = { color: N.bg };
    kicker(s, PART2, N.amber);
    stamp(s, '02:27');
    nightTitle(s, 'The war room fills up.', { x: M + 2.35, w: CW - 2.35 });
    const chatW = 7.6;
    darkCard(s, M, 1.9, chatW, 4.95, N.panel);
    text(s, '# inc-checkout', { x: M + 0.3, y: 2.02, w: 4, h: 0.3, fontFace: F.mono, fontSize: 12, color: N.ink3 });
    const msgs = [
      ['OC', 'On-call engineer', '02:27', 'Seeing connection timeouts on checkout. Paging the DBA.', 'C2410C'],
      ['DB', 'Database admin', '02:31', 'Database CPU is 22%. Connections look normal. Not us.', '7A4FD6'],
      ['PL', 'Platform engineer', '02:33', 'No infrastructure changes tonight. Nodes are healthy.', '0A8BA8'],
      ['EM', 'Engineering manager', '02:35', 'Customers are affected. Any ETA?', '6E7A8D'],
      ['OC', 'On-call engineer', '02:36', 'Pasted the stack trace into a public AI chatbot. It says add DB connections.', 'C2410C'],
      ['OC', 'On-call engineer', '02:37', 'Did anything ship in the last day?', 'C2410C'],
      ['RM', 'Release manager', '02:40', 'checkout-api v2.14.0 at 01:55. All checks passed.', 'B0306E'],
      ['AD', 'App developer', '02:44', 'Found it. The pool-size key was renamed in the Helm chart.', '138A5A'],
    ];
    msgs.forEach(([ini, who, when, what, hue], i) => {
      const y = 2.42 + i * 0.555;
      s.addText(ini, {
        shape: 'ellipse', x: M + 0.3, y, w: 0.46, h: 0.46, fontFace: F.body, fontSize: 11, bold: true, color: 'FFFFFF',
        fill: { color: hue }, line: { color: hue, width: 0 }, align: 'center', valign: 'middle', margin: 0, isTextBox: true,
      });
      text(s, [
        { text: `${who}  `, options: { bold: true, color: N.ink } },
        { text: when, options: { fontFace: F.mono, color: N.ink3 } },
      ], { x: M + 0.9, y: y - 0.04, w: chatW - 1.2, h: 0.28, fontSize: 11 });
      const shadow = what.includes('public AI');
      text(s, what, { x: M + 0.9, y: y + 0.22, w: chatW - 1.2, h: 0.3, fontSize: 13, bold: shadow, color: i === msgs.length - 1 ? N.green : shadow ? N.red : N.ink2 });
    });
    const rx = M + chatW + 0.5;
    const rw = W - M - rx;
    text(s, 'Six people', { x: rx, y: 2.1, w: rw, h: 0.9, fontFace: F.head, fontSize: 44, bold: true, color: N.ink });
    text(s, 'woken across six teams', { x: rx, y: 3.0, w: rw, h: 0.45, fontSize: 18, color: N.ink2 });
    const team = [['UserRound', 'C2410C'], ['Database', '7A4FD6'], ['Server', '0A8BA8'], ['Briefcase', '6E7A8D'], ['GitBranch', 'B0306E'], ['Code', '138A5A']];
    for (let i = 0; i < team.length; i++) await iconDisc(s, team[i][0], rx + (i % 3) * 0.72, 3.7 + Math.floor(i / 3) * 0.72, 0.58, team[i][1]);
    text(s, 'Each person checks their own piece. Nobody sees the whole picture.', { x: rx, y: 5.05, w: rw, h: 0.8, fontSize: 15, color: N.amber, bold: true });
    text(s, '02:36 Production logs just left the company. Shadow AI, at 2 AM.', { x: rx, y: 5.95, w: rw, h: 0.8, fontSize: 15, color: N.red, bold: true });
    dramatization(s);
    s.addNotes(
      'By 02:27 the war room is filling up. The DBA says it is not the database. Platform says nothing changed. A manager asks for an ETA. It takes until 02:40 for someone to connect the release at 01:55, and until 02:44 to find the renamed key. Six people woken up, each checking their own piece.',
    );
  }

  // 7. Handoffs: everyone checks their own piece
  {
    const s = pres.addSlide();
    s.background = { color: N.bg };
    kicker(s, PART2, N.amber);
    stamp(s, '02:29–02:44', { w: 4.2, size: 32 });
    nightTitle(s, 'Page, wait, check, hand off. Repeat.', { x: M + 4.1, w: CW - 4.1, size: 28 });
    const cx = W / 2;
    const cy = 4.25;
    const people = [
      ['Database', '7A4FD6', 'Database admin', 'paged 02:29', '“Not the database.”', -4.1, -1.35],
      ['Server', '0A8BA8', 'Platform engineer', 'paged 02:31', '“No infra changes.”', 4.1, -1.35],
      ['Briefcase', '6E7A8D', 'Engineering manager', 'joins 02:35', '“Any ETA?”', -4.1, 1.35],
      ['GitBranch', 'B0306E', 'Release manager', 'paged 02:38', '“v2.14.0 at 01:55.”', 4.1, 1.35],
      ['Code', '138A5A', 'App developer', 'paged 02:39 · found it 02:44', '“A key was renamed.”', 0, 2.05],
    ];
    for (const [, , , , , dx, dy] of people) s.addShape('line', { x: Math.min(cx, cx + dx), y: Math.min(cy, cy + dy), w: Math.abs(dx) || 0.001, h: Math.abs(dy) || 0.001, flipH: dx < 0, flipV: dy < 0, line: { color: N.line, width: 1.5, dashType: 'dash' } });
    await iconDisc(s, 'UserRound', cx - 0.6, cy - 0.6, 1.2, 'C2410C');
    text(s, 'On-call engineer', { x: cx - 1.5, y: cy + 0.65, w: 3, h: 0.35, fontSize: 14, bold: true, color: N.ink, align: 'center' });
    for (const [ic, hue, role, when, quote, dx, dy] of people) {
      const bw = 3.3;
      const bx = cx + dx - bw / 2;
      const by = cy + dy - 0.55;
      darkCard(s, bx, by, bw, 1.1, N.panel2);
      await iconDisc(s, ic, bx + 0.15, by + 0.22, 0.66, hue);
      text(s, [
        { text: role, options: { bold: true, color: N.ink, breakLine: true } },
        { text: when, options: { fontFace: F.mono, color: N.ink3, fontSize: 11, breakLine: true } },
        { text: quote, options: { color: N.amber } },
      ], { x: bx + 0.95, y: by + 0.1, w: bw - 1.05, h: 0.9, fontSize: 13, valign: 'middle' });
    }
    dramatization(s);
    s.addNotes(
      "Every hop is a page, a wait, a login and a check of one system. Each answer is correct and none of them is the whole picture. That's not anyone's fault. It is how the work is shaped.",
    );
  }

  // 8. 02:55 — recovered, 48 minutes later
  {
    const s = pres.addSlide();
    s.background = { color: N.bg };
    kicker(s, PART2, N.amber);
    stamp(s, '02:55');
    nightTitle(s, 'Recovered. 48 minutes after the alert.', { x: M + 2.35, w: CW - 2.35 });
    const ax = M + 0.2;
    const aw = CW - 0.4;
    const t0 = clockMin('02:00');
    const t1 = clockMin('03:00');
    const X = (c) => ax + ((clockMin(c) - t0) / (t1 - t0)) * aw;
    const ay = 3.6;
    s.addShape('rect', { x: X('02:04'), y: ay - 0.5, w: X('02:55') - X('02:04'), h: 0.32, fill: { color: N.red, transparency: 15 }, line: { color: N.red, width: 0 } });
    text(s, 'Customers affected  02:04–02:55', { x: X('02:04') + 0.1, y: ay - 0.5, w: 4, h: 0.32, fontSize: 11, bold: true, color: N.ink, valign: 'middle', margin: 0 });
    s.addShape('line', { x: ax, y: ay, w: aw, h: 0, line: { color: N.ink3, width: 1.5 } });
    split.manual.forEach((e, i) => {
      const x = X(e.clock);
      s.addShape('ellipse', { x: x - 0.08, y: ay - 0.08, w: 0.16, h: 0.16, fill: { color: N.amber }, line: { color: N.bg, width: 1 } });
      const up = i % 2 === 1;
      s.addShape('line', { x, y: up ? ay - 0.06 : ay + 0.08, w: 0, h: 0.001, line: { color: N.bg, width: 0 } });
      text(s, [{ text: e.clock, options: { fontFace: F.mono, color: N.amber, breakLine: true } }, { text: e.label, options: { color: N.ink2 } }], {
        x: x - 0.8, y: up ? ay - 1.55 - 0.1 : ay + 0.2, w: 1.6, h: 0.95, fontSize: 11, align: 'center', valign: up ? 'bottom' : 'top',
      });
    });
    const stats = scenario.scorecard.filter((r) => ['Time to root cause', 'Time to mitigate', 'Human time spent'].includes(r.measure));
    const tw = (CW - 2 * 0.4) / 3;
    stats.forEach((r, i) => {
      const x = M + i * (tw + 0.4);
      darkCard(s, x, 5.35, tw, 1.35);
      text(s, r.manual, { x: x + 0.3, y: 5.45, w: tw - 0.6, h: 0.65, fontFace: F.head, fontSize: r.manual.length > 10 ? 22 : 28, valign: 'middle', bold: true, color: N.ink });
      text(s, r.measure, { x: x + 0.3, y: 6.1, w: tw - 0.6, h: 0.4, fontSize: 14, color: N.ink2 });
    });
    text(s, FOOTNOTE, { x: M, y: 6.95, w: CW, h: 0.3, fontSize: 11, italic: true, color: N.ink3 });
    s.addNotes(
      'Rollback approved at 02:49, recovery confirmed at 02:55. Forty-eight minutes from alert to fix, most of it spent finding the right people and the right facts. These numbers are illustrative; in a pilot we would use your own incident history.',
    );
  }

  // 9. Rewind
  {
    const s = pres.addSlide();
    s.background = { data: night };
    await iconDisc(s, 'RotateCcw', W / 2 - 0.6, 0.95, 1.2, C.signal);
    text(s, 'Rewind.', { x: M, y: 2.35, w: CW, h: 1.3, fontFace: F.head, fontSize: 72, bold: true, color: N.ink, align: 'center' });
    text(s, 'Same deploy. Same night. Same alert at 02:07.', { x: M, y: 3.75, w: CW, h: 0.6, fontSize: 26, color: N.ink2, align: 'center' });
    text(s, 'This time a squad of AI agents is on call, and a person still decides.', { x: M, y: 4.45, w: CW, h: 0.55, fontSize: 20, bold: true, color: N.amber, align: 'center' });
    s.addNotes("Now let's rewind to 02:07. Same bad deploy, same alert. This time a squad of AI agents takes the first shift, and a person still makes every production decision.");
  }

  // 10. Meet the squad
  {
    const s = pres.addSlide();
    s.background = { color: C.white };
    lightTitle(s, 'Seven specialists and one human', PART3);
    const squad = agentsFile.agents.filter((a) => a.id !== 'human');
    const human = agentsFile.agents.find((a) => a.id === 'human');
    const tw = 2.05;
    const th = 2.4;
    const gap = 0.2;
    const top = 1.75;
    for (let i = 0; i < squad.length; i++) {
      const a = squad[i];
      const row = i < 4 ? 0 : 1;
      const col = row === 0 ? i : i - 4;
      const x = M + col * (tw + gap);
      const y = top + row * (th + 0.25);
      card(s, x, y, tw, th, { fill: C.paper, line: C.paper });
      await iconDisc(s, ICON_FOR[a.id], x + 0.25, y + 0.25, 0.8, HUE[a.id]);
      text(s, a.name, { x: x + 0.25, y: y + 1.1, w: tw - 0.4, h: 0.6, fontSize: 16, bold: true, valign: 'bottom' });
      text(s, a.role, { x: x + 0.25, y: y + 1.75, w: tw - 0.4, h: 0.6, fontSize: 12, color: C.ink2 });
    }
    const sepX = M + 4 * tw + 3 * gap + 0.4;
    s.addShape('line', { x: sepX, y: top, w: 0, h: 2 * th + 0.25, line: { color: C.ink3, width: 1, dashType: 'dash' } });
    const hx = sepX + 0.45;
    const hw = W - M - hx;
    card(s, hx, top, hw, th, { fill: C.white, line: C.ink, lineWidth: 1.5 });
    await iconDisc(s, ICON_FOR.human, hx + 0.25, top + 0.25, 0.8, HUE.human);
    text(s, human.name, { x: hx + 0.25, y: top + 1.2, w: hw - 0.4, h: 0.4, fontSize: 16, bold: true });
    text(s, human.role, { x: hx + 0.25, y: top + 1.6, w: hw - 0.4, h: 0.7, fontSize: 12, color: C.ink2 });
    text(s, 'Approves every production change. Can pause the squad, reject a fix, and the squad adapts or stops.', {
      x: hx, y: top + th + 0.3, w: hw, h: 1.5, fontSize: 14, color: C.ink2,
    });
    s.addNotes('Seven specialists, each with a narrow job and narrow permissions, and one human with the final say on anything that touches production.');
  }

  // 11. Demo handoff
  {
    const s = pres.addSlide();
    s.background = { color: C.white };
    s.addImage({ path: path.join(SCREENS, '01-alert.png'), x: 0, y: 0, w: W, h: H, transparency: 78 });
    s.addShape('roundRect', { x: 3.1, y: 2.0, w: 7.13, h: 3.5, rectRadius: 0.15, fill: { color: C.white }, line: { color: C.line, width: 1 }, shadow: { type: 'outer', color: '16202E', opacity: 0.15, blur: 12, offset: 3, angle: 90 } });
    await iconDisc(s, 'MonitorPlay', 3.55, 2.45, 0.9, C.signal);
    text(s, 'LIVE DEMO · ABOUT 5 MINUTES', { x: 4.7, y: 2.55, w: 5.3, h: 0.3, fontSize: 12, bold: true, color: C.signal, charSpacing: 3 });
    text(s, 'Let’s watch the squad work.', { x: 4.7, y: 2.9, w: 5.3, h: 0.7, fontFace: F.head, fontSize: 30, bold: true });
    text(s, 'You make the call when it asks for approval. The incident clock keeps running while you decide.', {
      x: 3.55, y: 3.95, w: 6.3, h: 1.1, fontSize: 18, color: C.ink2,
    });
    s.addNotes(
      'Switch to the app now. Point out: the agents pause to think, tools run, two suspects get ruled out, the Orchestrator challenges the timing, Guardian checks policy, and the client approves. Press Pause squad once to show a person can stop the agents at any time.',
    );
  }

  // 12. Storyboard: what you just saw (also the backup if the demo cannot run)
  {
    const s = pres.addSlide();
    s.background = { color: C.white };
    lightTitle(s, 'What you just saw', PART3);
    const frames = [
      ['01-alert', 'Sentinel detects the breach'],
      ['02-fanout', 'Three questions at once'],
      ['11-suspects', 'Suspects checked and ruled out'],
      ['03-evidence', 'Root cause, with a confidence score'],
      ['05-gate', 'A person approves the fix'],
      ['06-recovery', 'Recovered, one pod at a time'],
    ];
    const fw = (CW - 2 * 0.3) / 3;
    const fh = (fw * 1080) / 1920;
    frames.forEach(([file, cap], i) => {
      const x = M + (i % 3) * (fw + 0.3);
      const y = 1.7 + Math.floor(i / 3) * (fh + 0.62);
      screen(s, file, x, y, fw);
      s.addText(String(i + 1), {
        shape: 'ellipse', x, y: y + fh + 0.1, w: 0.34, h: 0.34, fontFace: F.body, fontSize: 12, bold: true, color: C.white,
        fill: { color: C.signal }, line: { color: C.signal, width: 0 }, align: 'center', valign: 'middle', margin: 0, isTextBox: true,
      });
      text(s, cap, { x: x + 0.45, y: y + fh + 0.1, w: fw - 0.45, h: 0.34, fontSize: 14, bold: true, valign: 'middle' });
    });
    s.addNotes('A six-frame recap of the run, and the backup if the live demo cannot run in the room.');
  }

  // 13. Agents that investigate like engineers
  {
    const s = pres.addSlide();
    s.background = { color: C.white };
    lightTitle(s, 'They investigate like engineers: suspect, check, rule out', PART3);
    const sw = 6.9;
    screen(s, '11-suspects', M, 1.75, sw);
    const rx = M + sw + 0.4;
    const rw = W - M - rx;
    const threads = [
      ['log-detective', '“First suspect: the database is overloaded.”', 'sentinel', 'orders-db at 22% CPU. Not the cause.'],
      ['code-archaeologist', '“The Spring Boot upgrade is the usual suspect.”', 'code-archaeologist', 'Patch release, same HikariCP. Ruled out.'],
      ['orchestrator', '“Why did it break at 02:04, not 01:55?”', 'orchestrator', 'Traffic is the trigger. The pool cut to 10 is the cause.'],
    ];
    const agentName = (id) => agentsFile.agents.find((a) => a.id === id)?.name ?? id;
    for (let i = 0; i < threads.length; i++) {
      const [who, q, by, a] = threads[i];
      const y = 1.75 + i * 1.6;
      card(s, rx, y, rw, 1.45, { fill: C.paper, line: C.paper });
      s.addShape('ellipse', { x: rx + 0.2, y: y + 0.2, w: 0.16, h: 0.16, fill: { color: HUE[who] }, line: { color: HUE[who], width: 0 } });
      text(s, agentName(who), { x: rx + 0.45, y: y + 0.12, w: rw - 0.6, h: 0.3, fontSize: 12, bold: true, color: C.ink2 });
      text(s, q, { x: rx + 0.2, y: y + 0.42, w: rw - 0.4, h: 0.45, fontSize: 14, bold: true });
      text(s, [{ text: `${agentName(by)}: `, options: { bold: true, color: HUE[by] } }, { text: a, options: { color: C.ink } }], {
        x: rx + 0.2, y: y + 0.88, w: rw - 0.4, h: 0.5, fontSize: 13,
      });
    }
    s.addNotes(
      'This is what makes it agentic rather than scripted automation. They form a hypothesis, check it with a tool, and drop it when the evidence says so. The Orchestrator even challenges the timing before it accepts a root cause.',
    );
  }

  // 14. People stay in charge
  {
    const s = pres.addSlide();
    s.background = { color: C.white };
    lightTitle(s, 'People stay in charge', PART3);
    const sw = (CW - 0.5) / 2;
    const cols = [
      ['05-gate', 'UserCheck', C.signal, 'Every production change waits for a person', 'The clock keeps running while they decide, and that time is counted.'],
      ['09-chaos', 'ShieldX', C.alert, 'A bad idea is blocked twice', 'Guardian fails it against policy, and the tool is not even granted to the agent.'],
    ];
    for (let i = 0; i < cols.length; i++) {
      const [file, ic, hue, head, body] = cols[i];
      const x = M + i * (sw + 0.5);
      const h = screen(s, file, x, 1.75, sw);
      await iconDisc(s, ic, x, 1.75 + h + 0.3, 0.6, hue);
      text(s, head, { x: x + 0.8, y: 1.75 + h + 0.25, w: sw - 0.8, h: 0.4, fontSize: 18, bold: true });
      text(s, body, { x: x + 0.8, y: 1.75 + h + 0.68, w: sw - 0.8, h: 0.7, fontSize: 14, color: C.ink2 });
    }
    s.addNotes('Two independent controls. Policy is checked by code, not by the model, and the dangerous tool is simply not granted. And a person approves every production change.');
  }

  // 15. Their fixes follow your engineering rules (D-079)
  {
    const s = pres.addSlide();
    s.background = { color: C.white };
    lightTitle(s, 'Their fixes follow your engineering rules', PART3);
    const sw = (CW - 0.5) / 2;
    const cols = [
      ['12-pr', 'GitPullRequestDraft', C.signal, 'The permanent fix goes through your pipeline', 'A draft pull request with tests that would have caught the bad release. The agent cannot merge; a person reviews.'],
      ['14-inject', 'FileWarning', C.caution, 'Untrusted text is data, not orders', 'A log line that tries to instruct the agents is flagged and quarantined. Nothing runs.'],
    ];
    for (let i = 0; i < cols.length; i++) {
      const [file, ic, hue, head, body] = cols[i];
      const x = M + i * (sw + 0.5);
      const h = screen(s, file, x, 1.75, sw);
      await iconDisc(s, ic, x, 1.75 + h + 0.3, 0.6, hue);
      text(s, head, { x: x + 0.8, y: 1.75 + h + 0.25, w: sw - 0.8, h: 0.4, fontSize: 18, bold: true });
      text(s, body, { x: x + 0.8, y: 1.75 + h + 0.68, w: sw - 0.8, h: 0.7, fontSize: 14, color: C.ink2 });
    }
    s.addNotes('The squad fixes tonight with a reversible action. The permanent fix is code, so it goes through the same pipeline and review as any engineer’s change. And text inside logs or tickets is treated as evidence, never as an instruction.');
  }

  // 16. Every step leaves evidence (D-079)
  {
    const s = pres.addSlide();
    s.background = { color: C.white };
    lightTitle(s, 'Every step leaves evidence', PART3);
    // The Audit tab: the side panel of the 1920×1080 capture.
    const pw = await screenCrop(s, '13-audit', { left: 1482, top: 66, width: 438, height: 560 }, M, 1.7, 5.1);
    const rx = M + pw + 0.7;
    const rw = W - M - rx;
    const rows = [
      ['Layers', C.signal, 'Grouped by stage', 'Detect, diagnose, decide, recover, document: each stage with its own evidence.'],
      ['Wrench', HUE.fixer, 'Every tool call, with its result', 'What each agent asked for, what it got back, and when.'],
      ['ShieldCheck', HUE.guardian, 'Every policy check and human decision', 'Which rule passed, failed, or needed a person, and who decided.'],
      ['Link', C.ok, 'Tamper-evident', 'Each record is chained to the one before it. Editing or deleting one breaks the chain.'],
      ['Download', C.ink2, 'Exportable for your auditors', 'One click gives the full trail with its chain, as a file.'],
    ];
    for (let i = 0; i < rows.length; i++) {
      const [ic, hue, head, body] = rows[i];
      const y = 1.75 + i * 1.0;
      await iconDisc(s, ic, rx, y, 0.56, hue);
      text(s, head, { x: rx + 0.8, y: y - 0.02, w: rw - 0.8, h: 0.36, fontSize: 17, bold: true });
      text(s, body, { x: rx + 0.8, y: y + 0.36, w: rw - 0.8, h: 0.55, fontSize: 13, color: C.ink2 });
    }
    s.addNotes('Every stage leaves evidence: tool calls with their results, policy checks, human decisions. The records are chained, so a changed record shows. In production the chain would be anchored in an append-only store.');
  }

  // 17. Same night, two timelines
  {
    const s = pres.addSlide();
    s.background = { color: C.white };
    lightTitle(s, 'Same night, two timelines', PART4, { w: CW - 1.6 });
    illustrativeTag(s, W - M - 1.3, 0.8);
    const lx = M + 2.0;
    const lw = W - M - lx - 0.2;
    const t0 = clockMin('02:00');
    const t1 = clockMin('03:00');
    const X = (c) => lx + ((clockMin(c) - t0) / (t1 - t0)) * lw;
    const lanes = [
      { name: 'Manual response', y: 3.0, color: C.ink3, end: '02:55', span: '48 min', entries: split.manual.filter((_, i) => [0, 2, 4, 6, 7].includes(i)) },
      { name: 'Agent squad', y: 5.35, color: C.signal, end: '02:11', span: '4 min', entries: split.squad.filter((_, i) => [0, 1, 4].includes(i)) },
    ];
    for (const lane of lanes) {
      text(s, lane.name, { x: M, y: lane.y - 0.22, w: 1.9, h: 0.45, fontSize: 16, bold: true, color: lane.color === C.signal ? C.signal : C.ink });
      s.addShape('line', { x: lx, y: lane.y, w: lw, h: 0, line: { color: C.line, width: 1.5 } });
      s.addShape('rect', { x: X('02:07'), y: lane.y - 0.14, w: X(lane.end) - X('02:07'), h: 0.28, fill: { color: lane.color }, line: { color: lane.color, width: 0 } });
      text(s, lane.span, { x: X(lane.end) + 0.12, y: lane.y - 0.3, w: 1.8, h: 0.6, fontFace: F.head, fontSize: 28, bold: true, color: lane.color === C.signal ? C.signal : C.ink, valign: 'middle' });
      if (lane.span === '4 min') {
        // The squad's milestones sit too close together to label on the axis.
        text(s, lane.entries.map((e, i) => ({ text: `${e.clock.slice(0, 5)}  ${e.label}`, options: { breakLine: i < lane.entries.length - 1 } })), {
          x: X(lane.end) + 1.6, y: lane.y + 0.2, w: 4.2, h: 0.8, fontSize: 11, valign: 'top', color: C.ink2,
        });
        continue;
      }
      lane.entries.forEach((e, i) => {
        const x = X(e.clock);
        const up = i % 2 === 0;
        text(s, [{ text: e.clock.slice(0, 5), options: { fontFace: F.mono, color: C.ink3, breakLine: true } }, { text: e.label, options: { color: C.ink2 } }], {
          x: x - 0.75, y: up ? lane.y - 1.05 : lane.y + 0.22, w: 1.5, h: 0.8, fontSize: 10, align: 'center', valign: up ? 'bottom' : 'top',
        });
      });
    }
    for (const c of ['02:00', '02:15', '02:30', '02:45', '03:00']) {
      text(s, c, { x: X(c) - 0.4, y: 6.55, w: 0.8, h: 0.28, fontFace: F.mono, fontSize: 11, color: C.ink3, align: 'center' });
    }
    text(s, FOOTNOTE, { x: M, y: 6.95, w: CW, h: 0.3, fontSize: 11, color: C.ink3 });
    s.addNotes('Same alert, same fix. The squad has mitigated before the manual response has even opened a dashboard.');
  }

  // 18. The outcome
  {
    const s = pres.addSlide();
    s.background = { color: C.white };
    lightTitle(s, 'Minutes, not most of an hour', PART4, { w: CW - 1.6 });
    illustrativeTag(s, W - M - 1.3, 0.8);
    const rows = scenario.scorecard.filter((r) => ['Time to engage', 'Time to root cause', 'Time to mitigate'].includes(r.measure));
    const labels = rows.map((r) => r.measure);
    const round1 = (v) => Math.round(v * 10) / 10;
    s.addChart(
      pres.charts.BAR,
      [
        { name: 'Manual', labels, values: rows.map((r) => round1(r.manualMinutes)) },
        { name: 'Squad', labels, values: rows.map((r) => round1(r.squadMinutes)) },
      ],
      {
        x: M, y: 1.65, w: 8.1, h: 4.75, barDir: 'bar', barGrouping: 'clustered', barGapWidthPct: 60,
        chartColors: ['6E7A8D', '2F4BDB'],
        showTitle: true, title: 'Minutes (illustrative)', titleFontFace: F.body, titleFontSize: 14, titleColor: C.ink2,
        showValue: true, dataLabelPosition: 'outEnd', dataLabelFontFace: F.body, dataLabelFontSize: 12, dataLabelColor: C.ink, dataLabelFormatCode: 'General',
        showLegend: true, legendPos: 'b', legendFontFace: F.body, legendFontSize: 12, legendColor: C.ink2,
        catAxisLabelColor: C.ink2, catAxisLabelFontFace: F.body, catAxisLabelFontSize: 12, catAxisOrientation: 'maxMin',
        valAxisLabelColor: C.ink3, valAxisLabelFontSize: 11, valAxisMinVal: 0,
        valGridLine: { color: 'E6EAF0', size: 0.75 }, catGridLine: { style: 'none' },
      },
    );
    const x = M + 8.1 + 0.5;
    const w = W - M - x;
    text(s, '6 → 1', { x, y: 1.9, w, h: 1.0, fontFace: F.head, fontSize: 56, bold: true, color: C.signal });
    text(s, 'People woken up', { x, y: 2.9, w, h: 0.45, fontSize: 18, bold: true });
    text(s, '30 s', { x, y: 3.7, w, h: 1.0, fontFace: F.head, fontSize: 56, bold: true, color: C.signal });
    text(s, 'Human time: one approval', { x, y: 4.7, w, h: 0.45, fontSize: 18, bold: true });
    text(s, 'In the live run these figures are measured from the run itself.', { x, y: 5.3, w, h: 0.8, fontSize: 13, color: C.ink2 });
    text(s, FOOTNOTE, { x: M, y: 6.75, w: CW, h: 0.3, fontSize: 12, color: C.ink3 });
    s.addNotes("These numbers are illustrative for this scenario. In the live demo the squad's figures come from the run you just watched. In a pilot we'd baseline your own incidents first.");
  }

  // 19. Sanctioned by design: the answer to shadow AI (D-079)
  {
    const s = pres.addSlide();
    s.background = { color: C.white };
    lightTitle(s, 'The answer to shadow AI is a better sanctioned path', PART4);
    // Left: the 2 AM workaround, in the night palette.
    const lw = 4.6;
    s.addShape('roundRect', { x: M, y: 1.75, w: lw, h: 4.9, rectRadius: 0.12, fill: { color: N.bg }, line: { color: N.bg, width: 0 } });
    text(s, '02:36 · #inc-checkout', { x: M + 0.35, y: 2.0, w: lw - 0.7, h: 0.3, fontFace: F.mono, fontSize: 12, color: N.ink3 });
    text(s, '“Pasted the stack trace into a public AI chatbot. It says add DB connections.”', {
      x: M + 0.35, y: 2.45, w: lw - 0.7, h: 1.5, fontSize: 18, bold: true, color: N.ink,
    });
    const risks = ['Production logs, possibly with customer data, leave the company', 'The advice is wrong: the database was healthy', 'No record of what was shared, or what was done with the answer'];
    risks.forEach((r, i) => {
      text(s, r, { x: M + 0.35, y: 4.15 + i * 0.75, w: lw - 0.7, h: 0.65, fontSize: 14, color: N.red, bullet: true });
    });
    // Right: what the squad does instead.
    const rx = M + lw + 0.6;
    const rw = W - M - rx;
    const tiles = [
      ['ShieldCheck', C.ok, 'Approved models only', 'Claude on Amazon Bedrock, in your own cloud account and region.'],
      ['UserRound', C.signal, 'A named job for every agent', 'Each agent has a role, granted tools, and nothing more.'],
      ['FileWarning', C.caution, 'Untrusted text stays data', 'Logs and tickets are evidence, never instructions.'],
      ['ScrollText', C.ink2, 'Everything on the record', 'Every call, check, and decision, chained and exportable.'],
    ];
    const tw = (rw - 0.3) / 2;
    for (let i = 0; i < tiles.length; i++) {
      const [ic, hue, head, body] = tiles[i];
      const x = rx + (i % 2) * (tw + 0.3);
      const y = 1.75 + Math.floor(i / 2) * 2.0;
      card(s, x, y, tw, 1.75, { fill: C.paper, line: C.paper });
      await iconDisc(s, ic, x + 0.25, y + 0.25, 0.56, hue);
      text(s, head, { x: x + 0.25, y: y + 0.92, w: tw - 0.5, h: 0.36, fontSize: 16, bold: true });
      text(s, body, { x: x + 0.25, y: y + 1.26, w: tw - 0.5, h: 0.45, fontSize: 12, color: C.ink2 });
    }
    text(s, 'People reach for AI at 2 AM either way. Make the governed path the faster one.', {
      x: rx, y: 5.9, w: rw, h: 0.7, fontSize: 16, bold: true, color: C.signal,
    });
    s.addNotes('People will use AI at two in the morning whether we plan for it or not. The answer is not a ban, it is a sanctioned path that is faster than the workaround.');
  }

  // 20. Where this sits in our AI journey
  {
    const s = pres.addSlide();
    s.background = { color: C.white };
    lightTitle(s, 'Where this sits in our AI journey', PART4);
    const stages = [
      { name: 'Explore', def: 'Pilots and sandboxes to learn what works.' },
      { name: 'Assist', def: 'Copilots help people inside their tools.' },
      { name: 'Automate', def: 'Defined steps run end to end.' },
      { name: 'Governed autonomy', def: 'Agent teams act within policy, with human gates.' },
    ];
    const cw = 2.8;
    const gap = (CW - 4 * cw) / 3;
    const base = 6.9;
    for (let i = 0; i < 4; i++) {
      const hgt = 2.45 + i * 0.65;
      const x = M + i * (cw + gap);
      const y = base - hgt;
      const hi = i === 3;
      card(s, x, y, cw, hgt, { fill: hi ? C.signalWash : C.paper, line: hi ? C.signal : C.paper, lineWidth: hi ? 2.25 : 1 });
      text(s, stages[i].name, { x: x + 0.25, y: y + 0.2, w: cw - 0.5, h: 0.75, fontFace: F.head, fontSize: 20, bold: true, color: hi ? C.signal : C.ink, valign: 'bottom' });
      text(s, stages[i].def, { x: x + 0.25, y: y + 1.05, w: cw - 0.5, h: 0.65, fontSize: 14, color: C.ink2 });
      text(s, '{{PRESENTER: add 1–2 of our live use cases}}', { x: x + 0.25, y: y + 1.75, w: cw - 0.5, h: 0.55, fontSize: 12, italic: true, color: C.caution });
    }
    text(s, "Tonight's squad", { x: M + 3 * (cw + gap), y: base - (2.45 + 3 * 0.65) - 0.45, w: cw, h: 0.35, fontSize: 14, bold: true, color: C.signal });
    s.addNotes("Tonight's squad lives in the fourth stage, and it only works because the first three are in place: data access, tooling, and governance.");
  }

  // 21. Where agents fit first
  {
    const s = pres.addSlide();
    s.background = { color: C.white };
    lightTitle(s, 'Where agents fit first', PART4);
    const gx = M + 1.3;
    const gy = 1.75;
    const gw = 7.2;
    const gh = 4.6;
    const half = (v) => v / 2;
    const quads = [
      [0, 0, 'Keep human-led', C.cautionWash],
      [1, 0, 'Agents with human gates', C.paper],
      [0, 1, 'Assist, do not automate', C.paper],
      [1, 1, 'Start here', C.okWash],
    ];
    quads.forEach(([qx, qy, label, color]) => {
      const x = gx + qx * half(gw);
      const y = gy + qy * half(gh);
      s.addShape('rect', { x, y, w: half(gw), h: half(gh), fill: { color }, line: { color: C.white, width: 2 } });
      text(s, label, { x: x + 0.15, y: y + 0.12, w: half(gw) - 0.3, h: 0.35, fontSize: 12, bold: true, color: C.ink2 });
    });
    text(s, 'Process repeatability: low to high', { x: gx, y: gy + gh + 0.1, w: gw, h: 0.35, fontSize: 12, color: C.ink2, align: 'center' });
    text(s, 'Risk of a wrong action: low to high', { x: gx - 0.5 - gh / 2, y: gy + gh / 2 - 0.2, w: gh, h: 0.4, fontSize: 12, color: C.ink2, align: 'center', valign: 'middle', rotate: 270 });
    const items = [
      ['Incident triage (gated)', 0.8, 0.58],
      ['Code modernization', 0.9, 0.72],
      ['RFP drafting', 0.52, 0.2],
      ['Payments changes', 0.18, 0.86],
    ];
    items.forEach(([label, rx, ry]) => {
      const cx = gx + rx * gw;
      const cy = gy + (1 - ry) * gh;
      s.addShape('ellipse', { x: cx - 0.1, y: cy - 0.1, w: 0.2, h: 0.2, fill: { color: C.signal }, line: { color: C.white, width: 1.5 } });
      const lw = 2.1;
      const left = rx > 0.7;
      text(s, label, { x: left ? cx - lw - 0.15 : cx + 0.15, y: cy - 0.17, w: lw, h: 0.34, fontSize: 13, bold: true, align: left ? 'right' : 'left' });
    });
    const x = gx + gw + 0.55;
    const w = W - M - x;
    text(s, 'Start where the work is repeatable and actions are reversible.', { x, y: 2.1, w, h: 1.1, fontSize: 18, bold: true });
    text(s, 'Keep humans leading where mistakes are costly or irreversible.', { x, y: 3.3, w, h: 1.1, fontSize: 16, color: C.ink2 });
    s.addNotes('Start where the work is repeatable and actions are reversible. Keep humans leading where mistakes are costly or irreversible.');
  }

  // 22. A pilot, not a promise
  {
    const s = pres.addSlide();
    s.background = { color: C.white };
    lightTitle(s, 'Proposed next step: a six-week pilot', PART4, { w: CW - 1.6 });
    s.addText('Proposal', {
      shape: 'roundRect', rectRadius: 0.5, x: W - M - 1.3, y: 0.8, w: 1.3, h: 0.34, fontFace: F.body, fontSize: 12, bold: true,
      color: C.caution, fill: { color: C.cautionWash }, line: { color: C.caution, width: 1 }, align: 'center', valign: 'middle', margin: 0, isTextBox: true,
    });
    const phases = [
      ['Weeks 1–2', 'Pick one workflow and capture its policies'],
      ['Weeks 3–4', 'Build on your data in shadow mode'],
      ['Weeks 5–6', 'Go live with human gates'],
      ['End', 'Measure against your baseline'],
    ];
    const pw = 2.75;
    const gap = (CW - 4 * pw) / 3;
    phases.forEach(([when, what], i) => {
      const x = M + i * (pw + gap);
      card(s, x, 2.2, pw, 2.4, { fill: i === 3 ? C.okWash : C.paper, line: i === 3 ? C.ok : C.paper });
      text(s, when, { x: x + 0.25, y: 2.45, w: pw - 0.5, h: 0.4, fontFace: F.mono, fontSize: 16, bold: true, color: i === 3 ? C.ok : C.signal });
      text(s, what, { x: x + 0.25, y: 2.95, w: pw - 0.5, h: 1.4, fontSize: 18, bold: true });
      if (i < 3) arrow(s, x + pw + 0.06, 3.4, x + pw + gap - 0.06, 3.4);
    });
    text(s, 'Shadow mode first: the squad investigates alongside your team and changes nothing until you trust it.', {
      x: M, y: 5.2, w: CW, h: 0.9, fontSize: 18, color: C.ink2,
    });
    s.addNotes('Six weeks, one workflow, shadow mode first, then human gates, then measured against your own baseline.');
  }

  // 23. Dawn
  {
    const s = pres.addSlide();
    s.background = { data: dawn };
    text(s, 'Let the squad take the first shift.', { x: M, y: 1.3, w: 10.5, h: 1.2, fontFace: F.head, fontSize: 48, bold: true, color: N.ink });
    text(s, 'People keep the last word.', { x: M, y: 2.5, w: 10.5, h: 0.7, fontSize: 28, color: N.ink });
    text(s, 'Where would you want a squad like this first?', { x: M, y: 3.6, w: 10.5, h: 0.6, fontSize: 22, bold: true, color: 'FFE2A8' });
    text(s, `${ORG} for ${CLIENT}`, { x: M, y: 4.4, w: 10.5, h: 0.4, fontSize: 14, color: N.ink2 });
    s.addNotes('Ask the question, then stop talking.');
  }

  return pres;
}

// ================================================================ TECHNICAL DECK (DECK §5)
async function technical() {
  const pres = newDeck('Night Shift: technical appendix');
  const code = (s, lines, o) =>
    s.addText(lines.join('\n'), { fontFace: F.mono, fontSize: 11, color: C.ink, fill: { color: C.stage }, margin: 0.15, valign: 'top', isTextBox: true, ...o });
  const box = (s, x, y, w, h, label, o = {}) =>
    s.addText(label, {
      shape: 'roundRect', rectRadius: 0.08, x, y, w, h, fontFace: F.body, fontSize: o.fontSize ?? 13, bold: o.bold ?? false, color: o.color ?? C.ink,
      fill: { color: o.fill ?? C.white }, line: { color: o.line ?? C.line, width: o.lineWidth ?? 1 }, align: 'center', valign: 'middle', margin: 0.05, isTextBox: true,
    });

  // 1. Architecture
  {
    const s = pres.addSlide();
    s.background = { color: C.white };
    title(s, 'Architecture');
    card(s, M, 1.5, 5.6, 4.3, { fill: C.paper, line: C.paper });
    text(s, 'Browser (apps/web)', { x: M + 0.25, y: 1.62, w: 5, h: 0.35, fontSize: 14, bold: true, color: C.ink2 });
    box(s, M + 0.3, 2.1, 5.0, 0.55, 'UI components');
    box(s, M + 0.3, 2.85, 5.0, 0.55, 'Zustand store');
    box(s, M + 0.3, 3.6, 5.0, 0.55, 'Stage reducer and player (packages/engine)');
    box(s, M + 0.3, 4.35, 2.4, 0.9, 'ScriptedSource\nengine player', { fill: C.white });
    box(s, M + 2.9, 4.35, 2.4, 0.9, 'LiveSource\nholds live beats', { fill: C.signalWash, line: C.signal });
    const sx = 7.0;
    const sw = W - M - sx;
    card(s, sx, 1.5, sw, 4.3, { fill: C.paper, line: C.paper });
    text(s, 'Server (apps/server: Fastify locally, Lambda on AWS)', { x: sx + 0.25, y: 1.62, w: sw - 0.4, h: 0.35, fontSize: 14, bold: true, color: C.ink2 });
    box(s, sx + 0.3, 2.1, sw - 0.6, 0.55, 'Segment API: POST /api/segments (SSE)');
    box(s, sx + 0.3, 2.85, sw - 0.6, 0.55, 'Director: runs live beats in parallel');
    box(s, sx + 0.3, 3.6, sw - 0.6, 0.55, 'Agent turn: tool loop, validators, fallback');
    box(s, sx + 0.3, 4.35, (sw - 0.8) / 2, 0.9, 'LlmProvider\nmock | Bedrock');
    box(s, sx + 0.5 + (sw - 0.8) / 2, 4.35, (sw - 0.8) / 2, 0.9, 'Fixture tools\npolicy engine');
    arrow(s, M + 5.35, 4.8, sx + 0.3, 2.4, C.signal);
    text(s, 'fetch stream', { x: 6.55, y: 4.0, w: 1.0, h: 0.3, fontSize: 11, color: C.signal });
    box(s, sx + 0.3, 6.1, sw - 0.6, 0.6, 'Amazon Bedrock: ConverseStream', { fill: C.signalWash, line: C.signal, bold: true });
    arrow(s, sx + 0.3 + (sw - 0.8) / 4, 5.25, sx + 0.3 + (sw - 0.8) / 4, 6.1);
    box(s, M, 6.1, 5.6, 0.6, 'packages/scenarios: scenario.json, agents.json, fixtures', { fill: C.white });
    s.addNotes(
      'Three modes, one stage. Scripted mode runs entirely in the browser: the engine plays the scenario, and the offline build is a single file. Live-mock sends the live beats through the real server path with a mock model, which is how we test live mode without AWS. Live-Bedrock swaps in Claude on Amazon Bedrock. The UI never knows which mode produced an event.',
    );
  }

  // 2. Directed autonomy
  {
    const s = pres.addSlide();
    s.background = { color: C.white };
    title(s, 'Directed autonomy');
    const cols = [
      {
        head: 'Live, from the model', color: C.signal, fill: C.signalWash,
        items: ['The words of ten live beats', 'Tool calls and their arguments', 'The root-cause statement', 'The status update and postmortem'],
      },
      {
        head: 'Fixed, by the script and code', color: C.ink, fill: C.paper,
        items: ['Acts, timing, and the story clock', 'Gates and who decides', 'Policy outcomes, from the policy engine', 'Every number, grounded in fixtures'],
      },
    ];
    const cw = (CW - 0.5) / 2;
    cols.forEach((c, i) => {
      const x = M + i * (cw + 0.5);
      card(s, x, 1.55, cw, 3.55, { fill: c.fill, line: c.fill });
      text(s, c.head, { x: x + 0.3, y: 1.75, w: cw - 0.6, h: 0.45, fontSize: 20, bold: true, color: c.color });
      text(
        s,
        c.items.map((t, j) => ({ text: t, options: { bullet: true, breakLine: j < c.items.length - 1 } })),
        { x: x + 0.3, y: 2.35, w: cw - 0.6, h: 2.6, fontSize: 16, paraSpaceAfter: 8 },
      );
    });
    card(s, M, 5.35, CW, 1.3, { fill: C.white, line: C.line });
    text(s, [
      { text: 'Why: ', options: { bold: true } },
      { text: 'the story keeps its shape and its facts, while the words are real. Any live turn can fall back to its scripted line without the room noticing, so the demo never depends on the model or the network.' },
    ], { x: M + 0.3, y: 5.55, w: CW - 0.6, h: 0.95, fontSize: 15, color: C.ink2 });
    s.addNotes(
      'This is directed autonomy. The director keeps the acts, gates, and policy outcomes fixed. The model writes the words of the live beats, chooses tool arguments inside an allow-list, and summarizes results. That split is deliberate: policy decisions must be deterministic and auditable, and the story must survive a slow network. Everything the model writes is checked before anyone sees it.',
    );
  }

  // 3. Event protocol
  {
    const s = pres.addSlide();
    s.background = { color: C.white };
    title(s, 'One event protocol');
    const left = [
      '// Every event: { id, t, clock?, source, beat? }',
      '// source: "script" | "live" | "fallback"',
      '',
      'scene.start       { act, title, card? }',
      'scene.end         { act }',
      'clock.set         { clock, running }',
      'agent.state       { agent, state }',
      'thought           { agent, text, stream? }',
      'tool.call         { agent, callId, tool, args }',
      'tool.result       { agent, callId, summary, payload? }',
      'message.send      { from, to, label, showLabel? }',
      'metric.update     { series, to, durationMs }',
      'stage.alert       { severity }',
      'severity.set      { value }',
    ];
    const right = [
      'evidence.pin      { cardId, agent, text }',
      'evidence.conclude { cardIds, text, confidence }',
      'options.show      { agent, recommended, options[] }',
      'guardrail.check   { policyId, description,',
      '                    result, reason }',
      'gate.request      { gateId, title, summary,',
      '                    evidenceRefs, labels, footer? }',
      'gate.resolve      { gateId, decision, by }',
      'progress.update   { agent, label, current, total }',
      'timelapse         { label, advanceClockSec }',
      'permission.denied { agent, tool }',
      'audit             { severity, text, agent? }',
      'artifact.create   { artifactId, type, title, markdown }',
      'chaos.start | chaos.end | scorecard.show',
    ];
    const cw = (CW - 0.3) / 2;
    code(s, left, { x: M, y: 1.5, w: cw, h: 3.95, fontSize: 12.5 });
    code(s, right, { x: M + cw + 0.3, y: 1.5, w: cw, h: 3.95, fontSize: 12.5 });
    text(s, 'One stream for scripted and live. The reducer is pure; the audit trail is derived from events. The UI only consumes events and never branches on mode.', {
      x: M, y: 5.75, w: CW, h: 0.8, fontSize: 16, color: C.ink2,
    });
    s.addNotes(
      'This is the whole contract between the engine, the server, and the stage. Scripted playback and live mode produce exactly these events; the only difference is the source tag, which drives the subtle scripted marker on fallback lines. Because the reducer is pure, any moment of the demo can be reached by replaying events, which is how seek, step, and the deck screenshots work.',
    );
  }

  // 4. Agent turn lifecycle
  {
    const s = pres.addSlide();
    s.background = { color: C.white };
    title(s, 'Agent turn lifecycle');
    const steps = [
      ['Prompt', 'Rules, persona, grounded facts, context'],
      ['Stream', 'ConverseStream, 600-token cap'],
      ['Tool loop', 'Up to 3 rounds, fixture tools, grants checked'],
      ['Validate', 'SCENARIO §9 rules, number grounding, policy agreement'],
      ['Emit', 'Live beat with live tool calls'],
    ];
    const bw = 2.15;
    const gap = (CW - 5 * bw) / 4;
    const y = 1.8;
    steps.forEach(([h, d], i) => {
      const x = M + i * (bw + gap);
      const last = i === 4;
      card(s, x, y, bw, 1.9, { fill: last ? C.okWash : C.paper, line: last ? C.ok : C.paper });
      text(s, h, { x: x + 0.2, y: y + 0.2, w: bw - 0.4, h: 0.4, fontSize: 17, bold: true, color: last ? C.ok : C.ink });
      text(s, d, { x: x + 0.2, y: y + 0.65, w: bw - 0.4, h: 1.15, fontSize: 13, color: C.ink2 });
      if (i < 4) arrow(s, x + bw + 0.04, y + 0.95, x + bw + gap - 0.04, y + 0.95);
    });
    const vx = M + 3 * (bw + gap);
    arrow(s, vx + bw / 2, y + 1.9, vx + bw / 2, 4.35, C.alert);
    card(s, vx - 1.5, 4.35, bw + 3.0, 1.0, { fill: C.alertWash, line: C.alert });
    text(s, 'Fall back: the scripted beat, marked "scripted"', { x: vx - 1.3, y: 4.5, w: bw + 2.6, h: 0.7, fontSize: 14, bold: true, color: C.alert, align: 'center' });
    const chips = ['Turn timeout 9 s', 'Client stall 4 s', 'Validated before anything is shown', '3 turns in parallel'];
    chips.forEach((c, i) => {
      s.addText(c, {
        shape: 'roundRect', rectRadius: 0.5, x: M + i * 3.07, y: 5.85, w: 2.85, h: 0.45, fontFace: F.body, fontSize: 13, color: C.ink2,
        fill: { color: C.white }, line: { color: C.line, width: 1 }, align: 'center', valign: 'middle', margin: 0, isTextBox: true,
      });
    });
    s.addNotes(
      'Each live beat is one turn. We build the prompt from global rules, the persona, and facts taken from fixtures. The model streams, may call up to three rounds of fixture tools, and then the whole output is validated: content rules, sentence limits, every number grounded, and Guardian must agree with the policy engine. Only then is it sent. Any failure, timeout, or error plays the scripted line instead.',
    );
  }

  // 5. Guardrails
  {
    const s = pres.addSlide();
    s.background = { color: C.white };
    title(s, 'Guardrails');
    const head = (t) => ({ text: t, options: { bold: true, color: C.ink2, fill: { color: C.paper } } });
    const polRows = [
      [head('Policy'), head('Rule'), head('Applies to')],
      ...policies.policies.map((p) => [
        { text: p.id, options: { fontFace: F.mono } },
        p.title,
        p.appliesTo.map((a) => a.split('.')[1] ?? a).join(', '),
      ]),
    ];
    s.addTable(polRows, {
      x: M, y: 1.5, w: 6.6, colW: [0.8, 3.6, 2.2], fontFace: F.body, fontSize: 12, color: C.ink, border: { type: 'solid', color: C.line, pt: 0.75 },
      rowH: 0.42, valign: 'middle', margin: 0.06,
    });
    const access = { read: 'R', write: 'W', approval: 'A' };
    const toolRows = [
      [head('Agent'), head('Tools (R read, W write, A needs approval)')],
      ...agentsFile.agents
        .filter((a) => a.id !== 'human')
        .map((a) => [a.name, { text: a.tools.map((t) => `${t.name} ${access[t.access]}`).join(', '), options: { fontFace: F.mono, fontSize: 9.5 } }]),
    ];
    s.addTable(toolRows, {
      x: M + 6.9, y: 1.5, w: CW - 6.9, colW: [1.6, CW - 6.9 - 1.6], fontFace: F.body, fontSize: 11, color: C.ink, border: { type: 'solid', color: C.line, pt: 0.75 },
      rowH: 0.42, valign: 'middle', margin: 0.06,
    });
    text(s, [
      { text: 'db.alter is granted to no agent. ', options: { bold: true } },
      { text: 'Optional Bedrock Guardrail filters content; the policy engine controls actions. Every tool call, policy check, gate, and denial is written to the audit trail.' },
    ], { x: M, y: 5.6, w: CW, h: 0.85, fontSize: 15, color: C.ink2 });
    s.addNotes(
      'Two independent controls. On the left, policies are data evaluated by code, so Guardian’s results are deterministic and testable; the model only explains them. On the right, each agent has an explicit tool grant; approval tools also need an approved gate on the decision path. The database tool exists only to prove it is refused. A Bedrock Guardrail can be added for content filtering.',
    );
  }

  // 6. Security and IAM
  {
    const s = pres.addSlide();
    s.background = { color: C.white };
    title(s, 'Security and IAM');
    const cards = [
      ['KeyRound', 'Least-privilege Bedrock', 'InvokeModel only on the configured model and inference-profile ARNs. No wildcard models.'],
      ['MonitorX', 'No credentials in the browser', 'AWS credentials stay server-side, from the default provider chain. Model IDs are masked.'],
      ['Lock', 'Private origins', 'CloudFront OAC to a private bucket and to an IAM-authenticated Function URL.'],
      ['Shield', 'Optional passcode', 'SSM SecureString, read at cold start, fails closed.'],
      ['Database', 'Data boundaries', 'Prompts contain fixture data only. No client data enters the demo.'],
      ['FileCheck', 'Validated inputs', 'zod on every request, 16 KB body limit, 8 KB context cap.'],
    ];
    const cw = (CW - 2 * 0.35) / 3;
    const ch = 2.3;
    for (let i = 0; i < cards.length; i++) {
      const x = M + (i % 3) * (cw + 0.35);
      const y = 1.55 + Math.floor(i / 3) * (ch + 0.35);
      card(s, x, y, cw, ch, { fill: C.paper, line: C.paper });
      await iconDisc(s, cards[i][0], x + 0.25, y + 0.25, 0.55, HUE.guardian);
      text(s, cards[i][1], { x: x + 0.25, y: y + 0.95, w: cw - 0.5, h: 0.4, fontSize: 16, bold: true });
      text(s, cards[i][2], { x: x + 0.25, y: y + 1.38, w: cw - 0.5, h: 0.85, fontSize: 13, color: C.ink2 });
    }
    s.addNotes(
      'Nothing AWS-related ships to the browser: credentials come from the default provider chain on the server. The Lambda role can invoke only the configured models, apply only the configured guardrail, and read only the passcode parameter. CloudFront is the only way in, through origin access control. Prompts carry fixture data only, and every input is validated with size limits.',
    );
  }

  // 7. Operations and cost controls
  {
    const s = pres.addSlide();
    s.background = { color: C.white };
    title(s, 'Operations and cost controls');
    code(
      s,
      [
        '{ "msg": "turn",',
        '  "segment": "main", "beat": "a3.b12",',
        '  "agent": "log-detective",',
        '  "modelId": "eu.a…:0",',
        '  "latencyMs": 1840,',
        '  "inputTokens": 912, "outputTokens": 38,',
        '  "toolCalls": 1,',
        '  "outcome": "live" }',
      ],
      { x: M, y: 1.55, w: 5.6, h: 2.9, fontSize: 12 },
    );
    text(s, 'One structured log line per turn; a fallback adds fallbackReason. Values shown are an example.', { x: M, y: 4.6, w: 5.6, h: 0.7, fontSize: 12, color: C.ink3 });
    const items = [
      ['Reserved concurrency 5', 'A hard ceiling on parallel Lambda work'],
      ['600 output tokens per turn', 'Short turns by design; about a dozen per run'],
      ['9 s turn timeout', 'Slow turns fall back instead of holding the room'],
      ['Budget alarm', 'Optional AWS Budgets alert at 80% and 100%'],
    ];
    const x = M + 6.1;
    const w = W - M - x;
    items.forEach(([h, d], i) => {
      const y = 1.55 + i * 1.2;
      card(s, x, y, w, 1.02, { fill: C.paper, line: C.paper });
      text(s, h, { x: x + 0.25, y: y + 0.14, w: w - 0.5, h: 0.38, fontSize: 16, bold: true });
      text(s, d, { x: x + 0.25, y: y + 0.52, w: w - 0.5, h: 0.4, fontSize: 13, color: C.ink2 });
    });
    s.addNotes(
      'Operations are simple on purpose. Every model turn writes one JSON log line with latency, tokens, tool calls, and whether it fell back and why. Cost is capped several ways: reserved concurrency, a token cap per turn, a turn timeout, and an optional budget alarm. A full live run is about a dozen short turns.',
    );
  }

  // 8. Extending
  {
    const s = pres.addSlide();
    s.background = { color: C.white };
    title(s, 'Extending');
    text(s, 'Add a scenario in four steps', { x: M, y: 1.5, w: 6.5, h: 0.45, fontSize: 20, bold: true });
    const steps = [
      'Copy packages/scenarios/incident-checkout',
      'Write the script in docs/SCENARIO-<name>.md',
      'Update agents, fixtures, policies, and validators',
      'Register it; open it with ?scenario=<name>',
    ];
    steps.forEach((t, i) => {
      const y = 2.15 + i * 0.95;
      s.addText(String(i + 1), {
        shape: 'ellipse', x: M, y, w: 0.55, h: 0.55, fill: { color: C.signal }, line: { color: C.signal, width: 0 },
        fontFace: F.body, fontSize: 16, bold: true, color: C.white, align: 'center', valign: 'middle', margin: 0, isTextBox: true,
      });
      text(s, t, { x: M + 0.8, y: y + 0.08, w: 5.7, h: 0.5, fontSize: 16, fontFace: /packages|docs/.test(t) ? F.body : F.body });
    });
    const x = M + 7.0;
    const w = W - M - x;
    card(s, x, 1.5, w, 4.9, { fill: C.paper, line: C.paper });
    text(s, 'Roadmap', { x: x + 0.3, y: 1.7, w: w - 0.6, h: 0.45, fontSize: 20, bold: true });
    const road = [
      ['Real integrations', 'Monitoring, Git, and deploy tools behind the same tool interfaces'],
      ['Approvals where people work', 'Human gates in Teams or Slack'],
      ['Evaluation harness', 'Score live turns against the validators at scale'],
    ];
    road.forEach(([h, d], i) => {
      const y = 2.35 + i * 1.3;
      text(s, h, { x: x + 0.3, y, w: w - 0.6, h: 0.4, fontSize: 16, bold: true });
      text(s, d, { x: x + 0.3, y: y + 0.42, w: w - 0.6, h: 0.75, fontSize: 14, color: C.ink2 });
    });
    s.addNotes(
      'The engine is scenario-agnostic. A new scenario is a new script, agents file, fixtures, policies, and validators; the stage and live path stay the same. Next steps would be real integrations behind the existing tool interfaces, human gates in the tools people already use, and an evaluation harness that scores live turns at scale.',
    );
  }

  return pres;
}

// ---------------------------------------------------------------- write
mkdirSync(OUT, { recursive: true });
// ================================================================ PATTERNS SLIDE (DECK §6)
async function patterns() {
  const pres = newDeck('Why it is agentic, and where else it fits');
  const s = pres.addSlide();
  s.background = { color: C.white };
  title(s, 'Why it is agentic, and where else it fits');
  text(s, 'Automation follows fixed steps. A chatbot answers questions. An agent squad pursues a goal: it plans, uses tools, acts within limits, and adapts.', {
    x: M, y: 1.1, w: CW, h: 0.6, fontSize: 15, color: C.ink2,
  });

  // Left: what makes it agentic, each trait backed by what the demo shows.
  const LW = 4.75;
  text(s, 'What makes it agentic', { x: M, y: 1.8, w: LW, h: 0.35, fontSize: 14, bold: true, color: C.ink2 });
  const traits = [
    ['Target', HUE.orchestrator, 'Starts from a goal, not a script', 'Given a symptom, the Orchestrator decides which questions to ask.'],
    ['Network', HUE['log-detective'], 'Divides the work', 'Specialists investigate in parallel; the Orchestrator combines their findings.'],
    ['Wrench', HUE.fixer, 'Uses real tools', 'Agents query metrics, logs, deploys, and diffs, and cite what they found.'],
    ['ShieldCheck', HUE.guardian, 'Acts within limits', 'Every action is checked against policy. Production changes wait for a person.'],
    ['GitBranch', HUE['code-archaeologist'], 'Adapts', 'A rejected plan gets a new one. An agent that overreaches is blocked.'],
  ];
  for (let i = 0; i < traits.length; i++) {
    const [ic, hue, head, body] = traits[i];
    const y = 2.3 + i * 0.86;
    await iconDisc(s, ic, M, y, 0.5, hue);
    text(s, head, { x: M + 0.7, y: y - 0.03, w: LW - 0.7, h: 0.3, fontSize: 14, bold: true });
    text(s, body, { x: M + 0.7, y: y + 0.28, w: LW - 0.7, h: 0.5, fontSize: 11.5, color: C.ink2 });
  }

  // Right: the reusable loop, then the same loop in other workflows.
  const RX = M + LW + 0.5;
  const RW = W - M - RX;
  text(s, 'The reusable loop', { x: RX, y: 1.8, w: RW, h: 0.35, fontSize: 14, bold: true, color: C.ink2 });
  const steps = ['Detect', 'Plan', 'Investigate', 'Propose', 'Check', 'Approve', 'Act, record'];
  const sg = 0.12;
  const sw = (RW - (steps.length - 1) * sg) / steps.length;
  steps.forEach((st, i) => {
    const human = st === 'Approve';
    s.addText(st, {
      shape: 'roundRect', rectRadius: 0.2, x: RX + i * (sw + sg), y: 2.3, w: sw, h: 0.42, margin: 0, align: 'center', valign: 'middle',
      fontFace: F.body, fontSize: 11, bold: human, color: human ? C.caution : C.signal,
      fill: { color: human ? C.cautionWash : C.signalWash }, line: { color: human ? C.caution : C.signalWash, width: 1 }, isTextBox: true,
    });
  });
  text(s, 'Agents run every step except Approve, which is always a person.', { x: RX, y: 2.8, w: RW, h: 0.3, fontSize: 11, color: C.ink3 });

  const hd = (t) => ({ text: t, options: { bold: true, color: C.ink2, fill: { color: C.paper } } });
  const rows = [
    ['Security alert triage', 'A host is flagged as suspicious', 'Threat intel, log hunter, containment', 'Analyst approves isolating the host'],
    ['Card fraud spike', 'Declines jump in one region', 'Transaction analyst, rule tuner', 'Risk officer approves the rule change'],
    ['Cloud cost anomaly', 'Daily spend doubles overnight', 'Billing analyst, rightsizer', 'Service owner approves the change'],
    ['Supply disruption', 'A supplier misses a ship date', 'Inventory, logistics, sourcing', 'Planner approves new orders'],
    ['Insurance claim', 'A claim arrives with documents', 'Document reader, coverage checker', 'Adjuster approves payouts over a limit'],
    ['Legacy modernization', 'A module is picked for migration', 'Cartographer, translator, test forger', 'Tech lead approves the merge'],
  ];
  const cw = [1.75, 1.75, 1.95];
  cw.push(RW - cw.reduce((a, b) => a + b, 0));
  s.addTable(
    [
      [hd('Workflow'), hd('Trigger'), hd('Specialists (plus Guardian, Scribe)'), hd('Human gate')],
      ...rows.map(([w, t, sp, g]) => [{ text: w, options: { bold: true } }, t, sp, { text: g, options: { color: C.caution } }]),
    ],
    {
      x: RX, y: 3.25, w: RW, colW: cw, fontFace: F.body, fontSize: 11, color: C.ink, border: { type: 'solid', color: C.line, pt: 0.75 },
      rowH: 0.47, valign: 'middle', margin: 0.06,
    },
  );
  text(s, 'Workflows are illustrative examples of the pattern, not delivered case studies.', {
    x: M, y: 6.85, w: CW, h: 0.3, fontSize: 11, color: C.ink3,
  });
  s.addNotes(
    'Why is this agentic rather than automation? Nobody scripted the steps: the squad starts from a goal, splits it, uses tools, and adapts when a person says no or an agent oversteps. The loop on the right is what we reuse. Change the tools, the policies, and who approves, and the same squad shape fits security, fraud, cost, supply chain, claims, or modernization. Ask which of these looks most like their world.',
  );
  return pres;
}

const exec = await executive();
await exec.writeFile({ fileName: path.join(OUT, 'night-shift-executive.pptx') });
const tech = await technical();
await tech.writeFile({ fileName: path.join(OUT, 'night-shift-technical.pptx') });
const pat = await patterns();
await pat.writeFile({ fileName: path.join(OUT, 'night-shift-patterns.pptx') });
console.log(`Decks written to ${OUT}${FONT_SAFE ? ' (font-safe: Calibri)' : ''}`);
