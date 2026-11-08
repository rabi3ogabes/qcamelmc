import "../_shared/track-install.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.58.0";
import { staffIdentity } from "../_shared/staffAuth.ts";
import { HttpError, json, preflight, toErrorResponse } from "../_shared/http.ts";
import { ORDER_FESTIVAL, canManageOrders, ordersReadMode } from "../_shared/orders-policy.ts";

const FIELDS = "id, booking_reference, payment_status, payment_method, ticket_type, quantity, total_amount, created_at, event_id, payment_id, sadad_manually_verified, payment_error_reason, payment_note, customers(name, email, phone, nationality), events!inner(title, event_date, location), pos_users(name, icon), ticket_holders(ticket_type)";

Deno.serve(async (req) => {
  const options = preflight(req);
  if (options) return options;
  try {
    if (req.method !== "POST") throw new HttpError(405, "method_not_allowed");
    const body = await req.json();
    const admin = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
    const identity = await staffIdentity(req, admin, body.passcode);
    if (!identity) throw new HttpError(401, "unauthorized");
    let mode;
    try { mode = ordersReadMode(body.mode); } catch { throw new HttpError(403, "read_only"); }
    // The client cannot widen the festival, even through exact-reference search.
    const scoped = (q: any) => q.gte("events.event_date", ORDER_FESTIVAL.startUtc).lt("events.event_date", ORDER_FESTIVAL.endUtc);
    if (mode === "details") {
      if (typeof body.orderId !== "string") throw new HttpError(400, "invalid_order");
      const { data: order, error } = await scoped(admin.from("orders").select("id, event_id, events!inner(event_date)")).eq("id", body.orderId).maybeSingle();
      if (error) throw error;
      if (!order) throw new HttpError(404, "order_not_found");
      const [holders, prices] = await Promise.all([
        admin.from("ticket_holders").select("id, name, phone, nationality, ticket_type, qr_code, qr_image_url, is_present").eq("order_id", order.id),
        admin.from("tickets").select("type, price").eq("event_id", order.event_id),
      ]);
      if (holders.error) throw holders.error;
      if (prices.error) throw prices.error;
      const priceMap = Object.fromEntries((prices.data ?? []).map((p: any) => [p.type, p.price]));
      return json({ holders: (holders.data ?? []).map((h: any) => ({ ...h, price: priceMap[h.ticket_type] ?? 0 })) });
    }
    const status = body.status === "failed" ? "failed" : "success";
    const method = ["sadad", "cash_pos"].includes(body.paymentMethod) ? body.paymentMethod : "all";
    const eventId = typeof body.eventId === "string" ? body.eventId : "all";
    const page = Number.isSafeInteger(body.page) && body.page >= 0 ? Math.min(body.page, 100000) : 0;
    const pageSize = 30;
    const term = typeof body.search === "string" ? body.search.trim().slice(0, 100).replace(/[%,().]/g, "") : "";
    const base = (q: any, paymentMethod = method) => {
      q = scoped(q);
      if (paymentMethod !== "all") q = q.eq("payment_method", paymentMethod);
      if (eventId !== "all") q = q.eq("event_id", eventId);
      if (body.upcomingOnly === true) {
        const today = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Qatar", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date());
        q = q.gte("events.event_date", `${today}T00:00:00+03:00`);
      }
      return q;
    };
    const byStatus = (q: any, s = status) => s === "success" ? q.eq("payment_status", "confirmed") : q.in("payment_status", ["pending", "cancelled"]);
    const count = async (s: string, m = method) => {
      const res = await byStatus(base(admin.from("orders").select("id, events!inner(event_date)", { count: "exact", head: true }), m), s);
      if (res.error) throw res.error;
      return res.count ?? 0;
    };
    const list = async () => {
      if (term) {
        const query = (fields: string) => byStatus(base(admin.from("orders").select(fields))).order("created_at", { ascending: false }).limit(100);
        const [refs, customers] = await Promise.all([
          query(FIELDS).ilike("booking_reference", `%${term}%`),
          query(FIELDS.replace("customers(", "customers!inner(")).or(`name.ilike.%${term}%,phone.ilike.%${term}%`, { referencedTable: "customers" }),
        ]);
        if (refs.error) throw refs.error;
        if (customers.error) throw customers.error;
        const rows = Array.from(new Map([...(refs.data ?? []), ...(customers.data ?? [])].map((o: any) => [o.id, o])).values()).sort((a: any, b: any) => Date.parse(b.created_at) - Date.parse(a.created_at));
        return { orders: rows, totalCount: rows.length };
      }
      const res = await byStatus(base(admin.from("orders").select(FIELDS, { count: "exact" }))).order("created_at", { ascending: false }).range(page * pageSize, (page + 1) * pageSize - 1);
      if (res.error) throw res.error;
      return { orders: res.data ?? [], totalCount: res.count ?? 0 };
    };
    const [result, success, failed, methodAll, methodSadad, methodCashPos] = await Promise.all([list(), count("success"), count("failed"), count("success", "all"), count("success", "sadad"), count("success", "cash_pos")]);
    return json({ ...result, stats: { success, failed, methodAll, methodSadad, methodCashPos }, canManage: canManageOrders(identity) });
  } catch (error) { return toErrorResponse(error); }
});