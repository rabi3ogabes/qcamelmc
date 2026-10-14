import { supabase } from "@/integrations/supabase/client";

/** The live bookings screen password, remembered on this device after one correct entry. */
const KEY = "live_bookings_password";

export const getSavedLivePassword = (): string | null => {
  try { return localStorage.getItem(KEY); } catch { return null; }
};
export const saveLivePassword = (value: string) => {
  try { localStorage.setItem(KEY, value); } catch { /* ignore */ }
};
export const clearLivePassword = () => {
  try { localStorage.removeItem(KEY); } catch { /* ignore */ }
};

export class LiveFeedError extends Error {
  constructor(public code: string, public retryAfter?: number, public attemptsLeft?: number) { super(code); }
}

// deno-lint-ignore no-explicit-any
export async function fetchLiveFeed(password: string, action: string, extra: Record<string, unknown> = {}): Promise<any> {
  const { data, error } = await supabase.functions.invoke("live-bookings-feed", {
    body: { password, action, ...extra },
  });
  if (error) {
    let body: any = null;
    try { body = await (error as any).context?.json?.(); } catch { /* ignore */ }
    const code = body?.error ?? "network";
    if (code === "wrong_password") clearLivePassword();
    throw new LiveFeedError(code, body?.retry_after, body?.attempts_left);
  }
  return data;
}
