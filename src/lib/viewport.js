/**
 * Keep CSS viewport metrics in step with the browser's actual viewports.
 *
 * `100dvh` covers modern browsers, but older iOS releases and installed PWAs
 * still disagree about the height once browser chrome, rotation, or the
 * software keyboard changes. CSS has a dynamic-height fallback everywhere;
 * this module adds measured values without user-agent or device detection.
 *
 * Layout metrics size the app shell. Visual-viewport metrics describe the
 * keyboard for sheets and other overlays. Updates are animation-frame
 * batched so rotating or dragging browser chrome cannot flood style/layout.
 */

export function readViewportMetrics(windowRef) {
  const documentRef = windowRef?.document;
  const visual = windowRef?.visualViewport;
  const layoutWidth = Math.max(
    0,
    Math.round(documentRef?.documentElement?.clientWidth || windowRef?.innerWidth || 0)
  );
  const layoutHeight = Math.max(0, Math.round(windowRef?.innerHeight || 0));
  const visualWidth = Math.max(0, Math.round(visual?.width || layoutWidth));
  const visualHeight = Math.max(0, Math.round(visual?.height || layoutHeight));
  const offsetTop = Math.max(0, Math.round(visual?.offsetTop || 0));

  return {
    layoutWidth,
    layoutHeight,
    visualWidth,
    visualHeight,
    offsetTop,
    // On iOS the keyboard shrinks the visual viewport but not innerHeight.
    // On Android both may shrink; the same calculation then correctly
    // describes only the part still covered at the bottom.
    keyboardInset: Math.max(0, layoutHeight - visualHeight - offsetTop),
  };
}

export function writeViewportMetrics(root, metrics) {
  if (!root || !metrics) return;
  const values = {
    "--app-width": metrics.layoutWidth,
    "--app-height": metrics.layoutHeight,
    "--visual-viewport-width": metrics.visualWidth,
    "--visual-viewport-height": metrics.visualHeight,
    "--visual-viewport-offset-top": metrics.offsetTop,
    "--keyboard-inset": metrics.keyboardInset,
  };
  for (const [name, value] of Object.entries(values)) {
    if (
      value > 0 ||
      name === "--keyboard-inset" ||
      name === "--visual-viewport-offset-top"
    ) {
      root.style.setProperty(name, `${value}px`);
    }
  }
}

/**
 * Install listeners for the lifetime of the app. Returns a cleanup function
 * for tests and embedded hosts; normal app startup never needs to call it.
 */
export function installViewportMetrics(documentRef = globalThis.document) {
  const windowRef = documentRef?.defaultView || globalThis.window;
  const root = documentRef?.documentElement;
  if (!windowRef || !root) return () => {};

  let frame = null;
  let orientationTimer = null;
  const apply = () => writeViewportMetrics(root, readViewportMetrics(windowRef));
  const run = () => {
    frame = null;
    apply();
  };
  const schedule = () => {
    if (frame !== null) return;
    if (typeof windowRef.requestAnimationFrame === "function") {
      frame = windowRef.requestAnimationFrame(run);
    } else {
      frame = windowRef.setTimeout(run, 16);
    }
  };
  const onOrientationChange = () => {
    schedule();
    // Some WebKit versions report the old dimensions during orientationchange
    // and the new ones on the following resize tick.
    if (orientationTimer !== null) windowRef.clearTimeout(orientationTimer);
    orientationTimer = windowRef.setTimeout(schedule, 250);
  };

  apply();
  windowRef.addEventListener("resize", schedule, { passive: true });
  windowRef.addEventListener("orientationchange", onOrientationChange, { passive: true });
  const visual = windowRef.visualViewport;
  visual?.addEventListener("resize", schedule, { passive: true });
  visual?.addEventListener("scroll", schedule, { passive: true });

  return () => {
    windowRef.removeEventListener("resize", schedule);
    windowRef.removeEventListener("orientationchange", onOrientationChange);
    visual?.removeEventListener("resize", schedule);
    visual?.removeEventListener("scroll", schedule);
    if (orientationTimer !== null) windowRef.clearTimeout(orientationTimer);
    if (frame !== null) {
      if (typeof windowRef.cancelAnimationFrame === "function") {
        windowRef.cancelAnimationFrame(frame);
      } else {
        windowRef.clearTimeout(frame);
      }
    }
  };
}
