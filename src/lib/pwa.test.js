/**
 * The install-guidance rules behind the PWA install bar.
 *
 * Android can be offered a real Install button; iOS cannot — Safari never
 * fires beforeinstallprompt — so the same bar has to teach the Share →
 * Add to Home Screen route instead, and stay silent once installed.
 */
import { describe, expect, it } from "vitest";
import { installGuidance, isIosDevice, isStandaloneDisplay } from "./pwa.js";

const IPHONE_UA =
  "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15";
const IPADOS_UA = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15";
const ANDROID_UA =
  "Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 Chrome/126.0";

describe("isIosDevice", () => {
  it("recognises iPhone, iPad and iPod user agents", () => {
    expect(isIosDevice(IPHONE_UA, "iPhone", 5)).toBe(true);
    expect(isIosDevice("Mozilla/5.0 (iPad; CPU OS 17_0)", "iPad", 5)).toBe(true);
    expect(isIosDevice("Mozilla/5.0 (iPod touch)", "iPod", 5)).toBe(true);
  });

  it("recognises iPadOS, which reports itself as a Mac with touch", () => {
    expect(isIosDevice(IPADOS_UA, "MacIntel", 5)).toBe(true);
    expect(isIosDevice(IPADOS_UA, "MacIntel", 0)).toBe(false); // a real Mac
  });

  it("does not claim Android or desktop browsers", () => {
    expect(isIosDevice(ANDROID_UA, "Linux armv8l", 5)).toBe(false);
    expect(isIosDevice("", "", 0)).toBe(false);
  });
});

describe("isStandaloneDisplay", () => {
  it("honours the iOS navigator.standalone flag", () => {
    expect(isStandaloneDisplay(null, true)).toBe(true);
    expect(isStandaloneDisplay(null, false)).toBe(false);
  });

  it("reads the display-mode media query where that is the signal", () => {
    const standalone = (q) => ({
      matches: q === "(display-mode: standalone)",
    });
    expect(isStandaloneDisplay(standalone, undefined)).toBe(true);
    expect(isStandaloneDisplay(() => ({ matches: false }), undefined)).toBe(false);
  });
});

describe("installGuidance", () => {
  const base = { deferredPrompt: null, ios: false, standalone: false, dismissed: false };

  it("offers the real prompt when Chrome provides one", () => {
    expect(installGuidance({ ...base, deferredPrompt: {} })).toBe("prompt");
  });

  it("teaches the Share route on iOS, which never provides a prompt", () => {
    expect(installGuidance({ ...base, ios: true })).toBe("ios");
  });

  it("stays silent once installed or dismissed, whatever the platform", () => {
    expect(installGuidance({ ...base, ios: true, standalone: true })).toBeNull();
    expect(installGuidance({ ...base, deferredPrompt: {}, standalone: true })).toBeNull();
    expect(installGuidance({ ...base, ios: true, dismissed: true })).toBeNull();
    expect(installGuidance({ ...base, deferredPrompt: {}, dismissed: true })).toBeNull();
  });

  it("stays silent on desktop browsers with nothing to offer", () => {
    expect(installGuidance(base)).toBeNull();
  });
});
