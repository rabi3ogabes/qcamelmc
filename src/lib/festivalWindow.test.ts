import { describe, expect, it } from "vitest";
import { festivalDateWindow, isFestivalDay } from "./festivalWindow";

// Real shape of the season: archived January/February days, an archived
// October test day, and the live week 7 → 14 November 2026 (Qatar time).
const season = [
  { event_date: "2026-01-12T09:00:00Z", is_archived: true },
  { event_date: "2026-02-07T09:00:00Z", is_archived: true },
  { event_date: "2026-10-20T07:29:00Z", is_archived: true },
  { event_date: "2026-11-07T06:00:00Z", is_archived: false },
  { event_date: "2026-11-08T06:00:00Z", is_archived: false },
  { event_date: "2026-11-13T06:00:00Z", is_archived: false },
  // 14 November is switched off but not archived — it is still a festival day.
  { event_date: "2026-11-14T06:00:00Z", is_archived: false },
];

describe("festivalDateWindow", () => {
  it("spans the live week 7 → 14 November 2026", () => {
    expect(festivalDateWindow(season)).toEqual({
      from: "2026-11-07",
      to: "2026-11-14",
      toExclusive: "2026-11-15",
    });
  });

  it("ignores archived seasons completely", () => {
    const window = festivalDateWindow([
      { event_date: "2026-01-12T09:00:00Z", is_archived: true },
      { event_date: "2026-11-07T06:00:00Z", is_archived: false },
    ]);
    expect(window.from).toBe("2026-11-07");
    expect(window.to).toBe("2026-11-07");
    expect(window.toExclusive).toBe("2026-11-08");
  });

  it("treats a missing archive flag as part of the festival", () => {
    expect(festivalDateWindow([{ event_date: "2026-11-09T06:00:00Z" }]).from).toBe("2026-11-09");
  });

  it("returns no window when nothing is left of the season", () => {
    expect(festivalDateWindow([{ event_date: "2026-02-07T09:00:00Z", is_archived: true }])).toEqual({
      from: null,
      to: null,
      toExclusive: null,
    });
    expect(festivalDateWindow([])).toEqual({ from: null, to: null, toExclusive: null });
    expect(festivalDateWindow(null)).toEqual({ from: null, to: null, toExclusive: null });
  });

  it("rolls the exclusive end over into the next month", () => {
    const window = festivalDateWindow([{ event_date: "2026-11-30T06:00:00Z", is_archived: false }]);
    expect(window.toExclusive).toBe("2026-12-01");
  });
});

describe("isFestivalDay", () => {
  const window = festivalDateWindow(season);

  it("accepts the first and the last day of the week", () => {
    expect(isFestivalDay("2026-11-07T06:00:00Z", window)).toBe(true);
    expect(isFestivalDay("2026-11-14T06:00:00Z", window)).toBe(true);
  });

  it("rejects archived-season days and anything after the week", () => {
    expect(isFestivalDay("2026-01-12T09:00:00Z", window)).toBe(false);
    expect(isFestivalDay("2026-10-20T07:29:00Z", window)).toBe(false);
    expect(isFestivalDay("2026-11-15T06:00:00Z", window)).toBe(false);
  });

  it("rejects everything when there is no festival", () => {
    const empty = festivalDateWindow([]);
    expect(isFestivalDay("2026-11-07T06:00:00Z", empty)).toBe(false);
    expect(isFestivalDay(null, window)).toBe(false);
  });
});
