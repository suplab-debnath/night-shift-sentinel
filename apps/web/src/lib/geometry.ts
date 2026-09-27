// Stage geometry: node centres from percentage positions, packet curves.

export interface Point {
  x: number;
  y: number;
}

export interface Size {
  width: number;
  height: number;
}

export function nodeCenter(position: { x: number; y: number }, size: Size): Point {
  return { x: (position.x / 100) * size.width, y: (position.y / 100) * size.height };
}

/** Control point for a gentle quadratic arc between two nodes. */
export function controlPoint(a: Point, b: Point, bend = 0.18): Point {
  const mx = (a.x + b.x) / 2;
  const my = (a.y + b.y) / 2;
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  // Perpendicular offset, always bending "upwards" on screen for consistency.
  const nx = -dy;
  const ny = dx;
  const len = Math.hypot(nx, ny) || 1;
  const sign = ny > 0 ? -1 : 1;
  return { x: mx + sign * (nx / len) * Math.hypot(dx, dy) * bend, y: my + sign * (ny / len) * Math.hypot(dx, dy) * bend };
}

export function quadPoint(a: Point, c: Point, b: Point, k: number): Point {
  const t = Math.min(1, Math.max(0, k));
  const u = 1 - t;
  return { x: u * u * a.x + 2 * u * t * c.x + t * t * b.x, y: u * u * a.y + 2 * u * t * c.y + t * t * b.y };
}

export function quadPath(a: Point, c: Point, b: Point): string {
  return `M ${a.x.toFixed(1)} ${a.y.toFixed(1)} Q ${c.x.toFixed(1)} ${c.y.toFixed(1)} ${b.x.toFixed(1)} ${b.y.toFixed(1)}`;
}

/** Ease used for packet travel (matches --ease-move approximately). */
export function easeMove(k: number): number {
  const t = Math.min(1, Math.max(0, k));
  return 1 - Math.pow(1 - t, 3);
}

/** Pull both ends of a segment in by the node radii so paths start at the disc edge. */
export function edgePoints(a: Point, b: Point, ra: number, rb: number): [Point, Point] {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const len = Math.hypot(dx, dy);
  if (len <= ra + rb) return [a, b];
  const ux = dx / len;
  const uy = dy / len;
  return [
    { x: a.x + ux * ra, y: a.y + uy * ra },
    { x: b.x - ux * rb, y: b.y - uy * rb },
  ];
}
