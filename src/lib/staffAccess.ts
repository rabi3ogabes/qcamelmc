/**
 * Remembers that a staff member unlocked the private pages with the passcode.
 * Stored in localStorage AND a long-lived cookie so the passcode is asked only once
 * per browser (survives tab close, new tabs and restarts).
 */

const PASS_KEY = "staff_passcode_ok";
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

export const grantStaffAccess = () => {
  try {
    localStorage.setItem(PASS_KEY, "1");
    sessionStorage.setItem(PASS_KEY, "1");
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
    sessionStorage.removeItem(PASS_KEY);
  } catch {
    // ignore
  }
  try {
    document.cookie = `${PASS_KEY}=; path=/; max-age=0; SameSite=Lax`;
  } catch {
    // ignore
  }
};
