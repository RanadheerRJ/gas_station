/**
 * Avatars for people drawn as rows — operators on a shift, customers in the
 * credit book.
 *
 * The list is scanned, not read, so a stable colour per name carries more
 * than a photograph would: the same operator is the same colour every time,
 * in every list, without an image request. The hue is derived from the name
 * itself, so nothing has to be stored.
 */

/** A stable hue (0–359) for any name. */
export function avatarHue(name) {
  const text = String(name || "");
  let hash = 0;
  for (let i = 0; i < text.length; i += 1) hash = (hash * 31 + text.charCodeAt(i)) % 360;
  return hash;
}

/**
 * Up to two initials from a name. "Suresh Babu" → "SB", "Ravi" → "R".
 * Words are split on whitespace so an employee name with initials, a
 * hyphen or a dot inside still yields the leading letters of each word.
 */
export function initials(name) {
  const words = String(name || "")
    .trim()
    .split(/\s+/)
    .filter(Boolean);
  if (words.length === 0) return "?";
  const letters = words.slice(0, 2).map((word) => word[0]);
  return letters.join("").toUpperCase();
}
