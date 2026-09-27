import { useEffect, useRef, useState } from 'react';
import { useApp } from '../state/store';

const THROTTLE_MS = 1500;

/** aria-live region: announces thought lines, throttled to one per 1.5 s (DESIGN §10). */
export function LiveAnnouncer() {
  const stream = useApp((s) => s.snap.state.stream);
  const agents = useApp((s) => s.bundle.agents.agents);
  const [message, setMessage] = useState('');
  const lastAt = useRef(0);
  const pending = useRef<string | null>(null);
  const timer = useRef<number | null>(null);

  useEffect(() => {
    const last = [...stream].reverse().find((e) => e.type === 'thought');
    if (!last || last.type !== 'thought') return;
    const name = agents.find((a) => a.id === last.agent)?.name ?? last.agent;
    pending.current = `${name}: ${last.text}`;
    const flush = () => {
      if (pending.current) setMessage(pending.current);
      pending.current = null;
      lastAt.current = performance.now();
      timer.current = null;
    };
    const wait = THROTTLE_MS - (performance.now() - lastAt.current);
    if (wait <= 0) flush();
    else if (timer.current === null) timer.current = window.setTimeout(flush, wait);
  }, [stream, agents]);

  useEffect(() => () => {
    if (timer.current !== null) window.clearTimeout(timer.current);
  }, []);

  return (
    <div className="visually-hidden" aria-live="polite" aria-atomic="true">
      {message}
    </div>
  );
}
