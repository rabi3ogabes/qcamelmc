import type { StaffIdentity } from "../_shared/auth.ts";

/** Shared team access can mark individuals, never perform bulk changes. */
export function canWriteAttendance(identity: StaffIdentity | null, mode: unknown): boolean {
  if (!identity) return false;
  if (mode === "set") return true;
  return (mode === "bulk_present" || mode === "clear_day") && identity.kind !== "passcode";
}