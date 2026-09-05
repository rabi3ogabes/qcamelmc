import { supabase } from "@/integrations/supabase/client";
import { getStaffPasscode, grantStaffAccess } from "@/lib/staffAccess";

/**
 * Hands staff access to a newly opened tab, even when that tab runs on a
 * different address than the one where the password was entered (browser
 * storage is not shared between addresses, so a fresh tab would otherwise
 * ask for the password again).
 *
 * The sending page appends the passcode in the URL hash (never sent to any
 * server); the receiving page verifies it once against the `staff-auth`
 * function, stores normal 10-day access locally, then removes it from the URL.
 */

const HASH_KEY = "#sk=";

/** Append the one-time handoff token to a staff link before opening it. */
export const buildStaffUrl = (to: string): string => {
  const code = getStaffPasscode();
  return code ? `${to}${HASH_KEY}${encodeURIComponent(code)}` : to;
};

/**
 * On a guarded page: if the URL carries a handoff token, verify it server-side
 * and grant local access. Returns true when access was granted. The token is
 * always stripped from the URL, whether it was valid or not.
 */
export const tryConsumeStaffHandoff = async (): Promise<boolean> => {
  try {
    const hash = window.location.hash || "";
    if (!hash.startsWith(HASH_KEY)) return false;
    const code = decodeURIComponent(hash.slice(HASH_KEY.length));
    window.history.replaceState(
      null,
      "",
      window.location.pathname + window.location.search,
    );
    if (!code) return false;
    const { data } = await supabase.functions.invoke("staff-auth", {
      body: { passcode: code },
    });
    if (data?.ok) {
      grantStaffAccess(code);
      return true;
    }
    return false;
  } catch {
    return false;
  }
};
