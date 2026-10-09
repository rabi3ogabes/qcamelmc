// POST /sadad-payment { booking_reference }
//
// Re-issues the signed Sadad checkout request for an order that is still
// waiting for payment (e.g. the customer closed the payment page). Everything
// — amount, customer, items — is read from the stored order, never from the
// caller.

import { HttpError, json, preflight, readJson, toErrorResponse } from "./_shared/http.ts";
import type { Repo } from "./_shared/repo.ts";
import { buildCheckoutRequest, toSadadMobile } from "./_shared/sadad-core.ts";
import { callbackUrlFor, fallbackEmail, isSadadConfigured } from "./_shared/settings.ts";

export interface SadadPaymentDeps {
  repo: Repo;
  supabaseUrl: string;
  now?: () => Date;
}

const SAFE_REF = /^[A-Za-z0-9][A-Za-z0-9_-]{0,59}$/;

const TICKET_LABELS: Record<string, string> = {
  vip: "تذكرة VIP",
  normal: "تذكرة دخول عامة",
  parking: "تصريح مواقف",
};

export function sadadPaymentHandler(deps: SadadPaymentDeps) {
  return async (req: Request): Promise<Response> => {
    const early = preflight(req);
    if (early) return early;

    try {
      if (req.method !== "POST") throw new HttpError(405, "method_not_allowed", "Use POST");
      const body = (await readJson(req)) as { booking_reference?: unknown };
      const ref = typeof body?.booking_reference === "string" ? body.booking_reference.trim() : "";
      if (!SAFE_REF.test(ref)) throw new HttpError(400, "invalid_reference", "Invalid booking reference");

      const context = await deps.repo.getOrderContext(ref);
      if (!context) throw new HttpError(404, "order_not_found", "Booking not found");

      const { order, customer, holders, prices } = context;
      if (order.payment_status !== "pending" || (order as { payment_method?: string }).payment_method !== "sadad") {
        throw new HttpError(409, "not_payable", "This booking is not waiting for an online payment");
      }

      const settings = await deps.repo.getPrivateSettings();
      if (!isSadadConfigured(settings)) {
        throw new HttpError(503, "payment_unavailable", "Online payment is not available right now");
      }

      const counts = new Map<string, number>();
      for (const holder of holders) counts.set(String(holder.ticket_type), (counts.get(String(holder.ticket_type)) ?? 0) + 1);
      const items = [...counts.entries()]
        .map(([type, quantity]) => ({ name: TICKET_LABELS[type] ?? type, price: prices[type] ?? 0, quantity }))
        .filter((item) => item.price > 0);

      const payment = await buildCheckoutRequest({
        merchantId: settings.merchantId as string,
        secret: settings.secret as string,
        orderId: order.booking_reference,
        amount: Number(order.total_amount),
        website: settings.websiteDomain as string,
        callbackUrl: callbackUrlFor(deps.supabaseUrl),
        mobile: toSadadMobile(String(customer.phone ?? ""), String(customer.country_code ?? "+974")),
        email: String(customer.email ?? "").trim() || fallbackEmail(settings.websiteDomain),
        now: deps.now?.(),
        items,
      });

      return json({ success: true, payment }, 200, { "Cache-Control": "no-store" });
    } catch (error) {
      return toErrorResponse(error);
    }
  };
}
