/**
 * Per-person ticket totals for the live bookings page, counted ONLY from the
 * tickets currently loaded for the actual (current) festival event(s).
 *
 * People are identified by their national/ID number when available, otherwise by
 * a normalized phone number (last 8 digits, ignoring country code / formatting).
 */
export const normalizePersonKeys = (phone?: string | null, idNumber?: string | null): string[] => {
  const keys: string[] = [];
  const id = (idNumber || "").replace(/\D/g, "");
  if (id.length >= 6) keys.push(`id:${id}`);
  const digits = (phone || "").replace(/\D/g, "");
  if (digits.length >= 8) keys.push(`ph:${digits.slice(-8)}`);
  return keys;
};

/** Counts each loaded ticket row per person key (one entry per ticket holder). */
export const buildPersonTicketTotals = (
  holders: Array<{ phone?: string | null; id_number?: string | null }>
): Record<string, number> => {
  const totals: Record<string, number> = {};
  holders.forEach((h) => {
    normalizePersonKeys(h.phone, h.id_number).forEach((key) => {
      totals[key] = (totals[key] || 0) + 1;
    });
  });
  return totals;
};

/** Best-known total for a person: the max across their matching keys. */
export const personTotalFromMap = (
  totals: Record<string, number>,
  phone?: string | null,
  idNumber?: string | null
): number => normalizePersonKeys(phone, idNumber).reduce((max, k) => Math.max(max, totals[k] || 0), 0);
