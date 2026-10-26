import "../_shared/track-install.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.58.0";
import { verifyStaffPasscode } from "../_shared/staffAuth.ts";

/**
 * One-time staff handoff tokens.
 *
 * create:  a caller who already knows the team passcode mints an opaque
 *          single-use token (valid 5 minutes) so a link can carry that token
 *          instead of the passcode itself.
 * consume: the new tab exchanges the token once for the passcode. The row is
 *          deleted atomically, so a token can never be replayed.
 */
const admin = createClient(
  Deno.env.get("SUPABASE_URL")!,
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  { auth: { persistSession: false, autoRefreshToken: false } },
);

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const json = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });

const TOKEN_TTL_MS = 5 * 60 * 1000;

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  if (req.method !== "POST") return json(405, { error: "method_not_allowed" });

  let body: { action?: string; passcode?: unknown; token?: unknown } = {};
  try {
    body = await req.json();
  } catch {
    return json(400, { error: "bad_request" });
  }

  if (body.action === "create") {
    if (!verifyStaffPasscode(body.passcode)) return json(401, { error: "unauthorized" });
    // Drop expired tokens opportunistically so the table stays small.
    await admin.from("staff_handoff_tokens").delete().lt("expires_at", new Date().toISOString());
    const token = crypto.randomUUID().replaceAll("-", "") + crypto.randomUUID().replaceAll("-", "");
    const { error } = await admin.from("staff_handoff_tokens").insert({
      token,
      passcode: String(body.passcode),
      expires_at: new Date(Date.now() + TOKEN_TTL_MS).toISOString(),
    });
    if (error) return json(500, { error: "create_failed" });
    return json(200, { token });
  }

  if (body.action === "consume") {
    if (typeof body.token !== "string" || body.token.length < 16) {
      return json(400, { error: "bad_request" });
    }
    // Deleting returns the row only if it existed and was still fresh: atomic single use.
    const { data } = await admin
      .from("staff_handoff_tokens")
      .delete()
      .eq("token", body.token)
      .gt("expires_at", new Date().toISOString())
      .select("passcode")
      .maybeSingle();
    if (!data) return json(401, { error: "invalid_or_expired" });
    return json(200, { passcode: data.passcode });
  }

  return json(400, { error: "bad_request" });
});
