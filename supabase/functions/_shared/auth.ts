// Authentication for edge functions. Pure and dependency-injected so it can be
// unit-tested without Deno or Supabase.
//
// Three kinds of caller can be "staff":
//   admin      a signed-in user in admin_users (or with the admin role)
//   moderator  a signed-in user with the moderator role (gate / POS accounts)
//   passcode   someone who knows the team passcode (the shared gate-staff login)
//
// The public anon key is NOT a user token, so it can never pass as any of them.
// The team passcode is read from the STAFF_PASSCODE secret only: there is no
// default, an unset secret switches passcode login OFF, and the value that used
// to be written in the source code is permanently refused.

import { HttpError } from "./http.ts";

export interface AuthDeps {
  /** Resolve a user JWT to a user id, or null if it is not a valid user session. */
  getUserId(jwt: string): Promise<string | null>;
  /** admin_users row or the admin role. */
  isAdmin(userId: string): Promise<boolean>;
  /** The moderator role (gate / POS staff accounts). */
  isModerator?(userId: string): Promise<boolean>;
}

export type StaffKind = "admin" | "moderator" | "passcode";
export interface StaffIdentity {
  kind: StaffKind;
  /** The signed-in user, or null for a passcode login. */
  userId: string | null;
}

// ---------------------------------------------------------------------------
// bearer token
// ---------------------------------------------------------------------------
export function bearer(req: Request): string | null {
  const header = req.headers.get("authorization") ?? "";
  const match = /^bearer\s+(\S+)$/i.exec(header.trim());
  return match ? match[1] : null;
}

async function userIdOf(req: Request, deps: AuthDeps): Promise<string | null> {
  const token = bearer(req);
  if (!token) return null;
  try {
    return await deps.getUserId(token);
  } catch {
    return null;
  }
}

// ---------------------------------------------------------------------------
// team passcode
// ---------------------------------------------------------------------------
/** Values that were once shipped in the source code: public forever, never valid again. */
const REVOKED_PASSCODES = new Set(["@@@Qatar123"]);
export const MIN_PASSCODE_LENGTH = 8;

/** The configured passcode if it may be used, otherwise null (passcode login is then off). */
export function usablePasscode(configured: string | null | undefined): string | null {
  const value = (configured ?? "").trim();
  if (value.length < MIN_PASSCODE_LENGTH || REVOKED_PASSCODES.has(value)) return null;
  return value;
}

/** Why passcode login is unavailable, for the staff screen ("not_configured" | "revoked" | "too_short"). */
export function passcodeProblem(configured: string | null | undefined): "not_configured" | "revoked" | "too_short" | null {
  const value = (configured ?? "").trim();
  if (!value) return "not_configured";
  if (REVOKED_PASSCODES.has(value)) return "revoked";
  if (value.length < MIN_PASSCODE_LENGTH) return "too_short";
  return null;
}

/** Comparison whose duration does not depend on how many leading characters match. */
export function timingSafeEqual(a: string, b: string): boolean {
  const left = new TextEncoder().encode(a);
  const right = new TextEncoder().encode(b);
  const length = Math.max(left.length, right.length);
  let diff = left.length ^ right.length;
  for (let i = 0; i < length; i++) diff |= (left[i] ?? 0) ^ (right[i] ?? 0);
  return diff === 0;
}

export function passcodeMatches(supplied: unknown, configured: string | null | undefined): boolean {
  const expected = usablePasscode(configured);
  if (expected === null || typeof supplied !== "string" || supplied === "") return false;
  return timingSafeEqual(supplied.trim(), expected);
}

// ---------------------------------------------------------------------------
// who is calling
// ---------------------------------------------------------------------------
export interface StaffOptions {
  /** Passcode sent by the caller (if any). */
  passcode?: unknown;
  /** The configured STAFF_PASSCODE secret. Omit to refuse passcode logins. */
  configuredPasscode?: string | null;
}

/** Signed-in administrators only. Returns the user id or throws 401 / 403. */
export async function requireAdmin(req: Request, deps: AuthDeps): Promise<string> {
  const userId = await userIdOf(req, deps);
  if (!userId) throw new HttpError(401, "unauthorized", "Sign in as an administrator");
  if (!(await deps.isAdmin(userId))) throw new HttpError(403, "forbidden", "Administrators only");
  return userId;
}

/** Admin id if the caller is an admin, otherwise null (never throws). */
export async function optionalAdmin(req: Request, deps: AuthDeps): Promise<string | null> {
  const userId = await userIdOf(req, deps);
  if (!userId) return null;
  try {
    return (await deps.isAdmin(userId)) ? userId : null;
  } catch {
    return null;
  }
}

/** Admin, moderator or team-passcode holder; null when the caller is none of them. */
export async function optionalStaff(
  req: Request,
  deps: AuthDeps,
  options: StaffOptions = {},
): Promise<StaffIdentity | null> {
  const userId = await userIdOf(req, deps);
  if (userId) {
    try {
      if (await deps.isAdmin(userId)) return { kind: "admin", userId };
      if (deps.isModerator && (await deps.isModerator(userId))) return { kind: "moderator", userId };
    } catch {
      // fall through to the passcode check
    }
  }
  if (passcodeMatches(options.passcode, options.configuredPasscode)) return { kind: "passcode", userId: null };
  return null;
}

/** Like optionalStaff but throws 401 when nobody is identified. */
export async function requireStaff(
  req: Request,
  deps: AuthDeps,
  options: StaffOptions = {},
): Promise<StaffIdentity> {
  const identity = await optionalStaff(req, deps, options);
  if (!identity) throw new HttpError(401, "unauthorized", "Staff only");
  return identity;
}
