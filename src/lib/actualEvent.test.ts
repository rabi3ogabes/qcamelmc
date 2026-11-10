import { describe, expect, it } from "vitest";
import { pickActualEventIds } from "./actualEvent";

const events = [
  { id: "old", event_date: "2026-10-24T18:00:00Z" },
  { id: "seven", event_date: "2026-11-07T06:00:00Z" },
  { id: "eight", event_date: "2026-11-08T06:00:00Z" },
  { id: "archived", event_date: "2026-11-09T06:00:00Z", is_archived: true },
  { id: "fourteen", event_date: "2026-11-14T06:00:00Z" },
  { id: "after", event_date: "2026-11-15T06:00:00Z" },
];

describe("pickActualEventIds", () => {
  it("includes completed 7 and 8 November days and every other active festival day", () => {
    expect(pickActualEventIds(events)).toEqual(["seven", "eight", "fourteen"]);
  });

  it("excludes older seasons, archived duplicates and dates after 14 November", () => {
    expect(pickActualEventIds(events)).not.toContain("old");
    expect(pickActualEventIds(events)).not.toContain("archived");
    expect(pickActualEventIds(events)).not.toContain("after");
  });

  it("returns empty when no active event belongs to the festival", () => {
    expect(pickActualEventIds([events[0], events[5]])).toEqual([]);
  });
});
