import { supabase } from "@/integrations/supabase/client";

export interface PersonEventHistoryItem {
  eventId: string;
  title: string;
  date: string | null;
  count: number;
}

/**
 * Returns the confirmed tickets a person took in every previous event,
 * grouped by event and sorted newest first.
 * Person is matched by ID number when available, otherwise by the last
 * 8 digits of the phone number.
 */
export const getPersonEventHistory = async (
  idNumber?: string | null,
  phone?: string | null
): Promise<PersonEventHistoryItem[]> => {
  const id = (idNumber || "").replace(/\D/g, "");
  const ph = (phone || "").replace(/\D/g, "").slice(-8);
  if (id.length < 6 && ph.length < 8) return [];

  let query = supabase
    .from("ticket_holders")
    .select(
      "ticket_type, orders!inner(payment_status, event_id, events!inner(title, event_date))"
    )
    .eq("orders.payment_status", "confirmed")
    .limit(500);

  query = id.length >= 6 ? query.eq("id_number", id) : query.ilike("phone", `%${ph}`);

  const { data, error } = await query;
  if (error) {
    console.error("Person event history failed:", error);
    return [];
  }

  const map = new Map<string, PersonEventHistoryItem>();
  (data || []).forEach((row: any) => {
    const order = row.orders;
    if (!order?.events) return;
    const key = order.event_id as string;
    const current = map.get(key);
    if (current) {
      current.count += 1;
    } else {
      map.set(key, {
        eventId: key,
        title: order.events.title,
        date: order.events.event_date ?? null,
        count: 1,
      });
    }
  });

  return Array.from(map.values()).sort(
    (a, b) => new Date(b.date || 0).getTime() - new Date(a.date || 0).getTime()
  );
};

export const formatHistoryDate = (date: string | null) =>
  date
    ? new Date(date).toLocaleDateString("ar-u-nu-latn", {
        day: "2-digit",
        month: "short",
        year: "numeric",
        timeZone: "Asia/Qatar",
      })
    : "";
