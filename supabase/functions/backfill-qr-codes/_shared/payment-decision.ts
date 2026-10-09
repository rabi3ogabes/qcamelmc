// AUTO-GENERATED COPY of supabase/functions/_shared/payment-decision.ts — do not edit here.
// Edit the original, then run "npm run sync:functions". Each function ships self-contained.

// Decides what to do with an order given every piece of evidence we hold.
// Pure function: the single place that encodes "when is it safe to mark an
// order as paid".
//
// THE RULE: only Sadad's own API (an authenticated server-to-server lookup)
// can confirm or fail an order. A callback/webhook — even one whose checksum
// verifies — is just a hint that triggers that lookup. A checksum cannot be
// proof of payment: Sadad hashes `secret + values sorted by key` with no
// separators, and our server signs requests containing customer-chosen text,
// so a customer can re-split a request signature into a forged "paid"
// callback that verifies (see tests/edge/sadad-core.test.ts).

import type { SadadApiResult } from "./sadad-api.ts";
import { amountsMatch, type NormalizedPayment } from "./sadad-core.ts";

export type OrderStatus = "pending" | "confirmed" | "cancelled" | "failed";

export interface DecisionInput {
  orderRef: string;
  orderTotal: number;
  orderStatus: OrderStatus;
  /** What the callback/webhook claimed. Never trusted on its own. */
  payload: NormalizedPayment | null;
  /** Whether the payload's checksumhash verified. Informational only. */
  checksumValid: boolean;
  /** Result of asking Sadad directly; null when we did not ask. */
  api: SadadApiResult | null;
}

export type Decision =
  | { action: "noop"; reason: string }
  | { action: "confirm"; via: "api"; transactionNumber: string }
  | { action: "fail"; via: "api"; reason: string }
  | { action: "pending"; reason: string }
  | { action: "review"; reason: string };

export function decidePayment(input: DecisionInput): Decision {
  if (input.orderStatus === "confirmed") return { action: "noop", reason: "already_confirmed" };

  const { api } = input;
  const claimedSuccess =
    input.payload !== null && input.payload.orderRef === input.orderRef && input.payload.status === "success";

  if (api?.kind === "success") {
    if (api.websiteRefNo && api.websiteRefNo !== input.orderRef) {
      return { action: "pending", reason: "api_reference_mismatch" };
    }
    if (!api.transactionNumber) return { action: "review", reason: "missing_transaction_number" };
    if (!amountsMatch(api.amount, input.orderTotal)) return { action: "review", reason: "amount_mismatch" };
    return { action: "confirm", via: "api", transactionNumber: api.transactionNumber };
  }

  if (api?.kind === "failed") return { action: "fail", via: "api", reason: "sadad_reported_failure" };

  // Sadad has no (successful) record. If the customer's browser or a webhook
  // nevertheless claims success we could not verify it: a person should look.
  if (claimedSuccess && (!api || api.kind === "unavailable")) {
    return { action: "review", reason: "unverified_success_api_unavailable" };
  }
  if (claimedSuccess) return { action: "pending", reason: "unverified_success" };

  return { action: "pending", reason: api?.kind ?? "no_evidence" };
}
