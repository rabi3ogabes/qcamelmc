import { describe, expect, it } from "vitest";
import { toTransactionDetails } from "../../supabase/functions/_shared/sadad-api";

describe("Sadad transaction details", () => {
  it("reads status, mode, amount and fees from the documented response", () => {
    const d = toTransactionDetails({
      invoicenumber: "SD33X8", amount: 1, servicecharge: 0.025, refundcharge: 0, isRefund: false,
      transactionstatus: { name: "SUCCESS", id: 3 }, transactionmode: { name: "CREDIT CARD", id: 1 },
    } as never);
    expect([d.status, d.mode, d.amount, d.commission, d.netAmount]).toEqual(["SUCCESS", "CREDIT CARD", 1, 0.025, 0.975]);
  });
  it("falls back to status and mode ids", () => {
    const d = toTransactionDetails({ invoicenumber: "X", amount: 3, transactionstatusId: 7, transactionmodeId: 3 } as never);
    expect([d.status, d.mode]).toEqual(["REJECTED", "SADAD"]);
  });
});
