/**
 * Field validation shared by the account-provisioning forms.
 *
 * The server (the accounts Edge Function) re-validates everything it is
 * given; these checks exist so the user is told immediately instead of after
 * a round trip. Each problem is returned as a translation key, so the message
 * renders in the interface language the way the rest of the form does.
 */

/** Returns the translation key for the problem with this phone number, or null. */
export function phoneProblem(phone) {
  const digits = String(phone ?? "").replace(/\D/g, "");
  if (!digits) return "common.phoneRequired";
  if (digits.length < 10 || digits.length > 15) return "common.phoneProblem";
  return null;
}
