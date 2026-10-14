import "../_shared/track-install.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.58.0";
import { passcodeMatches, passcodeProblem } from "../_shared/auth.ts";
import { evaluateThrottle } from "../_shared/throttle.ts";

/**
 * Read-only data feed for the live bookings screen, unlocked by the
 * LIVE_BOOKINGS_PASSWORD secret (separate from the team passcode).
 * Wrong guesses are throttled per IP: 5 in 15 minutes -> blocked 30 minutes.
 */
const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...cors, "Content-Type": "application/json" } });

const admin = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!, {
  auth: { persistSession: false, autoRefreshToken: false },
});
const RULE = { max: 5, windowMs: 15 * 60_000, blockMs: 30 * 60_000 };
const ORDER_SELECT =
  "*, customers(name, email, phone, id_number, nationality), events!inner(title, event_date), ticket_holders(*), pos_users(name, icon)";
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

async function pageAll(build: (from: number, to: number) => any) {
  const all: any[] = [];
  for (let from = 0; ; from += 1000) {
    const { data, error } = await build(from, from + 999);
    if (error) throw error;
    if (data?.length) all.push(...data);
    if (!data || data.length < 1000) break;
  }
  return all;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: cors });
  try {
    const body = await req.json().catch(() => ({}));
    const configured = Deno.env.get("LIVE_BOOKINGS_PASSWORD") ?? null;
    if (passcodeProblem(configured)) return json({ error: "not_configured" }, 503);

    const ip = (req.headers.get("x-forwarded-for") ?? "").split(",")[0].trim() || "unknown";
    const identifier = `live-bookings:${ip}`;
    const since = new Date(Date.now() - RULE.windowMs - RULE.blockMs).toISOString();
    const { data: attempts } = await admin
      .from("login_attempts").select("attempted_at, success")
      .eq("identifier", identifier).gte("attempted_at", since).limit(200);
    const state = evaluateThrottle(attempts ?? [], RULE, Date.now());
    if (state.blocked) return json({ error: "blocked", retry_after: state.retryAfterSeconds }, 429);

    if (!passcodeMatches(body?.password, configured)) {
      await admin.from("login_attempts").insert({
        identifier, kind: "passcode", success: false, ip_address: ip, user_agent: req.headers.get("user-agent"),
      });
      return json({ error: "wrong_password", attempts_left: Math.max(0, state.attemptsLeft - 1) }, 401);
    }

    const action = body?.action;
    if (action === "verify") {
      await admin.from("login_attempts").insert({
        identifier, kind: "passcode", success: true, ip_address: ip, user_agent: req.headers.get("user-agent"),
      });
      return json({ ok: true });
    }

    if (action === "active_events") {
      const { data, error } = await admin.from("events").select("id, event_date").eq("is_active", true)
        .order("event_date", { ascending: true });
      if (error) throw error;
      const { data: st } = await admin.from("settings").select("live_refresh_mode").limit(1).maybeSingle();
      return json({ data, mode: st?.live_refresh_mode ?? "always" });
    }

    if (action === "bookings") {
      const { dateStr, nextDayStr } = body;
      const orders = await pageAll((from, to) => {
        let q = admin.from("orders").select(ORDER_SELECT).eq("payment_status", "confirmed")
          .order("created_at", { ascending: false }).range(from, to);
        if (DATE_RE.test(dateStr ?? "") && DATE_RE.test(nextDayStr ?? "")) {
          q = q.gte("events.event_date", dateStr).lt("events.event_date", nextDayStr);
        }
        return q;
      });
      const { data: logs } = await admin.from("activity_logs").select("action_data")
        .eq("activity_type", "pos_form").limit(500);
      let eventId: string | null = orders[0]?.event_id ?? null;
      if (!eventId && DATE_RE.test(dateStr ?? "") && DATE_RE.test(nextDayStr ?? "")) {
        const { data: ev } = await admin.from("events").select("id").gte("event_date", dateStr)
          .lt("event_date", nextDayStr).eq("is_active", true).limit(1).maybeSingle();
        eventId = ev?.id ?? null;
      }
      let capacities: unknown[] = [];
      if (eventId) {
        const { data } = await admin.from("tickets").select("type, available_quantity").eq("event_id", eventId);
        capacities = data ?? [];
      }
      return json({ orders, logs: logs ?? [], capacities });
    }

    if (action === "daily_sales") {
      const holders = await pageAll((from, to) =>
        admin.from("ticket_holders")
          .select("id, ticket_type, order_id, created_at, orders!inner(payment_status, event_id, total_amount, events!inner(title, event_date))")
          .eq("orders.payment_status", "confirmed").order("created_at", { ascending: false }).range(from, to)
      );
      const { data: prices } = await admin.from("tickets").select("event_id, type, price");
      return json({ holders, prices: prices ?? [] });
    }

    return json({ error: "unknown_action" }, 400);
  } catch (e) {
    return json({ error: e instanceof Error ? e.message : "error" }, 500);
  }
});
