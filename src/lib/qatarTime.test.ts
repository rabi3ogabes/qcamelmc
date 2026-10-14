import { describe, expect, it } from "vitest";
import { qatarDayEnd, qatarDayKey, qatarDayStart } from "./qatarTime";

describe("Qatar day boundaries (UTC+3)", () => {
  it("an event at 21:00 UTC belongs to the next Qatar day", () => {
    expect(qatarDayKey("2026-09-20T21:00:00Z")).toBe("2026-09-21");
  });
  it("day starts at 21:00 UTC the previous day", () => {
    expect(qatarDayStart("2026-09-21T10:00:00Z").toISOString()).toBe("2026-09-20T21:00:00.000Z");
  });
  it("day ends 24 hours later", () => {
    expect(qatarDayEnd("2026-09-21T10:00:00Z").toISOString()).toBe("2026-09-21T21:00:00.000Z");
  });
});
