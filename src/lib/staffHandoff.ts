import { supabase } from "@/integrations/supabase/client";
import { getStaffPasscode, grantStaffAccess } from "@/lib/staffAccess";

/**
 * Hands staff access to a newly opened tab, even when that tab runs on a
 * different address than the one where the password was entered (browser
 * storage is not shared between addresses, so a fresh tab would otherwise
 * ask for the password again).
 *
 * The passcode itself is never placed in the link. The sending page asks the
 * `staff-handoff` function for a one-time, short-lived opaque token and puts
 * only that token in the URL hash (never sent to any server as part of a
 * request). The receiving page exchanges the token once for the passcode,
 * stores normal 10-day access locally, then removes the token from the URL.
 */

const HASH_KEY = "#sk=";

/** Append a one-time handoff token to a staff link before opening it. */
export const buildStaffUrl = async (to: string): Promise<string> => {
  const code = getStaffPasscode();
  if (!code) return to;
  try {
    const { data, error } = await supabase.functions.invoke("staff-handoff", {
      body: { action: "create", passcode: code },
    });
    if (error || !data?.token) return to;
    return `${to}${HASH_KEY}${encodeURIComponent(data.token)}`;
  } catch {
    return to;
  }
};

/**
 * On a guarded page: if the URL carries a handoff token, exchange it once
 * server-side for the passcode and grant local access. Returns true when
 * access was granted. The token is always stripped from the URL, whether it
 * was valid or not, and each token works only once.
 */
export const tryConsumeStaffHandoff = async (): Promise<boolean> => {
  try {
    const hash = window.location.hash || "";
    if (!hash.startsWith(HASH_KEY)) return false;
    const token = decodeURIComponent(hash.slice(HASH_KEY.length));
    window.history.replaceState(
      null,
      "",
      window.location.pathname + window.location.search,
    );
    if (!token) return false;
    const { data, error } = await supabase.functions.invoke("staff-handoff", {
      body: { action: "consume", token },
    });
    if (error || !data?.passcode) return false;
    grantStaffAccess(data.passcode);
    return true;
  } catch {
    return false;
  }
};
