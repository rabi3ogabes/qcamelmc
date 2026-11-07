import { describe, expect, it } from "vitest";
import { parseReceiptOutput, RECEIPT_OUTPUT } from "../../supabase/functions/parse-pos-receipt/output.ts";
describe("receipt reading output", () => {
  it("keeps the 500-token limit but reserves it for JSON rather than reasoning", () => {
    expect(RECEIPT_OUTPUT.max_tokens).toBe(500);
    expect(RECEIPT_OUTPUT.reasoning_effort).toBe("none");
    expect(RECEIPT_OUTPUT.response_format.type).toBe("json_object");
  });
  it("reads the supplied receipt values without changing masking or leading zeros", () => {
    expect(parseReceiptOutput(JSON.stringify({amount_qar:200,seq_number:"001036002",card_number_masked:"445327******0542",time:"12:06:02",auth_number:"020459"}),"stop")).toEqual({amount_qar:200,seq_number:"001036002",card_number_masked:"445327******0542",time:"12:06:02",auth_number:"020459"});
  });
  it("refuses truncated output instead of saving incomplete receipt data", () => {
    expect(()=>parseReceiptOutput('{"amount_qar":200,',"length")).toThrow("incomplete");
  });
  it("refuses missing fields",()=>{
    expect(()=>parseReceiptOutput('{"amount_qar":200}',"stop")).toThrow("Incomplete");
  });
});