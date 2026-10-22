import { useCallback, useEffect, useRef, useState } from "react";

/**
 * Debounce a fast-changing value — e.g. search text — so downstream
 * effects (filtering, network) fire only after the user pauses.
 */
export function useDebouncedValue(value, delay = 300) {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const id = setTimeout(() => setDebounced(value), delay);
    return () => clearTimeout(id);
  }, [value, delay]);
  return debounced;
}

/**
 * Throttle a callback to at most once per `interval` — for scroll/resize
 * handlers that would otherwise flood the main thread.
 */
export function useThrottledCallback(fn, interval = 100) {
  const last = useRef(0);
  const timer = useRef(0);
  const fnRef = useRef(fn);
  fnRef.current = fn;

  const throttled = useCallback(
    (...args) => {
      const now = Date.now();
      const remaining = interval - (now - last.current);
      if (remaining <= 0) {
        last.current = now;
        fnRef.current(...args);
      } else if (!timer.current) {
        timer.current = setTimeout(() => {
          last.current = Date.now();
          timer.current = 0;
          fnRef.current(...args);
        }, remaining);
      }
    },
    [interval]
  );

  useEffect(
    () => () => {
      if (timer.current) clearTimeout(timer.current);
    },
    []
  );

  return throttled;
}

/**
 * Stable callback identity — the returned function never changes between
 * renders, but always calls the latest `fn`. Lets memoized children skip
 * re-renders even when the parent re-renders.
 */
export function useStableCallback(fn) {
  const ref = useRef(fn);
  ref.current = fn;
  return useCallback((...args) => ref.current(...args), []);
}

/**
 * Previous value — handy for direction detection without extra state.
 */
export function usePrevious(value) {
  const ref = useRef();
  useEffect(() => {
    ref.current = value;
  }, [value]);
  return ref.current;
}

/**
 * Is the component mounted? Guards async callbacks from setting state
 * after unmount (avoids React warnings and wasted work).
 */
export function useIsMounted() {
  const mounted = useRef(false);
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);
  return useCallback(() => mounted.current, []);
}

/**
 * Run `callback` when the element becomes visible — defers heavy work
 * (charts, images, large tables) until actually needed.
 */
export function useInView(ref, options = {}) {
  const { threshold = 0.01, once = false, rootMargin } = options;
  const [inView, setInView] = useState(!("IntersectionObserver" in globalThis));
  useEffect(() => {
    const el = ref.current;
    if (!el || !("IntersectionObserver" in globalThis)) return undefined;
    const obs = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          setInView(true);
          if (once) obs.disconnect();
        } else if (!once) {
          setInView(false);
        }
      },
      { threshold, rootMargin }
    );
    obs.observe(el);
    return () => obs.disconnect();
  }, [ref, threshold, once, rootMargin]);
  return inView;
}

/**
 * Media query as boolean — e.g. `useMediaQuery("(max-width: 860px)")`.
 * Updates on change and respects SSR (returns false initially).
 */
export function useMediaQuery(query) {
  const [matches, setMatches] = useState(() => {
    if (typeof window === "undefined" || !window.matchMedia) return false;
    return window.matchMedia(query).matches;
  });
  useEffect(() => {
    if (!window.matchMedia) return undefined;
    const mql = window.matchMedia(query);
    const handler = (e) => setMatches(e.matches);
    // Safari <14 uses addListener
    if (mql.addEventListener) mql.addEventListener("change", handler);
    else mql.addListener(handler);
    return () => {
      if (mql.removeEventListener) mql.removeEventListener("change", handler);
      else mql.removeListener(handler);
    };
  }, [query]);
  return matches;
}

/**
 * Idle callback — defers non-critical work until the main thread is free.
 */
export function useIdleCallback(fn, deps = []) {
  const fnRef = useRef(fn);
  fnRef.current = fn;
  useEffect(() => {
    let id;
    if ("requestIdleCallback" in globalThis) {
      id = requestIdleCallback(() => fnRef.current(), { timeout: 2000 });
      return () => cancelIdleCallback(id);
    }
    id = setTimeout(() => fnRef.current(), 300);
    return () => clearTimeout(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);
}

/**
 * Press-and-hold guard — prevents double-submits from impatient taps
 * without disabling the button's focus ring or aria-busy semantics.
 */
export function useBusyGuard(ms = 800) {
  const [busy, setBusy] = useState(false);
  const timer = useRef(0);
  const guard = useCallback(
    async (fn) => {
      if (busy) return;
      setBusy(true);
      try {
        await fn?.();
      } finally {
        timer.current = setTimeout(() => setBusy(false), ms);
      }
    },
    [busy, ms]
  );
  useEffect(
    () => () => {
      if (timer.current) clearTimeout(timer.current);
    },
    []
  );
  return [busy, guard];
}
