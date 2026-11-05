import { describe, expect, it } from "vitest";
import { pickActualEventId } from "./actualEvent";

// The live bookings screen must ever show only the actual event's data.
const viewable = (d: string) => d >= "2026-11-05";
const events = [
  { id: "old", event_date: "2026-10-24T18:00:00Z" },
  { id: "next", event_date: "2026-11-07T09:00:00Z" },
  { id: "later", event_date: "2026-11-13T09:00:00Z" },
];

describe("pickActualEventId", () => {
  it("uses the admin's current event while it is active", () => {
    expect(pickActualEventId(events, "later", viewable)).toBe("later");
    // current event beats "first upcoming" even when it is not the first
    expect(pickActualEventId(events, "next", viewable)).toBe("next");
  });

  it("ignores a current event that is no longer active", () => {
    expect(pickActualEventId(events, "not-active", viewable)).toBe("next");
  });

  it("falls back to the first active event still viewable, skipping past ones", () => {
    expect(pickActualEventId(events, null, viewable)).toBe("next");
  });

  it("returns null when no active event qualifies — no old data is shown", () => {
    const pastOnly = [
      { id: "old", event_date: "2026-10-24T18:00:00Z" },
      { id: "older", event_date: "2026-10-12T18:00:00Z" },
    ];
    expect(pickActualEventId(pastOnly, null, viewable)).toBeNull();
    expect(pickActualEventId([], null, viewable)).toBeNull();
  });
});
