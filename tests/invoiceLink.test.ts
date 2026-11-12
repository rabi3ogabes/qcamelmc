import { describe, expect, it } from "vitest";
import { invoicePageUrl } from "../src/lib/invoiceLink";

describe("invoicePageUrl", () => {
  it("points at the public invoice page for a booking reference", () => {
    expect(invoicePageUrl("QTR-7-11-2026-9A657F69875B")).toBe(
      "/invoice/QTR-7-11-2026-9A657F69875B",
    );
  });

  it("trims surrounding spaces before building the link", () => {
    expect(invoicePageUrl("  POS-8-11-2026-ABC123  ")).toBe(
      "/invoice/POS-8-11-2026-ABC123",
    );
  });

  it("keeps a reference with characters that need escaping on one path segment", () => {
    expect(invoicePageUrl("A B/C")).toBe("/invoice/A%20B%2FC");
  });
});
