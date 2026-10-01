import { useLayoutEffect, useState, type RefObject } from 'react';

/** Width of an element that may mount after the first render; re-measured after every render. */
export function useWidth(ref: RefObject<HTMLElement | null>): number {
  const [width, setWidth] = useState(0);
  useLayoutEffect(() => {
    const w = ref.current?.offsetWidth ?? 0;
    if (w !== width) setWidth(w);
  });
  return width;
}
