// Keep stage labels inside the stage (P9 layout audit): pure helpers, unit-tested.

/** Left edge for a box beside an anchor: to its right, or to its left when it would overflow. */
export function placeBeside(anchorX: number, boxWidth: number, containerWidth: number, gap = 10, margin = 8): number {
  const right = anchorX + gap;
  if (right + boxWidth <= containerWidth - margin) return right;
  return Math.max(margin, anchorX - gap - boxWidth);
}

/** Centre x for a box of the given width, clamped so the box stays inside the container. */
export function clampCentre(x: number, boxWidth: number, containerWidth: number, margin = 8): number {
  const half = boxWidth / 2;
  if (containerWidth <= boxWidth + margin * 2) return containerWidth / 2;
  return Math.min(containerWidth - margin - half, Math.max(margin + half, x));
}

/** Rough pill width for a packet label (sans at --t-sm plus padding), for clamping in flight. */
export function labelPillWidth(label: string): number {
  return label.length * 7.4 + 28;
}

/** How to anchor a box under a node at x% so wide boxes near the edges stay on stage. */
export function edgeAnchor(xPct: number): 'start' | 'centre' | 'end' {
  if (xPct < 25) return 'start';
  if (xPct > 75) return 'end';
  return 'centre';
}
