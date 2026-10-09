// POST /staff-auth { passcode }  ->  { ok, ... }
//
// Checks the team passcode on the server so it never ships in the browser, and
// counts wrong guesses itself (the browser-side login guard can be skipped by
// calling this function directly). Always answers 200 so the screen can show why:
//   { ok: true }
//   { ok: false, blocked: true, retry_after_seconds }   too many wrong guesses
//   { ok: false, unavailable: "not_configured" | ... }  passcode login is switched off
//   { ok: false, attempts_left }                        wrong passcode

import { corsHeaders, json, preflight } from "../_shared/http.ts";
import { evaluateThrottle, type Attempt, type ThrottleRule } from "../_shared/throttle.ts";

export interface StaffAuthDeps {
  verify(passcode: unknown): boolean;
  problem(): "not_configured" | "revoked" | "too_short" | null;
  /** Recorded attempts for an identifier since the given time. */
  attemptsSince(identifier: string, sinceIso: string): Promise<Attempt[]>;
  record(row: { identifier: string; success: boolean; ip: string | null; userAgent: string | null }): Promise<void>;
  now?: () => Date;
}

/** One caller: 5 wrong guesses in 15 minutes lock that address out for 30 minutes. */
export const PER_CALLER: ThrottleRule = { max: 5, windowMs: 15 * 60_000, blockMs: 30 * 60_000 };
/** Everyone together: guards against guessing from many addresses at once. */
export const GLOBAL: ThrottleRule = { max: 60, windowMs: 15 * 60_000, blockMs: 15 * 60_000 };

const GLOBAL_ID = "team-passcode";

export function callerIp(req: Request): string | null {
  const cf = req.headers.get("cf-connecting-ip");
  if (cf) return cf.trim().slice(0, 64);
  const forwarded = (req.headers.get("x-forwarded-for") ?? "").split(",")[0].trim();
  return forwarded ? forwarded.slice(0, 64) : null;
}

export function staffAuthHandler(deps: StaffAuthDeps) {
  return async (req: Request): Promise<Response> => {
    const early = preflight(req);
    if (early) return early;
    if (req.method !== "POST") return json({ ok: false, error: "method_not_allowed" }, 405);

    let passcode: unknown;
    try {
      passcode = (await req.json())?.passcode;
    } catch {
      return json({ ok: false });
    }

    // the login page pings this function to wake it up: that is not a guess
    if (passcode === "__warmup__") return json({ ok: false, warmup: true });

    const problem = deps.problem();
    if (problem) return json({ ok: false, unavailable: problem });

    const now = (deps.now ?? (() => new Date()))();
    const ip = callerIp(req);
    const callerId = `passcode:${ip ?? "unknown"}`;
    const since = new Date(now.getTime() - Math.max(PER_CALLER.blockMs, GLOBAL.blockMs)).toISOString();

    const [mine, everyone] = await Promise.all([deps.attemptsSince(callerId, since), deps.attemptsSince(GLOBAL_ID, since)]);
    const callerState = evaluateThrottle(mine, PER_CALLER, now.getTime());
    const globalState = evaluateThrottle(everyone, GLOBAL, now.getTime());
    if (callerState.blocked || globalState.blocked) {
      return json({
        ok: false,
        blocked: true,
        retry_after_seconds: Math.max(callerState.retryAfterSeconds, globalState.retryAfterSeconds),
      });
    }

    const ok = deps.verify(passcode);
    const userAgent = (req.headers.get("user-agent") ?? "").slice(0, 300) || null;
    try {
      await deps.record({ identifier: callerId, success: ok, ip, userAgent });
      // the shared counter only ever collects wrong guesses: one person's success must not reset it
      if (!ok) await deps.record({ identifier: GLOBAL_ID, success: false, ip, userAgent });
    } catch (error) {
      console.error("could not record the passcode attempt:", error instanceof Error ? error.message : error);
    }

    if (ok) return json({ ok: true });
    const left = Math.max(0, callerState.attemptsLeft - 1);
    const lockedNow = callerState.attemptsLeft - 1 <= 0;
    return json({
      ok: false,
      attempts_left: left,
      ...(lockedNow ? { blocked: true, retry_after_seconds: Math.ceil(PER_CALLER.blockMs / 1000) } : {}),
    });
  };
}

export { corsHeaders };
