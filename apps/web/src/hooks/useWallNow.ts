import { useEffect, useState } from 'react';

/** Wall time (performance.now), re-read a few times a second while `active`. */
export function useWallNow(active: boolean, stepMs = 250): number {
  const [now, setNow] = useState(() => performance.now());
  useEffect(() => {
    if (!active) return;
    setNow(performance.now());
    const id = window.setInterval(() => setNow(performance.now()), stepMs);
    return () => window.clearInterval(id);
  }, [active, stepMs]);
  return now;
}
