import "../_shared/track-install.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.58.0";
import { corsHeaders } from "npm:@supabase/supabase-js@2/cors";
import { createRepo, type SupabaseLike } from "../_shared/repo.ts";
import { requireAdmin, bearer } from "../_shared/auth.ts";
import { json, HttpError, toErrorResponse } from "../_shared/http.ts";
import { sendWhatsAppInvoice } from "../_shared/send-whatsapp-invoice.ts";
import { ORDER_FESTIVAL } from "../_shared/orders-policy.ts";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  try {
    if (req.method !== "POST") throw new HttpError(405, "method_not_allowed", "Use POST");
    const url = Deno.env.get("SUPABASE_URL");
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
    if (!url || !serviceKey) throw new Error("Server configuration unavailable");
    const sb = createClient(url, serviceKey, { auth: { persistSession: false } });
    const repo = createRepo(sb as unknown as SupabaseLike);
    // Scheduler/service callers or verified administrators only, never anonymous triggers.
    if (bearer(req) !== serviceKey) await requireAdmin(req, repo);
    const { data: settings, error } = await sb.from("settings")
      .select("id, auto_invoice_interval_seconds, last_invoice_sent_at, invoice_batch_max").maybeSingle();
    if (error) throw error;
    const interval = Math.max(1, Number(settings?.auto_invoice_interval_seconds) || 60);
    const elapsed = (Date.now() - Date.parse(settings?.last_invoice_sent_at ?? "")) / 1000;
    if (elapsed < interval) return json({ message: "Interval not reached yet", seconds_remaining: Math.ceil(interval - elapsed) });
    const max = Math.min(50, Math.max(1, Number(settings?.invoice_batch_max) || 10));
    const { data: orders, error: ordersError } = await sb.from("orders")
      .select("booking_reference, events!inner(event_date,is_archived)")
      .eq("payment_method", "sadad").like("booking_reference", "QTR-%")
      .eq("payment_status", "confirmed").is("whatsapp_manually_confirmed_at", null)
      .is("n8n_response_message", null).eq("events.is_archived", false)
      .gte("events.event_date", ORDER_FESTIVAL.startUtc).lt("events.event_date", ORDER_FESTIVAL.endUtc)
      .order("created_at", { ascending: true }).limit(max);
    if (ordersError) throw ordersError;
    const results = [];
    for (const order of orders ?? []) {
      try {
        results.push({ booking_reference: order.booking_reference, ...await sendWhatsAppInvoice({ repo, fetch, reference: order.booking_reference, automatic: true }) });
      } catch (error) {
        results.push({ booking_reference: order.booking_reference, success: false, reason: error instanceof HttpError ? error.code : "send_failed" });
      }
    }
    if (results.some(result => result.success && !("skipped" in result && result.skipped))) {
      const { error: updateError } = await sb.from("settings").update({ last_invoice_sent_at: new Date().toISOString() }).eq("id", settings?.id);
      if (updateError) throw updateError;
    }
    return json({ success: true, results, next_send_in_seconds: interval });
  } catch (error) { return toErrorResponse(error); }
});
