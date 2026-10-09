import { describe, expect, it } from "vitest";
import { normalizeScannedCode } from "./tickets";

describe("normalizeScannedCode", () => {
  it("leaves a ticket code alone", () => {
    expect(normalizeScannedCode("QTR-ABC123DEF456-TKT01")).toBe("QTR-ABC123DEF456-TKT01");
    expect(normalizeScannedCode("POS-0123456789AB-TKT12")).toBe("POS-0123456789AB-TKT12");
  });

  it("trims whitespace and stray newlines from a scanner", () => {
    expect(normalizeScannedCode("  QTR-A-TKT01\r\n")).toBe("QTR-A-TKT01");
  });

  it("turns the image URL that older printed tickets encode back into the ticket code", () => {
    expect(
      normalizeScannedCode("https://abc.supabase.co/storage/v1/object/public/qr-codes/QTR-ABC123DEF456-TKT01.png"),
    ).toBe("QTR-ABC123DEF456-TKT01");
    expect(normalizeScannedCode("https://x.co/qr-codes/QTR-A-TKT02.png?t=123")).toBe("QTR-A-TKT02");
  });

  it("handles an empty or odd scan without throwing", () => {
    expect(normalizeScannedCode("")).toBe("");
    expect(normalizeScannedCode("   ")).toBe("");
  });
});
