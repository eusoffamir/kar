import { useEffect, useState } from 'react';

/** Current time, refreshed every 30s so late-return, overdue and no-show states appear on their own. */
export function useNow() {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 30_000);
    return () => clearInterval(t);
  }, []);
  return now;
}
