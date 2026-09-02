/**
 * Remembers that a staff member unlocked the private pages with the passcode.
 * The passcode itself is verified server-side (edge function `staff-auth`) and the
 * accepted value is kept in the browser only so admin-only edge functions can be called.
 */

const PASS_KEY = "staff_passcode_ok";
const CODE_KEY = "staff_passcode_value";
const COOKIE_MAX_AGE = 60 * 60 * 24 * 365; // 1 year

const readCookie = (): boolean => {
  try {
    return document.cookie
      .split(";")
      .some((c) => c.trim() === `${PASS_KEY}=1`);
  } catch {
    return false;
  }
};

export const hasStaffAccess = (): boolean => {
  try {
    if (localStorage.getItem(PASS_KEY) === "1") return true;
    if (sessionStorage.getItem(PASS_KEY) === "1") return true;
  } catch {
    // storage might be blocked; fall back to the cookie
  }
  return readCookie();
};

/** The passcode the staff member entered (used to authorize staff-only edge functions). */
export const getStaffPasscode = (): string | undefined => {
  try {
    return localStorage.getItem(CODE_KEY) || sessionStorage.getItem(CODE_KEY) || undefined;
  } catch {
    return undefined;
  }
};

export const grantStaffAccess = (passcode?: string) => {
  try {
    localStorage.setItem(PASS_KEY, "1");
    sessionStorage.setItem(PASS_KEY, "1");
    if (passcode) {
      localStorage.setItem(CODE_KEY, passcode);
      sessionStorage.setItem(CODE_KEY, passcode);
    }
  } catch {
    // ignore storage access errors
  }
  try {
    document.cookie = `${PASS_KEY}=1; path=/; max-age=${COOKIE_MAX_AGE}; SameSite=Lax`;
  } catch {
    // ignore cookie errors
  }
};

export const revokeStaffAccess = () => {
  try {
    localStorage.removeItem(PASS_KEY);
    localStorage.removeItem(CODE_KEY);
    sessionStorage.removeItem(PASS_KEY);
    sessionStorage.removeItem(CODE_KEY);
  } catch {
    // ignore
  }
  try {
    document.cookie = `${PASS_KEY}=; path=/; max-age=0; SameSite=Lax`;
  } catch {
    // ignore
  }
};
