/**
 * Shared motion primitives.
 *
 * Two rules hold everywhere in here:
 *
 *   1. Motion explains a change in state. Nothing animates to be decorative.
 *   2. Anyone who has asked their system for reduced motion gets the final
 *      value immediately. That is checked in JS as well as CSS, because a
 *      counting animation is driven by a timer and a media query cannot stop
 *      a timer.
 *
 * Timing constants live in styles.css as custom properties. The few numbers
 * that must exist in JS are read from there at runtime so there is still only
 * one place to retune.
 */

import { useEffect, useRef, useState } from "react";

/** True when the operating system asks for less movement. */
export function prefersReducedMotion() {
  if (typeof window === "undefined" || !window.matchMedia) return false;
  return window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}

/** Reads a duration token from the stylesheet, in milliseconds. */
function durationToken(name, fallback) {
  if (typeof window === "undefined") return fallback;
  const raw = getComputedStyle(document.documentElement).getPropertyValue(name).trim();
  if (!raw) return fallback;
  const ms = raw.endsWith("ms")
    ? parseFloat(raw)
    : raw.endsWith("s")
      ? parseFloat(raw) * 1000
      : parseFloat(raw);
  return Number.isFinite(ms) ? ms : fallback;
}

/**
 * Counts from the previous value to the next one.
 *
 * Money and stock figures change because something happened, and a figure
 * that snaps gives no clue whether it moved up or down. The count is short
 * and eased out so it reads as a needle settling rather than a slot machine.
 */
export function useCountUp(value, { duration } = {}) {
  const target = Number.isFinite(Number(value)) ? Number(value) : 0;
  const [shown, setShown] = useState(target);
  const fromRef = useRef(target);
  const frameRef = useRef(0);
  const firstRef = useRef(true);

  useEffect(() => {
    // The first render shows the real figure. Counting up from zero on load
    // would imply a change that did not happen.
    if (firstRef.current) {
      firstRef.current = false;
      fromRef.current = target;
      setShown(target);
      return undefined;
    }

    if (prefersReducedMotion()) {
      fromRef.current = target;
      setShown(target);
      return undefined;
    }

    const from = fromRef.current;
    if (from === target) return undefined;

    const ms = duration ?? durationToken("--duration-page", 260);
    const started = performance.now();

    const step = (now) => {
      const t = Math.min(1, (now - started) / ms);
      // easeOutCubic: fast departure, no overshoot on arrival.
      const eased = 1 - Math.pow(1 - t, 3);
      setShown(from + (target - from) * eased);
      if (t < 1) {
        frameRef.current = requestAnimationFrame(step);
      } else {
        fromRef.current = target;
        setShown(target);
      }
    };

    frameRef.current = requestAnimationFrame(step);
    return () => cancelAnimationFrame(frameRef.current);
  }, [target, duration]);

  return shown;
}

/**
 * A figure that counts to its new value and ticks green or rust for one beat
 * in the direction it moved.
 *
 * `format` receives the interpolated number, so callers keep control of
 * currency, litres and decimal places.
 */
export function NumberRoll({
  value,
  format = (n) => String(Math.round(n)),
  className = "",
  duration,
  showDirection = true,
  ...rest
}) {
  const shown = useCountUp(value, { duration });
  const prevRef = useRef(Number(value) || 0);
  const [direction, setDirection] = useState(null);

  useEffect(() => {
    const next = Number(value) || 0;
    const prev = prevRef.current;
    prevRef.current = next;
    if (!showDirection || next === prev || prefersReducedMotion()) return undefined;

    setDirection(next > prev ? "up" : "down");
    const ms = durationToken("--duration-slow", 220);
    const timer = setTimeout(() => setDirection(null), ms);
    return () => clearTimeout(timer);
  }, [value, showDirection]);

  return (
    <span
      className={`num-roll ${className}`.trim()}
      data-settling={direction || undefined}
      {...rest}
    >
      {format(shown)}
    </span>
  );
}

/**
 * Fires a one-shot CSS animation whenever `trigger` changes to a truthy value.
 * Returns a class name to spread onto the element.
 *
 * Used for the rejection knock on inputs and the badge flip on status change:
 * both are "this just happened" signals that must be able to fire twice in a
 * row, which a plain class toggle cannot do without being cleared first.
 */
export function useOneShot(trigger, { className, duration = 220 } = {}) {
  const [active, setActive] = useState(false);
  const firstRef = useRef(true);

  useEffect(() => {
    if (firstRef.current) {
      firstRef.current = false;
      return undefined;
    }
    if (!trigger || prefersReducedMotion()) return undefined;
    setActive(false);
    // Two frames: the class must be absent for one paint or the browser will
    // not restart an identical animation.
    const raf = requestAnimationFrame(() => requestAnimationFrame(() => setActive(true)));
    const timer = setTimeout(() => setActive(false), duration + 40);
    return () => {
      cancelAnimationFrame(raf);
      clearTimeout(timer);
    };
  }, [trigger, duration]);

  return active ? className : "";
}

/**
 * Tracks a status string and reports whether it just changed, so a badge can
 * mark itself for one beat when a shift moves between states.
 */
export function useStatusChange(status) {
  const [changed, setChanged] = useState(false);
  const prevRef = useRef(status);

  useEffect(() => {
    if (prevRef.current === status) return undefined;
    prevRef.current = status;
    if (prefersReducedMotion()) return undefined;
    setChanged(true);
    const ms = durationToken("--duration-slow", 220);
    const timer = setTimeout(() => setChanged(false), ms + 40);
    return () => clearTimeout(timer);
  }, [status]);

  return changed;
}

/**
 * Keeps a removed item mounted for the length of its exit animation, so a
 * deleted row collapses instead of vanishing.
 *
 * Items are matched by `keyOf`. Anything absent from the new list is held
 * with `exiting: true` until the animation has run.
 */
export function useAnimatedList(items, keyOf = (item) => item.id, duration = 180) {
  const [rendered, setRendered] = useState(() =>
    (items || []).map((item) => ({ item, key: keyOf(item), exiting: false }))
  );
  const timers = useRef(new Map());

  useEffect(() => {
    const next = items || [];
    const nextKeys = new Set(next.map(keyOf));

    setRendered((current) => {
      const leaving = current
        .filter((entry) => !nextKeys.has(entry.key) && !entry.exiting)
        .map((entry) => entry.key);

      if (prefersReducedMotion()) {
        return next.map((item) => ({ item, key: keyOf(item), exiting: false }));
      }

      leaving.forEach((key) => {
        if (timers.current.has(key)) return;
        const timer = setTimeout(() => {
          timers.current.delete(key);
          setRendered((rows) => rows.filter((row) => row.key !== key));
        }, duration);
        timers.current.set(key, timer);
      });

      const held = current
        .filter((entry) => !nextKeys.has(entry.key))
        .map((entry) => ({ ...entry, exiting: true }));

      const fresh = next.map((item) => ({ item, key: keyOf(item), exiting: false }));

      // Departing rows keep roughly their old position so the list does not
      // reshuffle while one of its rows is still collapsing.
      const out = [];
      const byKey = new Map(fresh.map((entry) => [entry.key, entry]));
      current.forEach((entry) => {
        if (byKey.has(entry.key)) {
          out.push(byKey.get(entry.key));
          byKey.delete(entry.key);
        } else {
          const stillLeaving = held.find((h) => h.key === entry.key);
          if (stillLeaving) out.push(stillLeaving);
        }
      });
      byKey.forEach((entry) => out.push(entry));
      return out;
    });
  }, [items, keyOf, duration]);

  useEffect(() => {
    const pending = timers.current;
    return () => {
      pending.forEach((timer) => clearTimeout(timer));
      pending.clear();
    };
  }, []);

  return rendered;
}

/** Paper-coloured loading placeholders, shaped like the content they stand in for. */
export function SkeletonLine({ width = "wide" }) {
  return <div className={`skeleton skeleton-line ${width}`} />;
}

export function SkeletonNumber() {
  return <div className="skeleton skeleton-num" />;
}

export function SkeletonPanel({ lines = 3 }) {
  return (
    <div className="skeleton-panel">
      <SkeletonLine width="short" />
      {Array.from({ length: lines }).map((_, i) => (
        <SkeletonLine key={i} width={i % 2 ? "half" : "wide"} />
      ))}
    </div>
  );
}

/**
 * Standard loading state: a sweeping hairline above skeleton panels. Replaces
 * the bare "Loading…" text so the page keeps its shape while data arrives.
 */
export function LoadingPanels({ count = 2, lines = 3, label = "Loading" }) {
  return (
    <div aria-busy="true" aria-label={label}>
      <div className="loading-bar" />
      <div style={{ display: "grid", gap: 12, marginTop: 12 }}>
        {Array.from({ length: count }).map((_, i) => (
          <SkeletonPanel key={i} lines={lines} />
        ))}
      </div>
    </div>
  );
}
