import { describe, expect, it } from "vitest";
import { pickActualEventIds } from "./actualEvent";

const viewable = (d: string) => d >= "2026-11-05";
const events = [
  { id: "old", event_date: "2026-10-24T18:00:00Z" },
  { id: "next", event_date: "2026-11-07T09:00:00Z" },
  { id: "later", event_date: "2026-11-14T09:00:00Z" },
];

describe("pickActualEventIds", () => {
  it("uses only the admin's current event while it is active", () => {
    expect(pickActualEventIds(events, "later", viewable)).toEqual(["later"]);
  });
  it("otherwise includes every upcoming festival day (7–14 Nov), skipping past ones", () => {
    expect(pickActualEventIds(events, null, viewable)).toEqual(["next", "later"]);
    expect(pickActualEventIds(events, "not-active", viewable)).toEqual(["next", "later"]);
  });
  it("returns empty when no active event qualifies — no old data is shown", () => {
    expect(pickActualEventIds([events[0]], null, viewable)).toEqual([]);
  });
});
