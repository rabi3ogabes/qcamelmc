/**
 * A phone number as WhatsApp-style APIs want it: digits only, country code
 * first, no "+" or leading zeros ("97455512345").
 *
 * The number's own "+code" wins; otherwise `countryCode` (default Qatar) is
 * applied. The previous implementation forced "974" onto every number, which
 * corrupted numbers from every other country.
 */
export function toWhatsAppNumber(phone: string | null | undefined, countryCode?: string | null): string | null {
  const raw = (phone ?? "").trim();
  if (!raw) return null;

  const cc = (countryCode ?? "").replace(/\D/g, "") || "974";
  let digits = raw.replace(/\D/g, "");
  if (!digits) return null;
  if (digits.startsWith("00")) digits = digits.slice(2);

  // "+966 …" is already international: its own country code wins over the default
  if (raw.startsWith("+")) return digits;

  // already international: starts with the country code and has a plausible national part
  if (digits.startsWith(cc) && digits.length - cc.length >= 7) return digits;
  return cc + digits.replace(/^0+/, "");
}
