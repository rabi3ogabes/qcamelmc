// Attempt throttling for secret-guessing (the team passcode). Pure: the caller
// supplies the recorded attempts, this decides whether the next one is allowed.
//
// A caller who gets `max` attempts wrong within `windowMs` is blocked until
// `blockMs` after their latest wrong attempt. A correct attempt ends the streak.

export interface Attempt {
  attempted_at: string;
  success: boolean;
}

export interface ThrottleRule {
  max: number;
  windowMs: number;
  blockMs: number;
}

export interface ThrottleState {
  blocked: boolean;
  /** Seconds until the block lifts (0 when not blocked). */
  retryAfterSeconds: number;
  /** Wrong attempts still allowed before a block starts. */
  attemptsLeft: number;
}

/** `attempts` may be in any order; only the streak of failures since the last success counts. */
export function evaluateThrottle(attempts: Attempt[], rule: ThrottleRule, nowMs: number): ThrottleState {
  const newestFirst = [...attempts].sort((a, b) => Date.parse(b.attempted_at) - Date.parse(a.attempted_at));
  const streak: number[] = [];
  for (const attempt of newestFirst) {
    if (attempt.success) break;
    streak.push(Date.parse(attempt.attempted_at));
  }

  const inWindow = streak.filter((at) => nowMs - at <= rule.windowMs);
  const attemptsLeft = Math.max(0, rule.max - inWindow.length);

  if (streak.length >= rule.max) {
    // the `max`-th newest failure must itself fall inside the window
    const decisive = streak[rule.max - 1];
    const newest = streak[0];
    if (nowMs - decisive <= rule.windowMs && newest + rule.blockMs > nowMs) {
      return { blocked: true, retryAfterSeconds: Math.ceil((newest + rule.blockMs - nowMs) / 1000), attemptsLeft: 0 };
    }
  }
  return { blocked: false, retryAfterSeconds: 0, attemptsLeft };
}
