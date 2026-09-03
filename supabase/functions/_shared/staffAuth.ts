/**
 * Shared staff authorization for admin-only edge functions.
 * A caller is authorized when either:
 *  - the Authorization bearer token belongs to a row in public.admin_users, or
 *  - the request carries the staff passcode (same gate used by the staff pages).
 */
export const STAFF_PASSCODE = Deno.env.get("STAFF_PASSCODE") || "@@@Qatar123";

export async function isStaffAuthorized(
  req: Request,
  admin: any,
  passcode?: unknown,
): Promise<boolean> {
  if (typeof passcode === "string" && passcode === STAFF_PASSCODE) return true;

  const authHeader = req.headers.get("Authorization") || "";
  const token = authHeader.replace("Bearer ", "").trim();
  if (!token) return false;

  try {
    const { data: userData } = await admin.auth.getUser(token);
    const userId = userData?.user?.id;
    if (!userId) return false;
    const { data: adminRow } = await admin
      .from("admin_users")
      .select("id")
      .eq("id", userId)
      .maybeSingle();
    if (adminRow) return true;

    // Moderators may also use the staff tools (POS, scanner, lookup).
    const { data: roleRow } = await admin
      .from("user_roles")
      .select("role")
      .eq("user_id", userId)
      .in("role", ["admin", "moderator"])
      .maybeSingle();
    return !!roleRow;

  } catch (_e) {
    return false;
  }
}

export function unauthorizedResponse(corsHeaders: Record<string, string>) {
  return new Response(
    JSON.stringify({ success: false, error: "unauthorized", message: "غير مصرح" }),
    { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } },
  );
}
