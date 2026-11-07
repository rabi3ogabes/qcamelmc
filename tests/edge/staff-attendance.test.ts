import { describe, expect, it } from "vitest";
import { canWriteAttendance } from "../../supabase/functions/staff-attendance/policy.ts";

describe("team attendance permissions", () => {
  const team = { kind: "passcode" as const, userId: null };
  it("allows a server-verified team passcode to mark individual attendance", () => {
    expect(canWriteAttendance(team, "set")).toBe(true);
  });
  it("does not let team passcode access change everyone at once", () => {
    expect(canWriteAttendance(team, "bulk_present")).toBe(false);
  });
  it("does not let team passcode access clear a whole day", () => {
    expect(canWriteAttendance(team, "clear_day")).toBe(false);
  });
  it("denies unverified callers", () => {
    expect(canWriteAttendance(null, "set")).toBe(false);
  });
  it("preserves admin and moderator bulk attendance access", () => {
    for (const kind of ["admin", "moderator"] as const) {
      expect(canWriteAttendance({ kind, userId: "account" }, "bulk_present")).toBe(true);
      expect(canWriteAttendance({ kind, userId: "account" }, "clear_day")).toBe(true);
    }
  });
});