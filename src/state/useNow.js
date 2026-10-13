import { useEffect, useState } from "react";

/**
 * A wall clock that returns the current time and re-renders on an interval.
 *
 * Live screens show "how long has this been running", which is only honest if
 * it moves. The default tick is deliberately slow — often enough that the
 * figure never reads stale, rarely enough that nothing flickers.
 */
export function useNow(intervalMs = 30_000) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), intervalMs);
    return () => clearInterval(id);
  }, [intervalMs]);
  return now;
}
