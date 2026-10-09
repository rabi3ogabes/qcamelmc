// Sadad sends the customer's browser back here (POST form, or GET) after the
// hosted checkout. The page is only a trigger: the payment is verified with
// Sadad before anything is confirmed, then the customer is sent on to the
// shop's result page, which shows the real, server-side status.

import { processPayment } from "./_shared/payment-processor.ts";
import { makeProcessorDeps, readPaymentPayload } from "./_shared/payment-wiring.ts";
import type { Repo } from "./_shared/repo.ts";
import { normalizePaymentPayload, verifyChecksum } from "./_shared/sadad-core.ts";
import { resolveReturnBase } from "./_shared/settings.ts";

export interface CallbackDeps {
  repo: Repo;
  fetch: typeof fetch;
  supabaseUrl: string;
  waitUntil?: (work: Promise<unknown>) => void;
  now?: () => Date;
}

const page = (ref: string | null) =>
  `<!doctype html><html lang="ar" dir="rtl"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">` +
  `<title>Payment</title></head><body style="font-family:system-ui,sans-serif;text-align:center;padding:3rem 1rem">` +
  `<h1>تم استلام عملية الدفع</h1><p>Payment received. You can close this page.</p>` +
  (ref ? `<p dir="ltr"><strong>${ref}</strong></p>` : "") +
  `<p>سيصلك التأكيد قريباً. / Your confirmation will follow shortly.</p></body></html>`;

export function sadadCallbackHandler(deps: CallbackDeps) {
  return async (req: Request): Promise<Response> => {
    let ref: string | null = null;
    let siteUrl: string | null = null;
    let returnOrigin: string | null = null;

    try {
      const payload = await readPaymentPayload(req);
      const normalized = normalizePaymentPayload(payload);
      const settings = await deps.repo.getPrivateSettings();
      siteUrl = settings.siteUrl;

      if (normalized) {
        ref = normalized.orderRef;
        const checksumValid = settings.secret ? await verifyChecksum(payload, settings.secret) : false;
        const result = await processPayment(
          { orderRef: ref, payload: normalized, rawPayload: payload, checksumValid, source: "callback" },
          makeProcessorDeps({ repo: deps.repo, settings, fetch: deps.fetch, now: deps.now, waitUntil: deps.waitUntil }),
        );
        returnOrigin = result.order?.return_origin ?? null;
      }
    } catch (error) {
      // The customer must always land somewhere sensible, whatever went wrong here.
      console.error("sadad callback failed:", error instanceof Error ? error.message : error);
    }

    const base = resolveReturnBase(siteUrl, returnOrigin);
    if (base) {
      const location = ref ? `${base}/payment/result?ref=${encodeURIComponent(ref)}` : `${base}/`;
      return new Response(null, { status: 303, headers: { Location: location, "Cache-Control": "no-store" } });
    }
    return new Response(page(ref), {
      status: 200,
      headers: { "Content-Type": "text/html; charset=utf-8", "Cache-Control": "no-store" },
    });
  };
}
