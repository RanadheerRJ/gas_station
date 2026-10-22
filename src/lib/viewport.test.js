import { describe, expect, it, vi } from "vitest";
import { readViewportMetrics, writeViewportMetrics } from "./viewport.js";

function windowWith({ width, height, visual } = {}) {
  return {
    innerWidth: width,
    innerHeight: height,
    document: { documentElement: { clientWidth: width } },
    visualViewport: visual,
  };
}

describe("viewport metrics", () => {
  it("uses the layout viewport when no visual viewport exists", () => {
    expect(readViewportMetrics(windowWith({ width: 390, height: 844 }))).toEqual({
      layoutWidth: 390,
      layoutHeight: 844,
      visualWidth: 390,
      visualHeight: 844,
      offsetTop: 0,
      keyboardInset: 0,
    });
  });

  it("measures an iOS keyboard that only shrinks the visual viewport", () => {
    const metrics = readViewportMetrics(
      windowWith({
        width: 390,
        height: 844,
        visual: { width: 390, height: 514, offsetTop: 0 },
      })
    );
    expect(metrics.layoutHeight).toBe(844);
    expect(metrics.visualHeight).toBe(514);
    expect(metrics.keyboardInset).toBe(330);
  });

  it("subtracts the visual offset and never returns a negative inset", () => {
    const metrics = readViewportMetrics(
      windowWith({
        width: 844,
        height: 390,
        visual: { width: 844, height: 350, offsetTop: 60 },
      })
    );
    expect(metrics.keyboardInset).toBe(0);
  });

  it("does not mistake Android's fully resized viewport for a covered one", () => {
    const metrics = readViewportMetrics(
      windowWith({
        width: 412,
        height: 600,
        visual: { width: 412, height: 600, offsetTop: 0 },
      })
    );
    expect(metrics.keyboardInset).toBe(0);
  });

  it("writes rounded CSS pixel variables", () => {
    const setProperty = vi.fn();
    writeViewportMetrics(
      { style: { setProperty } },
      {
        layoutWidth: 768,
        layoutHeight: 1024,
        visualWidth: 768,
        visualHeight: 700,
        offsetTop: 0,
        keyboardInset: 324,
      }
    );
    expect(setProperty).toHaveBeenCalledWith("--app-width", "768px");
    expect(setProperty).toHaveBeenCalledWith("--app-height", "1024px");
    expect(setProperty).toHaveBeenCalledWith("--visual-viewport-height", "700px");
    expect(setProperty).toHaveBeenCalledWith("--keyboard-inset", "324px");
  });
});
