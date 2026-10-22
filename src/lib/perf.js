/**
 * Performance & robustness helpers for UI components.
 *
 * Small, tree-shakeable utilities that keep the interface fast on
 * low-end handsets and resilient to edge cases — without pulling in
 * a heavy dependency.
 */

/** Clamp a number to a range — avoids layout thrash from out-of-range values. */
export function clamp(n, min, max) {
  return Math.min(max, Math.max(min, n));
}

/**
 * Run `fn` on the next animation frame, coalescing multiple calls within
 * the same frame. Returns a cancel function.
 */
export function rafBatch(fn) {
  let raf = 0;
  let pending = false;
  let latestArgs = null;
  const schedule = (...args) => {
    latestArgs = args;
    if (pending) return;
    pending = true;
    raf = requestAnimationFrame(() => {
      pending = false;
      fn(...latestArgs);
    });
  };
  schedule.cancel = () => {
    pending = false;
    if (raf) cancelAnimationFrame(raf);
  };
  return schedule;
}

/** Schedule `fn` when the main thread is idle — for non-critical work. */
export function onIdle(fn, timeout = 2000) {
  if (typeof requestIdleCallback === "function") {
    return requestIdleCallback(fn, { timeout });
  }
  return setTimeout(fn, 300);
}

export function cancelIdle(id) {
  if (typeof cancelIdleCallback === "function") return cancelIdleCallback(id);
  clearTimeout(id);
}

/** Simple debounce — returns a debounced function. */
export function debounce(fn, delay = 300) {
  let t = 0;
  const debounced = (...args) => {
    clearTimeout(t);
    t = setTimeout(() => fn(...args), delay);
  };
  debounced.cancel = () => clearTimeout(t);
  return debounced;
}

/** Simple throttle — at most once per interval. */
export function throttle(fn, interval = 100) {
  let last = 0;
  let timer = 0;
  return (...args) => {
    const now = Date.now();
    const remaining = interval - (now - last);
    if (remaining <= 0) {
      last = now;
      fn(...args);
    } else if (!timer) {
      timer = setTimeout(() => {
        last = Date.now();
        timer = 0;
        fn(...args);
      }, remaining);
    }
  };
}
