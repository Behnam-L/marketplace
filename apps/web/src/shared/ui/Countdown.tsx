import { useEffect, useState } from 'react';
import { mmss } from '../format/format';

/** Seconds left until `until`, corrected for server/client clock skew. */
export function useSecondsLeft(until: string | null | undefined, skewMs = 0): number | null {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (!until) return;
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, [until]);
  if (!until) return null;
  return Math.max(0, Math.floor((new Date(until).getTime() - (now + skewMs)) / 1000));
}

export function Countdown({ until, skewMs, label }: { until: string | null; skewMs?: number; label: string }) {
  const left = useSecondsLeft(until, skewMs);
  if (left === null) return null;
  return (
    <span className="countdown" role="timer" aria-live="off" aria-label={`${label} ${mmss(left)}`}>
      {label} <strong>{mmss(left)}</strong>
    </span>
  );
}
