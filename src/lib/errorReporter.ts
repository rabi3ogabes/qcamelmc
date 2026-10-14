import { supabase } from "@/integrations/supabase/client";
import { isNoiseError } from "./errorCauses";

const MAX_PER_PAGE_LOAD = 15;
let sent = 0;
const seen = new Set<string>();
let installed = false;

/** Sends one failure to the admin error log. Never throws, never loops. */
export function reportError(kind: string, message: string, stack?: string) {
  try {
    if (isNoiseError(message) || sent >= MAX_PER_PAGE_LOAD) return;
    const key = `${kind}|${message}`;
    if (seen.has(key)) return;
    seen.add(key);
    sent += 1;
    void supabase
      .rpc("log_app_error", {
        p_kind: kind,
        p_message: message.slice(0, 1000),
        p_stack: stack?.split("\n").slice(0, 12).join("\n") ?? null,
        p_page: window.location.pathname,
      })
      .then(() => undefined, () => undefined);
  } catch {
    // reporting must never break the site
  }
}

export function installErrorReporter() {
  if (installed || typeof window === "undefined") return;
  installed = true;
  window.addEventListener("error", (e) => {
    // Ignore failures from scripts on other sites (extensions, ads).
    if (e.filename && !e.filename.startsWith(window.location.origin)) return;
    reportError("خطأ في الصفحة", e.message, e.error?.stack);
  });
  window.addEventListener("unhandledrejection", (e) => {
    const r: unknown = e.reason;
    const msg = r instanceof Error ? r.message : typeof r === "string" ? r : (r as { message?: string })?.message ?? "";
    reportError("عملية لم تكتمل", msg, r instanceof Error ? r.stack : undefined);
  });
}
