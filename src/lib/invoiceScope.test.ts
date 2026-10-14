import { describe, expect, it } from "vitest";
import { availableInvoiceEventIds, isAvailableInvoiceEvent } from "./invoiceScope";

describe("invoice scope rule — only available events", () => {
  it("keeps an event of the live season", () => {
    expect(isAvailableInvoiceEvent({ id: "live", is_archived: false })).toBe(true);
  });

  it("hides an event of an archived season", () => {
    expect(isAvailableInvoiceEvent({ id: "old", is_archived: true })).toBe(false);
  });

  it("treats a missing archive flag as available", () => {
    expect(isAvailableInvoiceEvent({ id: "fresh" })).toBe(true);
    expect(isAvailableInvoiceEvent({ id: "null", is_archived: null })).toBe(true);
  });

  it("never returns an archived id, even when mixed with live ones", () => {
    const ids = availableInvoiceEventIds([
      { id: "old", is_archived: true },
      { id: "live", is_archived: false },
      { id: "fresh" },
    ]);
    expect(ids).toEqual(["live", "fresh"]);
    expect(ids).not.toContain("old");
  });

  it("returns no ids at all when every season is archived", () => {
    expect(availableInvoiceEventIds([{ id: "old", is_archived: true }])).toEqual([]);
  });

  it("drops events that no longer exist", () => {
    expect(availableInvoiceEventIds([null, undefined, { id: "live" }])).toEqual(["live"]);
  });
});
