import { supabase } from "@/integrations/supabase/client";
import { getStaffPasscode, hasStaffAccess } from "@/lib/staffAccess";

export interface LookupCustomerRecord {
  id: string;
  name: string;
  email: string | null;
  phone: string;
  country_code: string | null;
  nationality: string | null;
  id_number: string | null;
}

const hasPasscodeAccess = () => hasStaffAccess();



/**
 * Searches saved customers by phone number only.
 * Works for signed-in admins (direct query) and for staff who unlocked
 * the pages with the passcode (secure edge function).
 */
export async function searchCustomers(term: string): Promise<LookupCustomerRecord[]> {
  const cleaned = term.trim();
  if (cleaned.length < 3) return [];

  const { data: sessionData } = await supabase.auth.getSession();

  if (sessionData?.session) {
    const pattern = `%${cleaned.replace(/[%,]/g, "")}%`;
    const { data, error } = await supabase
      .from("customers")
      .select("id, name, email, phone, country_code, nationality, id_number")
      .ilike("phone", pattern)
      .order("created_at", { ascending: false })
      .limit(8);
    if (!error && data && data.length > 0) return data as LookupCustomerRecord[];
    if (!error && data) return data as LookupCustomerRecord[];
  }

  if (!hasPasscodeAccess()) return [];

  const { data, error } = await supabase.functions.invoke("staff-customer-lookup", {
    body: { term: cleaned, passcode: STAFF_PASSCODE },
  });
  if (error) throw error;
  return (data?.customers || []) as LookupCustomerRecord[];
}

/** De-duplicate results by phone + ID number, keeping the most recent record. */
export function dedupeCustomers(list: LookupCustomerRecord[]): LookupCustomerRecord[] {
  const seen = new Set<string>();
  return list.filter((c) => {
    const key = `${c.phone}|${c.id_number || ""}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}
