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

for (const f of ['01-alert', '03-evidence', '05-gate', '06-recovery', '09-chaos']) {
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

// ================================================================ EXECUTIVE DECK (DECK §4)
async function executive() {
  const pres = newDeck('When the pager rings at 2 AM');

  // 1. Title
  {
    const s = pres.addSlide();
    s.background = { color: C.white };
    text(s, 'When the pager rings at 2 AM', { x: M, y: 1.1, w: 9.5, h: 1.2, fontFace: F.head, fontSize: 40, bold: true });
    text(s, 'Agentic AI in action, with people in charge', { x: M, y: 2.35, w: 9.5, h: 0.6, fontSize: 20, color: C.ink2 });
    text(s, `${ORG} for ${CLIENT}`, { x: M, y: 3.35, w: 9.5, h: 0.45, fontSize: 16, bold: true });
    text(s, [{ text: PRESENTER, options: { breakLine: true } }, { text: DATE }], { x: M, y: 3.85, w: 9.5, h: 0.7, fontSize: 14, color: C.ink2 });
    const crops = JSON.parse(readFileSync(path.join(SCREENS, 'crops.json'), 'utf8'));
    const band = crops.heartbeat;
    const strip = await sharp(path.join(SCREENS, '06-recovery.png'))
      .extract({ left: Math.round(band.x), top: Math.round(band.y), width: Math.round(band.width), height: Math.round(band.height) })
      .png()
      .toBuffer();
    const stripH = (W * band.height) / band.width;
    s.addImage({ data: `image/png;base64,${strip.toString('base64')}`, x: 0, y: H - stripH, w: W, h: stripH });
    s.addNotes("We'll show you a team of AI agents handling a real-shaped production incident. Watch what they do, and watch where they stop and ask a human.");
  }

  // 2. The shift
  {
    const s = pres.addSlide();
    s.background = { color: C.white };
    title(s, 'From answering questions to doing the work');
    const cols = [
      { icon: 'MessageSquare', head: 'Chat', sub: 'Answers questions', body: 'A person asks, the model answers. The person still does the work.' },
      { icon: 'Sparkles', head: 'Copilot', sub: 'Helps a person do a task', body: 'Drafts and suggests inside one tool, one step at a time.' },
      { icon: 'Network', head: 'Agent squad', sub: 'Runs a workflow', body: 'Specialists use tools, check policy, and ask a human for approval.' },
    ];
    const cw = 3.55;
    const gap = (CW - 3 * cw) / 2;
    for (let i = 0; i < 3; i++) {
      const x = M + i * (cw + gap);
      const y = 1.9;
      const hi = i === 2;
      card(s, x, y, cw, 3.9, { fill: hi ? C.signalWash : C.paper, line: hi ? C.signal : C.paper, lineWidth: hi ? 2 : 1 });
      await iconDisc(s, cols[i].icon, x + 0.35, y + 0.4, 0.85, hi ? C.signal : C.ink2);
      text(s, cols[i].head, { x: x + 0.35, y: y + 1.5, w: cw - 0.7, h: 0.5, fontFace: F.head, fontSize: 24, bold: true });
      text(s, cols[i].sub, { x: x + 0.35, y: y + 2.05, w: cw - 0.7, h: 0.4, fontSize: 16, bold: true, color: hi ? C.signal : C.ink2 });
      text(s, cols[i].body, { x: x + 0.35, y: y + 2.55, w: cw - 0.7, h: 1.1, fontSize: 16, color: C.ink2 });
      if (i < 2) arrow(s, x + cw + 0.08, y + 1.95, x + cw + gap - 0.08, y + 1.95);
    }
    s.addNotes('Most organisations are between the first two. The value, and the risk, is in the third.');
  }

  // 3. Adoption curve
  {
    const s = pres.addSlide();
    s.background = { color: C.white };
    title(s, 'Our AI adoption journey');
    const stages = [
      { name: 'Explore', def: 'Pilots and sandboxes to learn what works.' },
      { name: 'Assist', def: 'Copilots help people inside their tools.' },
      { name: 'Automate', def: 'Defined steps run end to end.' },
      { name: 'Governed autonomy', def: 'Agent teams act within policy, with human gates.' },
    ];
    const cw = 2.8;
    const gap = (CW - 4 * cw) / 3;
    const base = 6.85;
    for (let i = 0; i < 4; i++) {
      const hgt = 2.55 + i * 0.7;
      const x = M + i * (cw + gap);
      const y = base - hgt;
      const hi = i === 3;
      card(s, x, y, cw, hgt, { fill: hi ? C.signalWash : C.paper, line: hi ? C.signal : C.paper, lineWidth: hi ? 2.25 : 1 });
      text(s, stages[i].name, { x: x + 0.25, y: y + 0.2, w: cw - 0.5, h: 0.75, fontFace: F.head, fontSize: 20, bold: true, color: hi ? C.signal : C.ink, valign: 'bottom' });
      text(s, stages[i].def, { x: x + 0.25, y: y + 1.05, w: cw - 0.5, h: 0.65, fontSize: 14, color: C.ink2 });
      text(s, '{{PRESENTER: add 1–2 of our live use cases}}', { x: x + 0.25, y: y + 1.75, w: cw - 0.5, h: 0.55, fontSize: 12, italic: true, color: C.caution });
    }
    text(s, "Today's demo", { x: M + 3 * (cw + gap), y: base - (2.55 + 3 * 0.7) - 0.45, w: cw, h: 0.35, fontSize: 14, bold: true, color: C.signal });
    s.addNotes("This is the holistic view. Today's demo lives in the fourth stage, and it only works because the first three are in place: data access, tooling, and governance.");
  }

  // 4. The scenario
  {
    const s = pres.addSlide();
    s.background = { color: C.white };
    title(s, '02:07. Checkout is slowing down.');
    const facts = [
      ['Parcelo', 'a fictional online retailer'],
      ['checkout-api', 'Java 21, Spring Boot 3, six pods'],
      ['SLO', 'p99 latency at most 800 ms, errors at most 1%'],
      ['01:55', 'release v2.14.0 ships, all checks passed'],
      ['02:07', 'p99 is 4.8 s and errors are 11.4%'],
    ];
    facts.forEach(([k, v], i) => {
      const y = 1.75 + i * 0.85;
      text(s, k, { x: M, y, w: 4.9, h: 0.35, fontSize: 18, bold: true, fontFace: /^\d/.test(k) ? F.mono : F.body });
      text(s, v, { x: M, y: y + 0.36, w: 4.9, h: 0.4, fontSize: 16, color: C.ink2 });
    });
    screen(s, '01-alert', 6.0, 1.75, CW - (6.0 - M));
    s.addNotes('Fictional company, realistic failure. A config change quietly shrank a database connection pool.');
  }

  // 5. Meet the squad
  {
    const s = pres.addSlide();
    s.background = { color: C.white };
    title(s, 'Seven specialists and one human');
    const squad = agentsFile.agents.filter((a) => a.id !== 'human');
    const human = agentsFile.agents.find((a) => a.id === 'human');
    const tw = 2.05;
    const th = 2.45;
    const gap = 0.2;
    for (let i = 0; i < squad.length; i++) {
      const a = squad[i];
      const row = i < 4 ? 0 : 1;
      const col = row === 0 ? i : i - 4;
      const x = M + col * (tw + gap);
      const y = 1.6 + row * (th + 0.3);
      card(s, x, y, tw, th, { fill: C.paper, line: C.paper });
      await iconDisc(s, ICON_FOR[a.id], x + 0.25, y + 0.25, 0.8, HUE[a.id]);
      text(s, a.name, { x: x + 0.25, y: y + 1.1, w: tw - 0.4, h: 0.6, fontSize: 16, bold: true, valign: 'bottom' });
      text(s, a.role, { x: x + 0.25, y: y + 1.75, w: tw - 0.4, h: 0.65, fontSize: 12, color: C.ink2 });
    }
    const sepX = M + 4 * tw + 3 * gap + 0.4;
    s.addShape('line', { x: sepX, y: 1.6, w: 0, h: 2 * th + 0.3, line: { color: C.ink3, width: 1, dashType: 'dash' } });
    const hx = sepX + 0.45;
    const hw = W - M - hx;
    card(s, hx, 1.6, hw, th, { fill: C.white, line: C.ink, lineWidth: 1.5 });
    await iconDisc(s, ICON_FOR.human, hx + 0.25, 1.85, 0.8, HUE.human);
    text(s, human.name, { x: hx + 0.25, y: 2.8, w: hw - 0.4, h: 0.4, fontSize: 16, bold: true });
    text(s, human.role, { x: hx + 0.25, y: 3.2, w: hw - 0.4, h: 0.7, fontSize: 12, color: C.ink2 });
    text(s, 'Approves every production change. Can reject, and the squad adapts or stops.', {
      x: hx, y: 1.6 + th + 0.3, w: hw, h: 1.2, fontSize: 14, color: C.ink2,
    });
    s.addNotes('Each agent has one job and a limited set of tools. None of them can change production on their own.');
  }

  // 6. How the story unfolds
  {
    const s = pres.addSlide();
    s.background = { color: C.white };
    title(s, 'Seven acts in about four minutes');
    const acts = [
      ['1', 'Alert', '02:07', 'Sentinel detects the SLO breach'],
      ['2', 'Fan-out', '02:07', 'Three questions, three specialists'],
      ['3', 'Diagnosis', '02:08', 'Evidence converges on v2.14.0'],
      ['4', 'Fix', '02:09', 'Options, then policy checks'],
      ['5', 'You', '02:09', 'A human approves the rollback'],
      ['6', 'Recovery', '02:11', 'Rolling back, line back to green'],
      ['7', 'Wrap-up', '02:16', 'Status update and postmortem'],
    ];
    const x0 = M + 0.85;
    const x1 = W - M - 0.85;
    const y = 3.7;
    s.addShape('line', { x: x0, y, w: x1 - x0, h: 0, line: { color: C.line, width: 2 } });
    const step = (x1 - x0) / 6;
    acts.forEach(([n, name, clock, line], i) => {
      const cx = x0 + i * step;
      const human = n === '5';
      text(s, clock, { x: cx - 0.85, y: y - 0.85, w: 1.7, h: 0.35, fontFace: F.mono, fontSize: 14, color: C.ink2, align: 'center' });
      s.addText(n, {
        shape: 'ellipse', x: cx - 0.22, y: y - 0.22, w: 0.44, h: 0.44, fill: { color: human ? C.ink : C.signal }, line: { color: C.white, width: 2 },
        fontFace: F.body, fontSize: 14, bold: true, color: C.white, align: 'center', valign: 'middle', margin: 0, isTextBox: true,
      });
      text(s, name, { x: cx - 0.85, y: y + 0.45, w: 1.7, h: 0.4, fontSize: 16, bold: true, align: 'center' });
      text(s, line, { x: cx - 0.85, y: y + 0.9, w: 1.7, h: 0.8, fontSize: 12, color: C.ink2, align: 'center' });
    });
    text(s, 'Story clock 02:07 to 02:16. The clock stops while the human decides.', { x: M, y: 6.1, w: CW, h: 0.4, fontSize: 14, color: C.ink3, align: 'center' });
    s.addNotes('Detect, fan out, diagnose, propose, approve, recover, document.');
  }

  // 7. Diagnosis is teamwork
  {
    const s = pres.addSlide();
    s.background = { color: C.white };
    title(s, 'Three clues, one root cause');
    const iw = 7.4;
    screen(s, '03-evidence', M, 1.6, iw);
    const x = M + iw + 0.45;
    const w = W - M - x;
    const clues = [
      ['log-detective', 'Log Detective', 'Connection pool exhausted: 10 of 10 on every pod'],
      ['code-archaeologist', 'Code Archaeologist', 'v2.14.0 renamed the pool-size key'],
      ['sentinel', 'Sentinel', 'Database healthy: 22% CPU, 180 of 500 connections'],
    ];
    clues.forEach(([id, name, t], i) => {
      const y = 1.6 + i * 1.08;
      card(s, x, y, w, 0.96, { fill: C.paper, line: C.paper });
      s.addShape('ellipse', { x: x + 0.2, y: y + 0.2, w: 0.16, h: 0.16, fill: { color: HUE[id] }, line: { color: HUE[id], width: 0 } });
      text(s, name, { x: x + 0.45, y: y + 0.12, w: w - 0.6, h: 0.3, fontSize: 12, bold: true, color: C.ink2 });
      text(s, t, { x: x + 0.2, y: y + 0.42, w: w - 0.35, h: 0.5, fontSize: 14 });
    });
    card(s, x, 4.9, w, 1.05, { fill: C.signalWash, line: C.signal, lineWidth: 1.5 });
    text(s, 'Root cause, confidence 0.92', { x: x + 0.2, y: 5.0, w: w - 0.35, h: 0.3, fontSize: 12, bold: true, color: C.signal });
    text(s, 'v2.14.0 cut the connection pool from 40 to 10.', { x: x + 0.2, y: 5.3, w: w - 0.35, h: 0.55, fontSize: 16, bold: true });
    s.addNotes("The Orchestrator doesn't guess. It waits until independent evidence agrees, and it states its confidence.");
  }

  // 8. People stay in charge
  {
    const s = pres.addSlide();
    s.background = { color: C.white };
    title(s, 'The human decides');
    const iw = 7.4;
    screen(s, '05-gate', M, 1.6, iw);
    const x = M + iw + 0.5;
    const w = W - M - x;
    text(s, 'What the human sees', { x, y: 1.6, w, h: 0.45, fontFace: F.head, fontSize: 20, bold: true });
    const items = [
      ['FileText', 'A plain summary of the change'],
      ['Search', 'The evidence, one tap away'],
      ['ShieldCheck', 'Every policy result'],
      ['MousePointerClick', 'One clear decision: approve or reject'],
    ];
    for (let i = 0; i < items.length; i++) {
      const y = 2.3 + i * 0.85;
      await iconDisc(s, items[i][0], x, y, 0.55, C.signalWash, C.signal);
      text(s, items[i][1], { x: x + 0.75, y: y + 0.08, w: w - 0.75, h: 0.5, fontSize: 16 });
    }
    s.addNotes('If the human rejects, the squad finds an alternative. If they reject again, it stops and escalates. It stops where people say stop.');
  }

  // 9. Governance built in
  {
    const s = pres.addSlide();
    s.background = { color: C.white };
    title(s, 'Two layers of defence');
    const iw = 7.4;
    screen(s, '09-chaos', M, 1.6, iw);
    const x = M + iw + 0.5;
    const w = W - M - x;
    const blocks = [
      ['ShieldCheck', 'Policy as code', 'Guardian checks every action against written policies, and can block.'],
      ['KeyRound', 'Least-privilege tools', "Agents can't call what they aren't granted."],
    ];
    for (let i = 0; i < blocks.length; i++) {
      const y = 1.6 + i * 1.65;
      card(s, x, y, w, 1.45, { fill: C.paper, line: C.paper });
      await iconDisc(s, blocks[i][0], x + 0.25, y + 0.3, 0.6, HUE.guardian);
      text(s, blocks[i][1], { x: x + 1.05, y: y + 0.25, w: w - 1.25, h: 0.4, fontSize: 18, bold: true });
      text(s, blocks[i][2], { x: x + 1.05, y: y + 0.68, w: w - 1.25, h: 0.7, fontSize: 14, color: C.ink2 });
    }
    await iconDisc(s, 'ScrollText', x + 0.25, 5.05, 0.6, C.ink2);
    text(s, 'Every step is audited.', { x: x + 1.05, y: 5.18, w: w - 1.25, h: 0.4, fontSize: 18, bold: true });
    s.addNotes("In the chaos test, an over-eager agent tries to restart the production database. Policy blocks it, and even if policy failed, the tool isn't granted.");
  }

  // 10. The outcome
  {
    const s = pres.addSlide();
    s.background = { color: C.white };
    title(s, 'Four minutes, one decision', { w: CW - 1.6 });
    illustrativeTag(s, W - M - 1.3, 0.55);
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
        x: M, y: 1.5, w: 8.1, h: 4.75, barDir: 'bar', barGrouping: 'clustered', barGapWidthPct: 60,
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
    text(s, '30 s', { x, y: 2.0, w, h: 1.1, fontFace: F.head, fontSize: 64, bold: true, color: C.signal });
    text(s, 'Human time: 30 seconds of approval', { x, y: 3.15, w, h: 0.7, fontSize: 18, bold: true });
    text(s, 'Against about 50 minutes and one to three people for a manual response.', { x, y: 3.9, w, h: 0.9, fontSize: 14, color: C.ink2 });
    text(s, FOOTNOTE, { x: M, y: 6.55, w: CW, h: 0.35, fontSize: 12, color: C.ink3 });
    s.addNotes("These numbers are illustrative for this scenario. In a pilot we'd baseline your own incidents first.");
  }

  // 11. Beyond incidents
  {
    const s = pres.addSlide();
    s.background = { color: C.white };
    title(s, 'The same pattern, many workflows');
    const tiles = [
      {
        icon: 'Code', name: 'Legacy modernization squad',
        cast: 'Cartographer, Rule Miner, Translator, Test Forger, Guardian, Scribe',
        gate: 'Tech lead approves the merge',
        chaos: 'Translator drops a rounding rule to pass tests. Guardian blocks on equivalence.',
      },
      {
        icon: 'FileText', name: 'RFP response squad',
        cast: 'Reader, Researcher, Solution Architect, Pricer, Guardian, Scribe',
        gate: 'Bid manager approves submission',
        chaos: "Researcher reuses another client's case study. Guardian blocks on confidentiality.",
      },
      {
        icon: 'UserPlus', name: 'Onboarding and access',
        cast: 'IT, HR, and access specialists, Guardian, Scribe',
        gate: 'Manager approves access',
        chaos: 'An agent requests admin rights. Guardian blocks on least privilege.',
      },
    ];
    const tw = 3.75;
    const gap = (CW - 3 * tw) / 2;
    for (let i = 0; i < 3; i++) {
      const t = tiles[i];
      const x = M + i * (tw + gap);
      const y = 1.6;
      card(s, x, y, tw, 5.0, { fill: C.paper, line: C.paper });
      await iconDisc(s, t.icon, x + 0.3, y + 0.3, 0.7, C.ink2);
      text(s, t.name, { x: x + 0.3, y: y + 1.15, w: tw - 0.6, h: 0.75, fontFace: F.head, fontSize: 20, bold: true });
      const rowsT = [
        ['Squad', t.cast],
        ['Human gate', t.gate],
        ['Chaos test', t.chaos],
      ];
      rowsT.forEach(([k, v], j) => {
        const yy = y + 2.0 + j * 0.98;
        text(s, k, { x: x + 0.3, y: yy, w: tw - 0.6, h: 0.3, fontSize: 12, bold: true, color: j === 1 ? C.caution : C.ink2 });
        text(s, v, { x: x + 0.3, y: yy + 0.3, w: tw - 0.6, h: 0.65, fontSize: 13 });
      });
    }
    s.addNotes('The engine is the same: specialists, a guardian, a scribe, and a human gate. Only the tools and policies change.');
  }

  // 12. Choosing where to start
  {
    const s = pres.addSlide();
    s.background = { color: C.white };
    title(s, 'Where agents fit first');
    const gx = M + 1.3;
    const gy = 1.55;
    const gw = 7.2;
    const gh = 4.7;
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
    text(s, 'Start where the work is repeatable and actions are reversible.', { x, y: 1.9, w, h: 1.1, fontSize: 18, bold: true });
    text(s, 'Keep humans leading where mistakes are costly or irreversible.', { x, y: 3.1, w, h: 1.1, fontSize: 16, color: C.ink2 });
    s.addNotes('Start where the work is repeatable and actions are reversible. Keep humans leading where mistakes are costly or irreversible.');
  }

  // 13. How it runs
  {
    const s = pres.addSlide();
    s.background = { color: C.white };
    title(s, 'Built on AWS, runs anywhere we demo');
    const boxes = [
      ['Monitor', 'Browser', 'The stage: scripted or live'],
      ['Globe', 'Amazon CloudFront', 'Serves the app and the API'],
      ['Server', 'AWS Lambda', 'Director, tools, policy engine'],
      ['Sparkles', 'Amazon Bedrock', 'Claude models write the live turns'],
    ];
    const bw = 2.55;
    const gap = (CW - 4 * bw) / 3;
    const y = 2.2;
    for (let i = 0; i < boxes.length; i++) {
      const x = M + i * (bw + gap);
      card(s, x, y, bw, 2.3, { fill: i === 2 ? C.signalWash : C.paper, line: i === 2 ? C.signal : C.paper, lineWidth: i === 2 ? 1.5 : 1 });
      await iconDisc(s, boxes[i][0], x + 0.25, y + 0.25, 0.6, i === 2 ? C.signal : C.ink2);
      text(s, boxes[i][1], { x: x + 0.25, y: y + 1.0, w: bw - 0.5, h: 0.45, fontSize: 18, bold: true });
      text(s, boxes[i][2], { x: x + 0.25, y: y + 1.45, w: bw - 0.5, h: 0.75, fontSize: 13, color: C.ink2 });
      if (i < boxes.length - 1) arrow(s, x + bw + 0.08, y + 1.15, x + bw + gap - 0.08, y + 1.15);
    }
    card(s, M, 5.05, CW, 1.25, { fill: C.white, line: C.line });
    text(s, [
      { text: 'Offline mode for demos. ', options: { bold: true } },
      { text: 'The same app runs from one file with no network. The policy engine and tools run in our code, not in the model; the model only writes the words.' },
    ], { x: M + 0.3, y: 5.25, w: CW - 0.6, h: 0.9, fontSize: 15, color: C.ink2 });
    s.addNotes('The same code runs on a laptop with no network, or live on Amazon Bedrock in your account.');
  }

  // 14. A pilot, not a promise
  {
    const s = pres.addSlide();
    s.background = { color: C.white };
    title(s, 'Proposed next step: a six-week pilot', { w: CW - 1.6 });
    s.addText('Proposal', {
      shape: 'roundRect', rectRadius: 0.5, x: W - M - 1.3, y: 0.55, w: 1.3, h: 0.34, fontFace: F.body, fontSize: 12, bold: true,
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
      card(s, x, 1.8, pw, 2.2, { fill: i === 3 ? C.okWash : C.paper, line: i === 3 ? C.ok : C.paper });
      text(s, when, { x: x + 0.25, y: 2.0, w: pw - 0.5, h: 0.4, fontFace: F.mono, fontSize: 16, bold: true, color: i === 3 ? C.ok : C.signal });
      text(s, what, { x: x + 0.25, y: 2.5, w: pw - 0.5, h: 1.3, fontSize: 17, bold: true });
      if (i < 3) arrow(s, x + pw + 0.06, 2.9, x + pw + gap - 0.06, 2.9);
    });
    text(s, 'What would you want a squad to take off your team’s plate first?', {
      x: M, y: 4.9, w: CW, h: 1.2, fontFace: F.head, fontSize: 30, bold: true, color: C.ink,
    });
    s.addNotes('Ask the question and stop talking.');
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
