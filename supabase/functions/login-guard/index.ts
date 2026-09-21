import { createClient } from "https://esm.sh/@supabase/supabase-js@2.58.0";
import { sendTemplateEmail } from "../_shared/transactional-email-templates/send-email.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });

const MAX_ATTEMPTS = 5;
const WINDOW_MINUTES = 15;
const BLOCK_MINUTES = 30;

const admin = createClient(
  Deno.env.get("SUPABASE_URL")!,
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  { auth: { persistSession: false } },
);

const normalize = (v: unknown) =>
  typeof v === "string" ? v.trim().toLowerCase().slice(0, 160) : "";

const kindLabel = (kind: string) =>
  kind === "passcode" ? "كلمة مرور الفريق" : "لوحة التحكم";

const clientIp = (req: Request) =>
  (req.headers.get("x-forwarded-for") || "").split(",")[0].trim() || null;

/** Recent failed attempts for this identifier, newest first. */
async function recentFailures(identifier: string) {
  const since = new Date(Date.now() - WINDOW_MINUTES * 60_000).toISOString();
  const { data } = await admin
    .from("login_attempts")
    .select("attempted_at, success")
    .eq("identifier", identifier)
    .gte("attempted_at", since)
    .order("attempted_at", { ascending: false })
    .limit(50);
  const rows = data ?? [];
  const failures: typeof rows = [];
  for (const row of rows) {
    if (row.success) break; // a success resets the streak
    failures.push(row);
  }
  return failures;
}

function blockedUntil(failures: Array<{ attempted_at: string }>): number | null {
  if (failures.length < MAX_ATTEMPTS) return null;
  const last = new Date(failures[0].attempted_at).getTime();
  const until = last + BLOCK_MINUTES * 60_000;
  return until > Date.now() ? until : null;
}

async function notifyAdmin(payload: {
  identifier: string;
  kind: string;
  attempts: number;
  ip: string | null;
  userAgent: string | null;
}) {
  try {
    const { data: settings } = await admin
      .from("settings")
      .select("admin_email")
      .maybeSingle();
    const adminEmail = (settings?.admin_email || "").trim();
    if (!adminEmail || !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(adminEmail)) return;

    // One alert per identifier per block window.
    const bucket = Math.floor(Date.now() / (BLOCK_MINUTES * 60_000));
    await sendTemplateEmail("login-alert", adminEmail, {
      idempotencyKey: `login-block-${payload.identifier}-${bucket}`,
      templateData: {
        identifier: payload.identifier,
        kind_label: kindLabel(payload.kind),
        attempts: payload.attempts,
        blocked_minutes: BLOCK_MINUTES,
        ip_address: payload.ip,
        user_agent: payload.userAgent,
        occurred_at: new Date().toISOString(),
      },
    });
  } catch (e) {
    console.error("login alert email failed:", e);
  }
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const body = await req.json().catch(() => ({}));
    const mode = body?.mode === "record" ? "record" : "check";
    const kind = body?.kind === "passcode" ? "passcode" : "account";
    const identifier = normalize(body?.identifier) || (kind === "passcode" ? "team-passcode" : "");
    if (!identifier) return json({ allowed: true });

    const ip = clientIp(req);
    const userAgent = (req.headers.get("user-agent") || "").slice(0, 300) || null;

    if (mode === "check") {
      const failures = await recentFailures(identifier);
      const until = blockedUntil(failures);
      if (until) {
        return json({
          allowed: false,
          blocked: true,
          retry_after_seconds: Math.ceil((until - Date.now()) / 1000),
          attempts: failures.length,
        });
      }
      return json({
        allowed: true,
        attempts_left: Math.max(0, MAX_ATTEMPTS - failures.length),
      });
    }

    // record
    const success = body?.success === true;
    await admin.from("login_attempts").insert({
      identifier,
      kind,
      ip_address: ip,
      user_agent: userAgent,
      success,
    });

    if (success) return json({ ok: true, blocked: false });

    const failures = await recentFailures(identifier);
    const until = blockedUntil(failures);
    if (until) {
      await notifyAdmin({ identifier, kind, attempts: failures.length, ip, userAgent });
      try {
        await admin.from("activity_logs").insert({
          activity_type: "login_blocked",
          user_type: kind === "passcode" ? "staff" : "admin",
          user_identifier: identifier,
          action_data: { attempts: failures.length, block_minutes: BLOCK_MINUTES },
          ip_address: ip,
          user_agent: userAgent,
        });
      } catch (_e) { /* logging is best-effort */ }
    }

    // Opportunistic cleanup (cheap, indexed).
    admin.rpc("cleanup_login_attempts").then(() => {}, () => {});

    return json({
      ok: true,
      blocked: !!until,
      retry_after_seconds: until ? Math.ceil((until - Date.now()) / 1000) : 0,
      attempts_left: Math.max(0, MAX_ATTEMPTS - failures.length),
    });
  } catch (e) {
    console.error("login-guard failed:", e);
    // Never lock legitimate users out because of an internal error.
    return json({ allowed: true, error: (e as Error).message });
  }
});
