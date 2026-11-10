import { describe, expect, it } from "vitest";
import { posCustomerEmail } from "./posCustomerEmail";

describe("POS customer email", () => {
  it("omits a malformed legacy email instead of blocking the sale", () => {
    expect(posCustomerEmail("alhenazbabdulla.gmmail.com")).toBe("");
    expect(posCustomerEmail("khalied.alameri1@@gmail.com")).toBe("");
  });

  it("keeps a valid email and trims surrounding spaces", () => {
    expect(posCustomerEmail("  customer@example.qa  ")).toBe("customer@example.qa");
  });

  it("keeps the email optional", () => {
    expect(posCustomerEmail("")).toBe("");
    expect(posCustomerEmail(null)).toBe("");
  });
});
