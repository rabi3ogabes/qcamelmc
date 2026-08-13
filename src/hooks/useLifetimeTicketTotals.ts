import { useCallback, useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";

/**
 * Builds a map of "lifetime" ticket totals per person, counting every confirmed
 * ticket across ALL events (current season + archived seasons).
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

export const useLifetimeTicketTotals = () => {
  const [totals, setTotals] = useState<Record<string, number>>({});
  const [loading, setLoading] = useState(true);

  const fetchTotals = useCallback(async () => {
    try {
      // Aggregated in the database — avoids downloading every ticket row.
      const { data, error } = await supabase.rpc("get_lifetime_ticket_totals");
      if (error) throw error;

      const map: Record<string, number> = {};
      (data || []).forEach((row) => {
        map[row.person_key] = Number(row.total) || 0;
      });

      setTotals(map);
    } catch (e) {
      console.error("Error computing lifetime ticket totals:", e);
    } finally {
      setLoading(false);
    }
  }, []);


  useEffect(() => {
    fetchTotals();
  }, [fetchTotals]);

  const getTotal = useCallback(
    (phone?: string | null, idNumber?: string | null): number => {
      const keys = normalizePersonKeys(phone, idNumber);
      return keys.reduce((max, k) => Math.max(max, totals[k] || 0), 0);
    },
    [totals]
  );

  return { getTotal, loading, refresh: fetchTotals };
};
