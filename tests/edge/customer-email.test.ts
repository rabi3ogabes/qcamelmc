import { describe, expect, it } from "vitest";
import { normalizeCustomerEmail } from "../../supabase/functions/_shared/customer-email";

describe("customer invoice email", () => {
  it("treats a missing email as unavailable rather than a delivery failure", () => {
    expect(normalizeCustomerEmail("")).toBeNull();
    expect(normalizeCustomerEmail("   ")).toBeNull();
    expect(normalizeCustomerEmail(null)).toBeNull();
    expect(normalizeCustomerEmail(undefined)).toBeNull();
  });

  it("rejects malformed addresses and overlong input", () => {
    expect(normalizeCustomerEmail("not-an-email")).toBeNull();
    expect(normalizeCustomerEmail("customer@example")).toBeNull();
    expect(normalizeCustomerEmail(`${"a".repeat(250)}@x.qa`)).toBeNull();
  });

  it("normalizes a valid customer address before sending", () => {
    expect(normalizeCustomerEmail("  customer@example.qa  ")).toBe("customer@example.qa");
  });
});
