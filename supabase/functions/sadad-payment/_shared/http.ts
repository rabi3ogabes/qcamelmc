// AUTO-GENERATED COPY of supabase/functions/_shared/http.ts — do not edit here.
// Edit the original, then run "npm run sync:functions". Each function ships self-contained.

// Small HTTP helpers shared by every edge function.
//
// CORS is intentionally open ("*"): the API authenticates with bearer tokens
// (never cookies), so there is no ambient credential for a hostile origin to
// ride on. Access control is enforced by the functions themselves.

export const corsHeaders: Record<string, string> = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, GET, OPTIONS",
  "Access-Control-Max-Age": "86400",
};

export class HttpError extends Error {
  constructor(
    public status: number,
    public code: string,
    message?: string,
    public extra?: Record<string, unknown>,
  ) {
    super(message ?? code);
    this.name = "HttpError";
  }
}

/** Duck-typed so it still works if the module is loaded twice (e.g. vendored copies). */
export function isHttpError(error: unknown): error is HttpError {
  return (
    error instanceof HttpError ||
    (typeof error === "object" &&
      error !== null &&
      (error as { name?: unknown }).name === "HttpError" &&
      typeof (error as { status?: unknown }).status === "number" &&
      typeof (error as { code?: unknown }).code === "string")
  );
}

export function json(body: unknown, status = 200, headers: Record<string, string> = {}): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json", ...headers },
  });
}

/** Answer CORS preflight requests; returns null for every other method. */
export function preflight(req: Request): Response | null {
  return req.method === "OPTIONS" ? new Response(null, { status: 204, headers: corsHeaders }) : null;
}

export async function readJson(req: Request, maxChars = 64_000): Promise<unknown> {
  const text = await req.text();
  if (text.length > maxChars) throw new HttpError(413, "payload_too_large", "Request body is too large");
  try {
    return JSON.parse(text);
  } catch {
    throw new HttpError(400, "invalid_json", "Request body must be valid JSON");
  }
}

/** Expected errors keep their status/code; anything else is a generic 500 with no internals. */
export function toErrorResponse(error: unknown): Response {
  if (isHttpError(error)) {
    return json({ success: false, code: error.code, error: error.message, ...(error.extra ?? {}) }, error.status);
  }
  console.error("unhandled error:", error instanceof Error ? error.stack ?? error.message : error);
  return json({ success: false, code: "internal_error", error: "Something went wrong" }, 500);
}
