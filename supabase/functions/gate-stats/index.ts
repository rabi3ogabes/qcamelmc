import { createClient } from "https://esm.sh/@supabase/supabase-js@2.58.0";
import { isStaffAuthorized, unauthorizedResponse } from "../_shared/staffAuth.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });

/** Live gate board: issued vs scanned tickets for the current event. */
Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const body = await req.json().catch(() => ({}));
    const admin = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
      { auth: { persistSession: false } },
    );

    if (!(await isStaffAuthorized(req, admin, body?.passcode))) {
      return unauthorizedResponse(corsHeaders);
    }

    let eventId: string | null = typeof body?.event_id === "string" ? body.event_id : null;
    if (!eventId) {
      const { data: settings } = await admin
        .from("settings")
        .select("current_event_id")
        .maybeSingle();
      eventId = settings?.current_event_id ?? null;
    }
    if (!eventId) return json({ error: "no_current_event" }, 400);

    const { data: event } = await admin
      .from("events")
      .select("id, title, event_date")
      .eq("id", eventId)
      .maybeSingle();

    const { data: orders, error: ordersError } = await admin
      .from("orders")
      .select("id")
      .eq("event_id", eventId)
      .eq("payment_status", "confirmed");
    if (ordersError) return json({ error: ordersError.message }, 500);

    const orderIds = (orders ?? []).map((o: { id: string }) => o.id);
    if (!orderIds.length) {
      return json({ event, totals: {}, recent: [], generated_at: new Date().toISOString() });
    }

    // Pull holders in chunks so the 1000-row cap never truncates the board.
    type Holder = {
      id: string;
      name: string;
      ticket_type: string;
      is_present: boolean | null;
      confirmed_at: string | null;
      confirmed_by_name: string | null;
    };
    const holders: Holder[] = [];
    for (let i = 0; i < orderIds.length; i += 200) {
      const chunk = orderIds.slice(i, i + 200);
      let from = 0;
      while (true) {
        const { data, error } = await admin
          .from("ticket_holders")
          .select("id, name, ticket_type, is_present, confirmed_at, confirmed_by_name")
          .in("order_id", chunk)
          .range(from, from + 999);
        if (error) return json({ error: error.message }, 500);
        holders.push(...((data ?? []) as Holder[]));
        if (!data || data.length < 1000) break;
        from += 1000;
      }
    }

    const totals: Record<string, { issued: number; scanned: number }> = {};
    for (const h of holders) {
      const key = h.ticket_type || "normal";
      totals[key] ??= { issued: 0, scanned: 0 };
      totals[key].issued += 1;
      if (h.is_present) totals[key].scanned += 1;
    }

    const recent = holders
      .filter((h) => h.is_present && h.confirmed_at)
      .sort((a, b) => (a.confirmed_at! < b.confirmed_at! ? 1 : -1))
      .slice(0, 25)
      .map((h) => ({
        id: h.id,
        name: h.name,
        ticket_type: h.ticket_type,
        confirmed_at: h.confirmed_at,
        confirmed_by_name: h.confirmed_by_name,
      }));

    return json({
      event,
      totals,
      issued: holders.length,
      scanned: holders.filter((h) => h.is_present).length,
      recent,
      generated_at: new Date().toISOString(),
    });
  } catch (e) {
    return json({ error: (e as Error).message }, 500);
  }
});
