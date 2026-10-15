import { useEffect, useState } from 'react';

/** Current time, refreshed every 30s (or `everyMs`) so late-return, overdue and no-show states appear on their own. */
export function useNow(everyMs = 30_000) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), everyMs);
    return () => clearInterval(t);
  }, [everyMs]);
  return now;
}
