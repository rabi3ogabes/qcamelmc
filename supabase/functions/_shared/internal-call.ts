// Calls one edge function from another as the service role (never from a browser).
// Used for best-effort follow-ups such as the invoice e-mail after a payment.

export function serviceFunctionCaller(
  supabaseUrl: string,
  serviceKey: string,
  fetchImpl: typeof fetch = fetch,
  timeoutMs = 15_000,
) {
  const base = supabaseUrl.replace(/\/+$/, "");
  return async (name: string, body: unknown): Promise<void> => {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const res = await fetchImpl(`${base}/functions/v1/${name}`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${serviceKey}` },
        body: JSON.stringify(body),
        signal: controller.signal,
      });
      if (!res.ok) throw new Error(`${name} responded ${res.status}`);
    } finally {
      clearTimeout(timer);
    }
  };
}
