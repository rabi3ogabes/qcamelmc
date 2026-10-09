import { describe, expect, it } from "vitest";
import { toWhatsAppNumber } from "./phone";

describe("toWhatsAppNumber", () => {
  it.each([
    ["+974 5551 2345", undefined, "97455512345"],
    ["5551 2345", "+974", "97455512345"],
    ["55512345", undefined, "97455512345"],
    ["97455512345", "+974", "97455512345"],
    ["0097455512345", "+974", "97455512345"],
    ["+966 5551 0001", "+966", "96655510001"],
    ["+966 5551 0001", "+974", "96655510001"],
    ["0555 1234", "+966", "9665551234"],
    ["  +20 100 123 4567 ", "+20", "201001234567"],
  ])("%s (%s) -> %s", (phone, countryCode, expected) => {
    expect(toWhatsAppNumber(phone, countryCode)).toBe(expected);
  });

  it("never forces the Qatar prefix onto another country's number (the old behaviour)", () => {
    expect(toWhatsAppNumber("+966 5551 0001", "+966")).not.toMatch(/^974/);
  });

  it("returns null for nothing", () => {
    expect(toWhatsAppNumber(null)).toBeNull();
    expect(toWhatsAppNumber(undefined)).toBeNull();
    expect(toWhatsAppNumber("   ")).toBeNull();
  });
});
