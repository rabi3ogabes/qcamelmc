/**
 * Staff authorization for edge functions that run with the service-role client.
 *
 * Who counts as staff (see auth.ts for the rules):
 *  - a signed-in administrator or moderator (Authorization: Bearer <user token>)
 *  - someone who knows the team passcode (the shared gate-staff login)
 *
 * The passcode comes ONLY from the STAFF_PASSCODE secret. There is no default:
 * with the secret unset (or too short, or the value that used to be written in
 * the source) passcode login is switched off and only real accounts work.
 */

import {
  optionalAdmin,
  optionalStaff,
  passcodeMatches,
  passcodeProblem,
  type AuthDeps,
  type StaffIdentity,
} from "./auth.ts";

const configuredPasscode = (): string | null => Deno.env.get("STAFF_PASSCODE") ?? null;

/** True when this passcode is the team passcode and passcode login is switched on. */
export function verifyStaffPasscode(supplied: unknown): boolean {
  return passcodeMatches(supplied, configuredPasscode());
}

/** Why passcode login is unavailable (null when it works). */
export function staffPasscodeProblem() {
  return passcodeProblem(configuredPasscode());
}

// deno-lint-ignore no-explicit-any
type Client = any;

/** Role lookups for a service-role client. */
export function authDepsFor(admin: Client): AuthDeps {
  const hasRole = async (userId: string, role: string) => {
    const { data } = await admin.from("user_roles").select("role").eq("user_id", userId).eq("role", role).maybeSingle();
    return Boolean(data);
  };
  return {
    async getUserId(jwt) {
      const { data, error } = await admin.auth.getUser(jwt);
      return error || !data?.user ? null : (data.user.id as string);
    },
    async isAdmin(userId) {
      const { data } = await admin.from("admin_users").select("id").eq("id", userId).maybeSingle();
      return Boolean(data) || (await hasRole(userId, "admin"));
    },
    isModerator: (userId) => hasRole(userId, "moderator"),
  };
}

/** Who is calling (admin / moderator / passcode), or null. */
export function staffIdentity(req: Request, admin: Client, passcode?: unknown): Promise<StaffIdentity | null> {
  return optionalStaff(req, authDepsFor(admin), { passcode, configuredPasscode: configuredPasscode() });
}

/** Admin, moderator or passcode holder. */
export async function isStaffAuthorized(req: Request, admin: Client, passcode?: unknown): Promise<boolean> {
  return (await staffIdentity(req, admin, passcode)) !== null;
}

/** Signed-in administrators only: a passcode is never enough. Returns the admin's user id. */
export function adminUserId(req: Request, admin: Client): Promise<string | null> {
  return optionalAdmin(req, authDepsFor(admin));
}

export async function isAdminAuthorized(req: Request, admin: Client): Promise<boolean> {
  return (await adminUserId(req, admin)) !== null;
}

/** The caller is the service role itself (another edge function), never a browser. */
export function isServiceRoleCall(req: Request): boolean {
  const key = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  const header = req.headers.get("authorization") ?? "";
  const token = /^bearer\s+(\S+)$/i.exec(header.trim())?.[1];
  if (!key || !token || token.length !== key.length) return false;
  let diff = 0;
  for (let i = 0; i < key.length; i++) diff |= key.charCodeAt(i) ^ token.charCodeAt(i);
  return diff === 0;
}

export function unauthorizedResponse(corsHeaders: Record<string, string>) {
  return new Response(
    JSON.stringify({ success: false, error: "unauthorized", message: "غير مصرح" }),
    { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } },
  );
}
