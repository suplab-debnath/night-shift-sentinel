// Story art for the executive deck (DECK §4, DECISIONS D-076): drawn in code as SVG and
// rasterised with sharp. No stock photos, no logos. Seeded, so every build is identical.
import sharp from 'sharp';

const W = 2667; // 13.333 in at 200 dpi
const H = 1500; // 7.5 in

function rng(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** A city skyline along the bottom: buildings with a few lit windows. */
function skyline({ seed, base, colour, windowColour, lit = 0.06, litWindow = null }) {
  const r = rng(seed);
  const parts = [];
  let x = -20;
  let index = 0;
  while (x < W) {
    const bw = 90 + r() * 170;
    const bh = 120 + r() * 300;
    const y = H - bh;
    parts.push(`<rect x="${x.toFixed(0)}" y="${y.toFixed(0)}" width="${bw.toFixed(0)}" height="${bh.toFixed(0)}" fill="${colour}"/>`);
    for (let wy = y + 24; wy < H - 30; wy += 38) {
      for (let wx = x + 16; wx < x + bw - 22; wx += 30) {
        const on = r() < lit;
        const special = litWindow && index === litWindow.building && Math.abs(wy - (y + 24 + 38 * litWindow.row)) < 1 && wx === x + 16 + 30 * litWindow.col;
        if (on || special) {
          parts.push(`<rect x="${wx.toFixed(0)}" y="${wy.toFixed(0)}" width="14" height="20" fill="${special ? '#FFD37A' : windowColour}" opacity="${special ? 1 : 0.85}"/>`);
        }
      }
    }
    x += bw + 6 + r() * 14;
    index += 1;
  }
  return `<g transform="translate(0 ${base})">${parts.join('')}</g>`;
}

function stars(seed, count, maxY) {
  const r = rng(seed);
  return Array.from({ length: count }, () => {
    const x = r() * W;
    const y = r() * maxY;
    const s = 0.8 + r() * 2.2;
    return `<circle cx="${x.toFixed(0)}" cy="${y.toFixed(0)}" r="${s.toFixed(1)}" fill="#FFFFFF" opacity="${(0.35 + r() * 0.6).toFixed(2)}"/>`;
  }).join('');
}

async function png(svg, w = W, h = H) {
  const buf = await sharp(Buffer.from(svg)).resize(w, h).png().toBuffer();
  return `image/png;base64,${buf.toString('base64')}`;
}

/** 2 AM: deep navy sky, stars, a crescent moon, a sleeping city with one window lit. */
export async function nightSky() {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">
    <defs>
      <linearGradient id="sky" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0" stop-color="#050818"/><stop offset="0.65" stop-color="#101A45"/><stop offset="1" stop-color="#1B2A63"/>
      </linearGradient>
      <radialGradient id="glow" cx="0.82" cy="0.2" r="0.25">
        <stop offset="0" stop-color="#8EA2FF" stop-opacity="0.35"/><stop offset="1" stop-color="#8EA2FF" stop-opacity="0"/>
      </radialGradient>
    </defs>
    <rect width="${W}" height="${H}" fill="url(#sky)"/>
    <rect width="${W}" height="${H}" fill="url(#glow)"/>
    ${stars(7, 220, H * 0.7)}
    <mask id="crescent"><rect width="${W}" height="${H}" fill="#fff"/><circle cx="${W * 0.82 + 44}" cy="${H * 0.2 - 26}" r="84" fill="#000"/></mask>
    <circle cx="${W * 0.82}" cy="${H * 0.2}" r="92" fill="#F4F1E6" mask="url(#crescent)"/>
    ${skyline({ seed: 11, base: 60, colour: '#0E1638', windowColour: '#3A4A8C', lit: 0.08 })}
    ${skyline({ seed: 23, base: 150, colour: '#070B22', windowColour: '#F5C26B', lit: 0.07 })}
  </svg>`;
  return png(svg);
}

/** Dawn: the same city as the sky turns warm. */
export async function dawnSky() {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">
    <defs>
      <linearGradient id="sky" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0" stop-color="#1D2B63"/><stop offset="0.45" stop-color="#6B5A9E"/><stop offset="0.75" stop-color="#F08A6C"/><stop offset="1" stop-color="#FFD39A"/>
      </linearGradient>
    </defs>
    <rect width="${W}" height="${H}" fill="url(#sky)"/>
    ${stars(7, 60, H * 0.3)}
    <circle cx="${W * 0.7}" cy="${H * 0.93}" r="210" fill="#FFE2A8" opacity="0.95"/>
    ${skyline({ seed: 11, base: 60, colour: '#4B3E78', windowColour: '#FFD37A', lit: 0.01 })}
    ${skyline({ seed: 23, base: 150, colour: '#2A2350', windowColour: '#FFD37A', lit: 0.03 })}
  </svg>`;
  return png(svg);
}

/** A phone body; the screen is left for native text. variant: 'lock' (night) or 'app' (light). */
export async function phone(variant) {
  const w = 900;
  const h = 1800;
  const screen =
    variant === 'lock'
      ? `<linearGradient id="scr" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#1B2458"/><stop offset="1" stop-color="#3B2A6E"/></linearGradient>`
      : `<linearGradient id="scr" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#FFFFFF"/><stop offset="1" stop-color="#F4F6F9"/></linearGradient>`;
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}">
    <defs>${screen}</defs>
    <rect x="10" y="10" width="${w - 20}" height="${h - 20}" rx="120" fill="#0A0D18"/>
    <rect x="40" y="40" width="${w - 80}" height="${h - 80}" rx="96" fill="url(#scr)"/>
    <rect x="${w / 2 - 110}" y="62" width="220" height="44" rx="22" fill="#0A0D18"/>
  </svg>`;
  return png(svg, w / 2, h / 2);
}
