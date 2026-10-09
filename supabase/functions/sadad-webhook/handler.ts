// Sadad's server-to-server notification (JSON POST). Sadad's guidance: always
// answer 200 {"status":"success"} and process idempotently — a non-200 only
// triggers retries. The body is treated as a trigger and verified with Sadad
// before any order changes; every delivery is written to the audit trail.

import { processPayment } from "./_shared/payment-processor.ts";
import { makeProcessorDeps, readPaymentPayload } from "./_shared/payment-wiring.ts";
import type { Repo } from "./_shared/repo.ts";
import { normalizePaymentPayload, verifyChecksum } from "./_shared/sadad-core.ts";

export interface WebhookDeps {
  repo: Repo;
  fetch: typeof fetch;
  supabaseUrl: string;
  waitUntil?: (work: Promise<unknown>) => void;
  now?: () => Date;
}

const ACK = () =>
  new Response(JSON.stringify({ status: "success" }), {
    status: 200,
    headers: { "Content-Type": "application/json" },
  });

export function sadadWebhookHandler(deps: WebhookDeps) {
  return async (req: Request): Promise<Response> => {
    try {
      const payload = await readPaymentPayload(req);
      const normalized = normalizePaymentPayload(payload);
      if (normalized) {
        const settings = await deps.repo.getPrivateSettings();
        const checksumValid = settings.secret ? await verifyChecksum(payload, settings.secret) : false;
        await processPayment(
          { orderRef: normalized.orderRef, payload: normalized, rawPayload: payload, checksumValid, source: "webhook" },
          makeProcessorDeps({ repo: deps.repo, settings, fetch: deps.fetch, now: deps.now, waitUntil: deps.waitUntil }),
        );
      }
    } catch (error) {
      console.error("sadad webhook failed:", error instanceof Error ? error.message : error);
    }
    return ACK();
  };
}
