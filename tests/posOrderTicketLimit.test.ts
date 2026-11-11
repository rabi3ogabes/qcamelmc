import { describe, expect, it } from "vitest";
import {
  checkPosOrderTicketLimits,
  formatPosOrderLimitViolation,
  MAX_TICKETS_PER_PERSON,
} from "@/lib/ticketLimit";

const holder = (ticketType = "normal") => ({
  name: "محمد",
  idNumber: "29850123456",
  phone: "55512345",
  ticketType,
});

describe("POS current-order ticket allowance", () => {
  it("allows exactly five normal and VIP tickets for a returning customer", () => {
    expect(checkPosOrderTicketLimits(Array.from({ length: 5 }, () => holder()))).toEqual([]);
    expect(MAX_TICKETS_PER_PERSON).toBe(5);
  });

  it("rejects six normal and VIP tickets in the current order without consulting previous orders", () => {
    const violations = checkPosOrderTicketLimits([
      ...Array.from({ length: 3 }, () => holder()),
      ...Array.from({ length: 3 }, () => holder("vip")),
    ]);

    expect(violations).toEqual([{ name: "محمد", existing: 0, requested: 6, remaining: 5 }]);
    expect(formatPosOrderLimitViolation(violations[0])).toContain("في هذا الطلب");
  });

  it("does not count parking toward the five-ticket allowance", () => {
    expect(checkPosOrderTicketLimits([
      ...Array.from({ length: 5 }, () => holder()),
      ...Array.from({ length: 4 }, () => holder("parking")),
    ])).toEqual([]);
  });
});
