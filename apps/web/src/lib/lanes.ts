// Greedy label rows so timeline labels never overlap (split view).

export interface LaneItem {
  /** Left position in % of the track. */
  x: number;
  text: string;
}

export interface PlacedItem extends LaneItem {
  row: number;
}

export function layoutLabels(items: LaneItem[], opts: { charPct: number; gapPct: number }): PlacedItem[] {
  const rowEnds: number[] = [];
  return items.map((item) => {
    const width = item.text.length * opts.charPct;
    let row = rowEnds.findIndex((end) => end + opts.gapPct <= item.x);
    if (row === -1) {
      row = rowEnds.length;
      rowEnds.push(item.x + width);
    } else {
      rowEnds[row] = item.x + width;
    }
    return { ...item, row };
  });
}
