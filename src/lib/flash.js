/**
 * A one-shot message between two screens.
 *
 * Navigation in this app is deliberately plain — `navigate("/today")`, with
 * nothing encoded in the URL — and some tests pin those exact targets. A
 * screen that needs to tell the next screen "this just happened" (a shift
 * was submitted for review) therefore passes a token through sessionStorage
 * instead: set before navigating, read-and-cleared on the first render of
 * the destination, gone on any later visit or reload-that-lingers.
 *
 * sessionStorage rather than localStorage so the note cannot outlive the
 * tab and greet someone tomorrow morning. Storage failures (private mode)
 * degrade to "no flash" — the note is a courtesy, never a dependency.
 */

const PREFIX = "petrav.flash.";

/** Leave a note for the screen being navigated to. */
export function setFlash(name, value = "1") {
  try {
    window.sessionStorage.setItem(PREFIX + name, String(value));
  } catch {
    /* storage blocked; the destination simply shows no note */
  }
}

/** Read the note and clear it, so it is shown exactly once. */
export function takeFlash(name) {
  try {
    const key = PREFIX + name;
    const value = window.sessionStorage.getItem(key);
    if (value != null) window.sessionStorage.removeItem(key);
    return value;
  } catch {
    return null;
  }
}
