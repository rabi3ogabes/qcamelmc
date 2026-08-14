import { supabase } from "@/integrations/supabase/client";

export const MAX_TICKETS_PER_PERSON = 5;

export interface LimitCheckHolder {
  name: string;
  idNumber?: string | null;
  phone?: string | null;
  ticketType: string;
}

export interface LimitViolation {
  name: string;
  existing: number;
  requested: number;
  remaining: number;
}

const personKey = (idNumber?: string | null, phone?: string | null) => {
  const id = (idNumber || "").replace(/\D/g, "");
  if (id.length >= 6) return `id:${id}`;
  const ph = (phone || "").replace(/\D/g, "");
  if (ph.length >= 8) return `ph:${ph.slice(-8)}`;
  return null;
};

/**
 * Checks the 5-ticket-per-person rule (normal + VIP combined, parking excluded)
 * against tickets already stored for this event, plus the tickets in the current basket.
 */
export const checkTicketLimits = async (
  holders: LimitCheckHolder[],
  eventId: string
): Promise<LimitViolation[]> => {
  const counted = holders.filter(
    (h) => h.ticketType === "normal" || h.ticketType === "vip"
  );
  if (counted.length === 0 || !eventId) return [];

  const groups = new Map<string, { name: string; idNumber?: string | null; phone?: string | null; requested: number }>();
  for (const holder of counted) {
    const key = personKey(holder.idNumber, holder.phone);
    if (!key) continue;
    const existing = groups.get(key);
    if (existing) {
      existing.requested += 1;
    } else {
      groups.set(key, {
        name: holder.name,
        idNumber: holder.idNumber,
        phone: holder.phone,
        requested: 1,
      });
    }
  }

  const violations: LimitViolation[] = [];

  await Promise.all(
    Array.from(groups.values()).map(async (group) => {
      const { data, error } = await supabase.rpc("get_person_ticket_count", {
        p_id_number: group.idNumber || "",
        p_phone: group.phone || "",
        p_event_id: eventId,
      });

      if (error) {
        console.error("Ticket limit check failed:", error);
        return; // the database trigger remains the hard guard
      }

      const existing = Number(data) || 0;
      const remaining = Math.max(0, MAX_TICKETS_PER_PERSON - existing);
      if (existing + group.requested > MAX_TICKETS_PER_PERSON) {
        violations.push({
          name: group.name,
          existing,
          requested: group.requested,
          remaining,
        });
      }
    })
  );

  return violations;
};

export const formatLimitViolation = (v: LimitViolation) =>
  v.remaining === 0
    ? `${v.name} بلغ الحد الأقصى (${MAX_TICKETS_PER_PERSON} تذاكر) لهذه الفعالية`
    : `${v.name} لديه ${v.existing} تذكرة — يمكنه إضافة ${v.remaining} فقط (طلب ${v.requested})`;

/** Turns the database trigger error into a readable Arabic message. */
export const isTicketLimitError = (error: unknown) =>
  typeof (error as { message?: string })?.message === "string" &&
  (error as { message: string }).message.includes("TICKET_LIMIT_EXCEEDED");

export const ticketLimitErrorMessage = (error: unknown) =>
  String((error as { message?: string })?.message || "")
    .replace(/^.*TICKET_LIMIT_EXCEEDED:\s*/, "")
    .trim() || `الحد الأقصى هو ${MAX_TICKETS_PER_PERSON} تذاكر لكل شخص`;

/** Remaining allowance for one person, used for badges. */
export const getRemainingAllowance = async (
  idNumber: string | null | undefined,
  phone: string | null | undefined,
  eventId: string
): Promise<number | null> => {
  if (!eventId || !personKey(idNumber, phone)) return null;
  const { data, error } = await supabase.rpc("get_person_ticket_count", {
    p_id_number: idNumber || "",
    p_phone: phone || "",
    p_event_id: eventId,
  });
  if (error) return null;
  return Math.max(0, MAX_TICKETS_PER_PERSON - (Number(data) || 0));
};
