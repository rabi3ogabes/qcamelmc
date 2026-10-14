import { describe, it, expect } from "vitest";
import { isLiveNow } from "./liveSchedule";

const eventDay = "2026-10-20T15:00:00Z"; // 18:00 Qatar, 20 Oct
const at = (qatarIso: string) => new Date(new Date(qatarIso + "Z").getTime() - 3 * 3600_000);

describe("live bookings schedule", () => {
  it("sleeps when there is no event, even in always mode", () => {
    expect(isLiveNow("always", [], at("2026-10-20T10:00:00"))).toBe(false);
  });
  it("always mode is live any time when an event exists", () => {
    expect(isLiveNow("always", [eventDay], at("2026-10-15T23:00:00"))).toBe(true);
  });
  it("event hours: live at 08:00 Qatar on the event day", () => {
    expect(isLiveNow("event_hours", [eventDay], at("2026-10-20T08:00:00"))).toBe(true);
  });
  it("event hours: asleep at 17:00 Qatar on the event day", () => {
    expect(isLiveNow("event_hours", [eventDay], at("2026-10-20T17:00:00"))).toBe(false);
  });
  it("event hours: asleep at 07:59 Qatar on the event day", () => {
    expect(isLiveNow("event_hours", [eventDay], at("2026-10-20T07:59:00"))).toBe(false);
  });
  it("event hours: asleep on a non-event day", () => {
    expect(isLiveNow("event_hours", [eventDay], at("2026-10-19T12:00:00"))).toBe(false);
  });
});
