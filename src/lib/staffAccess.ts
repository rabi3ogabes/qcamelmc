/**
 * Remembers that a staff member unlocked the private pages with the passcode.
 * The passcode itself is verified server-side (edge function `staff-auth`) and the
 * accepted value is kept in the browser only so admin-only edge functions can be called.
 *
 * Access expires automatically 10 days after it was granted.
 */

const PASS_KEY = "staff_passcode_ok";
const CODE_KEY = "staff_passcode_value";
const EXP_KEY = "staff_passcode_exp";
const ACCESS_TTL_MS = 10 * 24 * 60 * 60 * 1000; // 10 days
const COOKIE_MAX_AGE = 60 * 60 * 24 * 10; // 10 days

const readCookie = (): boolean => {
  try {
    return document.cookie
      .split(";")
      .some((c) => c.trim() === `${PASS_KEY}=1`);
  } catch {
    return false;
  }
};

const readExpiry = (): number | null => {
  try {
    const raw = localStorage.getItem(EXP_KEY) || sessionStorage.getItem(EXP_KEY);
    if (!raw) return null;
    const value = Number(raw);
    return Number.isFinite(value) ? value : null;
  } catch {
    return null;
  }
};

/** True when the stored access has passed its expiry time. */
const isExpired = (): boolean => {
  const exp = readExpiry();
  if (exp === null) {
    // Access granted before expirations existed: stamp a fresh 10-day expiry
    // instead of locking the team out when they open a page in a new tab.
    const fresh = Date.now() + ACCESS_TTL_MS;
    try {
      localStorage.setItem(EXP_KEY, String(fresh));
      sessionStorage.setItem(EXP_KEY, String(fresh));
    } catch {
      // ignore storage access errors
    }
    return false;
  }
  return Date.now() > exp;
};

export const hasStaffAccess = (): boolean => {
  let flagged = false;
  try {
    flagged =
      localStorage.getItem(PASS_KEY) === "1" || sessionStorage.getItem(PASS_KEY) === "1";
  } catch {
    // storage might be blocked; fall back to the cookie
  }
  if (!flagged) flagged = readCookie();
  if (!flagged) return false;

  if (isExpired()) {
    revokeStaffAccess();
    return false;
  }
  return true;
};

/** The passcode the staff member entered (used to authorize staff-only edge functions). */
export const getStaffPasscode = (): string | undefined => {
  if (isExpired()) {
    revokeStaffAccess();
    return undefined;
  }
  try {
    return localStorage.getItem(CODE_KEY) || sessionStorage.getItem(CODE_KEY) || undefined;
  } catch {
    return undefined;
  }
};

/** Remaining access time in milliseconds (0 when expired). */
export const staffAccessRemainingMs = (): number => {
  const exp = readExpiry();
  if (exp === null) return 0;
  return Math.max(0, exp - Date.now());
};

export const grantStaffAccess = (passcode?: string) => {
  const expiresAt = Date.now() + ACCESS_TTL_MS;
  try {
    localStorage.setItem(PASS_KEY, "1");
    sessionStorage.setItem(PASS_KEY, "1");
    localStorage.setItem(EXP_KEY, String(expiresAt));
    sessionStorage.setItem(EXP_KEY, String(expiresAt));
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
    localStorage.removeItem(EXP_KEY);
    sessionStorage.removeItem(PASS_KEY);
    sessionStorage.removeItem(CODE_KEY);
    sessionStorage.removeItem(EXP_KEY);
  } catch {
    // ignore
  }
  try {
    document.cookie = `${PASS_KEY}=; path=/; max-age=0; SameSite=Lax`;
  } catch {
    // ignore
  }
};
