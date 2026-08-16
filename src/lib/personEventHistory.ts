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
  const ph = (phone || "").replace(/\D/g, "");
  if (id.length < 6 && ph.length < 8) return [];

  const { data, error } = await supabase.rpc("get_person_event_history", {
    p_id_number: id,
    p_phone: ph,
  });

  if (error) {
    console.error("Person event history failed:", error);
    return [];
  }

  return (data || []).map((row: any) => ({
    eventId: row.event_id as string,
    title: row.title as string,
    date: (row.event_date as string) ?? null,
    count: Number(row.ticket_count) || 0,
  }));
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
