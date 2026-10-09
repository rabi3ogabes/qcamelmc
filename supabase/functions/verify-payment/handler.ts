// POST /verify-payment { booking_reference }
//
// "Did my payment go through?" — asks Sadad directly and settles the order if
// it was paid. Callable by the customer's result page (throttled per order so
// it cannot be used to hammer Sadad) and by administrators (unthrottled).

import { optionalAdmin } from "./_shared/auth.ts";
import { HttpError, json, preflight, readJson, toErrorResponse } from "./_shared/http.ts";
import { processPayment } from "./_shared/payment-processor.ts";
import { makeProcessorDeps } from "./_shared/payment-wiring.ts";
import type { Repo } from "./_shared/repo.ts";

export interface VerifyDeps {
  repo: Repo;
  fetch: typeof fetch;
  supabaseUrl: string;
  waitUntil?: (work: Promise<unknown>) => void;
  now?: () => Date;
}

const SAFE_REF = /^[A-Za-z0-9][A-Za-z0-9_-]{0,59}$/;

export function verifyPaymentHandler(deps: VerifyDeps) {
  return async (req: Request): Promise<Response> => {
    const early = preflight(req);
    if (early) return early;

    try {
      if (req.method !== "POST") throw new HttpError(405, "method_not_allowed", "Use POST");
      const body = (await readJson(req)) as { booking_reference?: unknown };
      const ref = typeof body?.booking_reference === "string" ? body.booking_reference.trim() : "";
      if (!SAFE_REF.test(ref)) throw new HttpError(400, "invalid_reference", "Invalid booking reference");

      const order = await deps.repo.getPaymentOrder(ref);
      if (!order) throw new HttpError(404, "order_not_found", "Booking not found");
      if (order.payment_status === "confirmed") {
        return json({ success: true, checked: false, payment_status: "confirmed" });
      }

      const adminId = await optionalAdmin(req, deps.repo);
      const allowed = adminId !== null || (await deps.repo.claimPaymentCheck(ref)) !== null;

      if (allowed) {
        const settings = await deps.repo.getPrivateSettings();
        await processPayment(
          { orderRef: ref, payload: null, rawPayload: null, checksumValid: false, source: adminId ? "admin" : "poll" },
          makeProcessorDeps({ repo: deps.repo, settings, fetch: deps.fetch, now: deps.now, waitUntil: deps.waitUntil }),
        );
      }

      const fresh = await deps.repo.getPaymentOrder(ref);
      return json({
        success: true,
        checked: allowed,
        payment_status: fresh?.payment_status ?? order.payment_status,
      });
    } catch (error) {
      return toErrorResponse(error);
    }
  };
}
