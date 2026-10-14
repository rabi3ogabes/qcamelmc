// Records one row per API call into public.api_calls (admin-only read) so the
// dashboard "حركة الـ API" page can show traffic by function and source.
// Logging never blocks or breaks the real response.

type Handler = (req: Request) => Response | Promise<Response>;

function callerOf(req: Request): string {
  const auth = req.headers.get("authorization") ?? "";
  const token = auth.replace(/^Bearer\s+/i, "");
  if (!token) return req.headers.get("x-staff-passcode") ? "staff_passcode" : "anonymous";
  try {
    const payload = JSON.parse(atob(token.split(".")[1].replace(/-/g, "+").replace(/_/g, "/")));
    if (payload.role === "service_role") return "server";
    if (payload.role === "authenticated") return "signed_in";
    return "anonymous";
  } catch {
    return "external";
  }
}

const clip = (v: string | null, n: number) => (v ? v.slice(0, n) : null);

function record(row: Record<string, unknown>) {
  const url = Deno.env.get("SUPABASE_URL");
  const key = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!url || !key) return;
  const p = fetch(`${url}/rest/v1/api_calls`, {
    method: "POST",
    headers: { apikey: key, Authorization: `Bearer ${key}`, "Content-Type": "application/json", Prefer: "return=minimal" },
    body: JSON.stringify(row),
  }).then((r) => r.body?.cancel()).catch(() => {});
  // deno-lint-ignore no-explicit-any
  const rt = (globalThis as any).EdgeRuntime;
  if (rt?.waitUntil) rt.waitUntil(p);
}

export function tracked(fn: string, handler: Handler): Handler {
  return async (req) => {
    if (req.method === "OPTIONS") return handler(req);
    const start = Date.now();
    let status = 500;
    try {
      const res = await handler(req);
      status = res.status;
      return res;
    } finally {
      const h = req.headers;
      record({
        fn,
        method: req.method,
        status,
        duration_ms: Date.now() - start,
        origin: clip(h.get("origin") ?? h.get("referer"), 200),
        ip: clip((h.get("x-forwarded-for") ?? "").split(",")[0].trim() || h.get("cf-connecting-ip"), 64),
        country: clip(h.get("cf-ipcountry"), 8),
        user_agent: clip(h.get("user-agent"), 300),
        caller: callerOf(req),
      });
    }
  };
}
