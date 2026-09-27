import { useEffect, useState } from 'react';

/** Wall-clock ms since `active` became true, ticking a few times a second; 0 when inactive. */
export function useAmbientMs(active: boolean, stepMs = 400): number {
  const [ms, setMs] = useState(0);
  useEffect(() => {
    if (!active) {
      setMs(0);
      return;
    }
    const started = performance.now();
    const id = window.setInterval(() => setMs(performance.now() - started), stepMs);
    return () => window.clearInterval(id);
  }, [active, stepMs]);
  return ms;
}
