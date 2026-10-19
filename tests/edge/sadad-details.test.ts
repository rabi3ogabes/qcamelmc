import { assertEquals } from "jsr:@std/assert@1";
import { toTransactionDetails } from "../../supabase/functions/_shared/sadad-api.ts";

Deno.test("Sadad details: status, mode, amount and fees from the documented response", () => {
  const d = toTransactionDetails({
    invoicenumber: "SD33X8", amount: 1, servicecharge: 0.025, refundcharge: 0, isRefund: false,
    transactionstatus: { name: "SUCCESS", id: 3 }, transactionmode: { name: "CREDIT CARD", id: 1 },
  } as never);
  assertEquals([d.status, d.mode, d.amount, d.commission, d.netAmount], ["SUCCESS", "CREDIT CARD", 1, 0.025, 0.975]);
});

Deno.test("Sadad details: falls back to status/mode ids", () => {
  const d = toTransactionDetails({ invoicenumber: "X", amount: 3, transactionstatusId: 7, transactionmodeId: 3 } as never);
  assertEquals([d.status, d.mode], ["REJECTED", "SADAD"]);
});
