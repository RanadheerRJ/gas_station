/**
 * Elapsed time, in the UI language.
 *
 * A shift is judged in minutes and hours, never seconds: "2h 15m" is the
 * whole answer on a forecourt, and a figure that ticks every second reads as
 * unstable. Kept here so the running-shift screen and the shift list say the
 * same thing in the same words.
 */
const MINUTE_MS = 60_000;

/** Whole minutes elapsed, never negative (a skewed clock reads as zero). */
export function elapsedMinutes(elapsedMs) {
  const ms = Number(elapsedMs);
  if (!Number.isFinite(ms)) return 0;
  return Math.max(0, Math.floor(ms / MINUTE_MS));
}

/**
 * "2h 15m" / "45m", translated. `translate` is passed in rather than imported
 * so this module stays free of the React context it is rendered from.
 */
export function elapsedLabel(elapsedMs, t) {
  const minutes = elapsedMinutes(elapsedMs);
  const hours = Math.floor(minutes / 60);
  if (hours > 0) return t("shifts.elapsedHm", { hours, minutes: minutes % 60 });
  return t("shifts.elapsedM", { minutes });
}
