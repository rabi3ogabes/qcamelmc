import { describe, expect, it } from "vitest";
import { canManageOrders, isOrderFestivalDate, ordersReadMode } from "../../supabase/functions/staff-orders/policy";

describe("orders permissions", () => {
  it("only admins can delete orders", () => {
    expect(canManageOrders({ kind: "admin" })).toBe(true);
    expect(canManageOrders({ kind: "moderator" })).toBe(false);
    expect(canManageOrders({ kind: "passcode" })).toBe(false);
    expect(canManageOrders(null)).toBe(false);
  });
  it("staff cannot cancel confirmation", () => {
    expect(() => ordersReadMode("cancel_confirmation")).toThrow("read_only");
  });
  it("staff cannot change dates", () => {
    expect(() => ordersReadMode("change_date")).toThrow("read_only");
  });
  it("staff cannot delete through the reading endpoint", () => {
    expect(() => ordersReadMode("delete")).toThrow("read_only");
    expect(ordersReadMode("details")).toBe("details");
  });
  it("includes 7 through 14 November 2026 in Qatar, excludes old seasons and outside days", () => {
    expect(isOrderFestivalDate("2026-11-06T21:00:00Z")).toBe(true);
    expect(isOrderFestivalDate("2026-11-14T20:59:59Z")).toBe(true);
    expect(isOrderFestivalDate("2026-11-06T20:59:59Z")).toBe(false);
    expect(isOrderFestivalDate("2026-11-14T21:00:00Z")).toBe(false);
    expect(isOrderFestivalDate("2026-02-07T09:00:00Z")).toBe(false);
  });
});