import { describe, expect, it } from "vitest";
import {
  MIN_PASSCODE_LENGTH,
  optionalStaff,
  passcodeMatches,
  passcodeProblem,
  requireAdmin,
  requireStaff,
  timingSafeEqual,
  usablePasscode,
} from "../../supabase/functions/_shared/auth.ts";
import { evaluateThrottle } from "../../supabase/functions/_shared/throttle.ts";
import { GLOBAL, PER_CALLER, staffAuthHandler, type StaffAuthDeps } from "../../supabase/functions/staff-auth/handler.ts";
import { serviceFunctionCaller } from "../../supabase/functions/_shared/internal-call.ts";
import { fn, makeRepo, post } from "./helpers.ts";

/** The password that used to be written in the source code and on the login page. */
const LEAKED = "@@@Qatar123";
const GOOD = "gate-team-7Qx!2";
const withToken = (token: string) => new Request("https://x.test", { headers: { authorization: `Bearer ${token}` } });
const anonymous = () => new Request("https://x.test");

describe("the team passcode", () => {
  it("switches passcode login OFF when no secret is configured (there is no default)", () => {
    expect(usablePasscode(undefined)).toBeNull();
    expect(usablePasscode(null)).toBeNull();
    expect(usablePasscode("")).toBeNull();
    expect(usablePasscode("   ")).toBeNull();
    expect(passcodeProblem(undefined)).toBe("not_configured");
  });

  it("can never be the value that was once shipped in the source code", () => {
    expect(usablePasscode(LEAKED)).toBeNull();
    expect(usablePasscode(`  ${LEAKED}  `)).toBeNull();
    expect(passcodeProblem(LEAKED)).toBe("revoked");
    expect(passcodeMatches(LEAKED, LEAKED)).toBe(false);
  });

  it("must be long enough to resist guessing", () => {
    expect(usablePasscode("a".repeat(MIN_PASSCODE_LENGTH - 1))).toBeNull();
    expect(passcodeProblem("short")).toBe("too_short");
    expect(usablePasscode("a".repeat(MIN_PASSCODE_LENGTH))).not.toBeNull();
  });

  it("accepts exactly the configured value and nothing else", () => {
    expect(passcodeMatches(GOOD, GOOD)).toBe(true);
    expect(passcodeMatches(`  ${GOOD} `, GOOD)).toBe(true); // surrounding spaces from a phone keyboard
    expect(passcodeMatches(GOOD.toUpperCase(), GOOD)).toBe(false);
    expect(passcodeMatches(GOOD.slice(0, -1), GOOD)).toBe(false);
    expect(passcodeMatches(GOOD + "x", GOOD)).toBe(false);
    for (const bad of [undefined, null, "", 0, 123, {}, [], true]) expect(passcodeMatches(bad, GOOD)).toBe(false);
  });

  it("compares in constant shape (different lengths, empty strings, unicode)", () => {
    expect(timingSafeEqual("abc", "abc")).toBe(true);
    expect(timingSafeEqual("abc", "abd")).toBe(false);
    expect(timingSafeEqual("abc", "abcd")).toBe(false);
    expect(timingSafeEqual("", "")).toBe(true);
    expect(timingSafeEqual("", "a")).toBe(false);
    expect(timingSafeEqual("كلمة", "كلمة")).toBe(true);
    expect(timingSafeEqual("كلمة", "كلمه")).toBe(false);
  });
});

describe("who counts as staff", () => {
  const repo = makeRepo();
  const options = { configuredPasscode: GOOD };

  it("recognises an administrator, a moderator and a passcode holder", async () => {
    expect(await optionalStaff(withToken("admin-jwt"), repo, options)).toEqual({ kind: "admin", userId: "admin-1" });
    expect(await optionalStaff(withToken("mod-jwt"), repo, options)).toEqual({ kind: "moderator", userId: "mod-1" });
    expect(await optionalStaff(anonymous(), repo, { ...options, passcode: GOOD })).toEqual({ kind: "passcode", userId: null });
  });

  it("refuses visitors, plain members, the public key and wrong passcodes", async () => {
    expect(await optionalStaff(anonymous(), repo, options)).toBeNull();
    expect(await optionalStaff(withToken("member-jwt"), repo, options)).toBeNull();
    expect(await optionalStaff(withToken("the-public-anon-key"), repo, options)).toBeNull();
    expect(await optionalStaff(anonymous(), repo, { ...options, passcode: "wrong-wrong-1" })).toBeNull();
  });

  it("does not accept a passcode when none is configured, or when it is the leaked one", async () => {
    expect(await optionalStaff(anonymous(), repo, { passcode: GOOD })).toBeNull();
    expect(await optionalStaff(anonymous(), repo, { passcode: LEAKED, configuredPasscode: LEAKED })).toBeNull();
  });

  it("a signed-in member with the right passcode is staff by passcode", async () => {
    expect((await optionalStaff(withToken("member-jwt"), repo, { ...options, passcode: GOOD }))?.kind).toBe("passcode");
  });

  it("an account lookup failure never turns into access", async () => {
    const broken = makeRepo({ isAdmin: async () => { throw new Error("db down"); } });
    expect(await optionalStaff(withToken("admin-jwt"), broken, options)).toBeNull();
  });

  it("requireStaff throws 401 for nobody; requireAdmin refuses moderators and passcodes", async () => {
    await expect(requireStaff(anonymous(), repo, options)).rejects.toMatchObject({ status: 401 });
    await expect(requireAdmin(withToken("mod-jwt"), repo)).rejects.toMatchObject({ status: 403 });
    await expect(requireAdmin(anonymous(), repo)).rejects.toMatchObject({ status: 401 });
    await expect(requireAdmin(withToken("admin-jwt"), repo)).resolves.toBe("admin-1");
  });
});

describe("attempt throttling", () => {
  const T = Date.parse("2026-10-09T12:00:00Z");
  const at = (minutesAgo: number, success = false) => ({
    attempted_at: new Date(T - minutesAgo * 60_000).toISOString(),
    success,
  });
  const rule = PER_CALLER;

  it("allows a caller with no history, and counts down", () => {
    expect(evaluateThrottle([], rule, T)).toEqual({ blocked: false, retryAfterSeconds: 0, attemptsLeft: 5 });
    expect(evaluateThrottle([at(1), at(2)], rule, T).attemptsLeft).toBe(3);
  });

  it("blocks after 5 wrong attempts in the window until 30 minutes after the last one", () => {
    const state = evaluateThrottle([at(1), at(2), at(3), at(4), at(5)], rule, T);
    expect(state.blocked).toBe(true);
    expect(state.attemptsLeft).toBe(0);
    expect(state.retryAfterSeconds).toBe(29 * 60);
  });

  it("only wrong guesses made within one window add up to a block", () => {
    const stale = evaluateThrottle([at(20), at(21), at(22), at(23), at(24)], rule, T);
    expect(stale.blocked).toBe(false); // spread over too long a time
    const recent = evaluateThrottle([at(14), at(14.5), at(14.7), at(14.8), at(14.9)], rule, T);
    expect(recent.blocked).toBe(true);
    expect(recent.retryAfterSeconds).toBeGreaterThan(14 * 60);
  });

  it("lifts the block once 30 minutes have passed since the latest failure", () => {
    expect(evaluateThrottle([at(31), at(32), at(33), at(34), at(35)], rule, T).blocked).toBe(false);
  });

  it("a correct passcode ends the streak", () => {
    const state = evaluateThrottle([at(1), at(2), at(3, true), at(4), at(5), at(6), at(7)], rule, T);
    expect(state.blocked).toBe(false);
    expect(state.attemptsLeft).toBe(3);
  });

  it("ignores the order the rows arrive in, and old failures", () => {
    expect(evaluateThrottle([at(5), at(1), at(3), at(2), at(4)], rule, T).blocked).toBe(true);
    expect(evaluateThrottle([at(100), at(101)], rule, T).attemptsLeft).toBe(5);
  });
});

describe("staff-auth function", () => {
  const NOW = new Date("2026-10-09T12:00:00Z");

  function setup(over: Partial<StaffAuthDeps> & { passcode?: string | null; history?: Record<string, { attempted_at: string; success: boolean }[]> } = {}) {
    const rows: { identifier: string; success: boolean; ip: string | null }[] = [];
    const history = over.history ?? {};
    const deps: StaffAuthDeps = {
      verify: (p) => passcodeMatches(p, over.passcode === undefined ? GOOD : over.passcode),
      problem: () => passcodeProblem(over.passcode === undefined ? GOOD : over.passcode),
      attemptsSince: async (id) => [...(history[id] ?? []), ...rows.filter((r) => r.identifier === id).map((r) => ({ attempted_at: NOW.toISOString(), success: r.success }))],
      record: async (row) => { rows.push({ identifier: row.identifier, success: row.success, ip: row.ip }); },
      now: () => NOW,
      ...over,
    };
    const call = (passcode: unknown, headers: Record<string, string> = { "cf-connecting-ip": "203.0.113.7" }) =>
      staffAuthHandler(deps)(post(fn("staff-auth"), { passcode }, headers)).then(async (res) => ({ status: res.status, body: await res.json() }));
    return { call, rows };
  }

  it("accepts the right passcode", async () => {
    const { call } = setup();
    expect(await call(GOOD)).toEqual({ status: 200, body: { ok: true } });
  });

  it("rejects a wrong passcode and says how many guesses are left", async () => {
    const { call } = setup();
    expect((await call("nope-nope-1")).body).toEqual({ ok: false, attempts_left: 4 });
  });

  it("the page's warm-up ping is not a guess", async () => {
    const { call, rows } = setup();
    expect((await call("__warmup__")).body).toEqual({ ok: false, warmup: true });
    expect(rows).toHaveLength(0);
  });

  it("says passcode login is off when the secret is missing, revoked or short — and never records a guess", async () => {
    for (const [secret, why] of [[null, "not_configured"], [LEAKED, "revoked"], ["short", "too_short"]] as const) {
      const { call, rows } = setup({ passcode: secret });
      expect((await call(secret ?? "anything-long")).body).toEqual({ ok: false, unavailable: why });
      expect(rows).toHaveLength(0);
    }
  });

  it("locks a caller out after 5 wrong guesses, even if the 6th would be right", async () => {
    const { call } = setup();
    for (let i = 0; i < 4; i++) expect((await call("wrong-pass-" + i)).body.blocked).toBeUndefined();
    const fifth = (await call("wrong-pass-4")).body;
    expect(fifth).toMatchObject({ ok: false, blocked: true, attempts_left: 0 });
    const sixth = (await call(GOOD)).body;
    expect(sixth).toMatchObject({ ok: false, blocked: true });
    expect(sixth.retry_after_seconds).toBeGreaterThan(0);
  });

  it("another caller is not locked out by someone else's mistakes", async () => {
    const { call } = setup();
    for (let i = 0; i < 5; i++) await call("wrong-pass-" + i, { "cf-connecting-ip": "198.51.100.1" });
    expect((await call(GOOD, { "cf-connecting-ip": "198.51.100.2" })).body).toEqual({ ok: true });
  });

  it("counts guesses per address and also in one shared counter, which only ever holds wrong guesses", async () => {
    const { call, rows } = setup();
    await call("wrong-pass-1");
    await call(GOOD);
    expect(rows.filter((r) => r.identifier === "passcode:203.0.113.7").map((r) => r.success)).toEqual([false, true]);
    expect(rows.filter((r) => r.identifier === "team-passcode").map((r) => r.success)).toEqual([false]);
  });

  it("a flood from many addresses trips the shared limit", async () => {
    const stamp = new Date(NOW.getTime() - 60_000).toISOString();
    const flood = Array.from({ length: GLOBAL.max }, () => ({ attempted_at: stamp, success: false }));
    const { call } = setup({ history: { "team-passcode": flood } });
    expect((await call(GOOD, { "cf-connecting-ip": "192.0.2.99" })).body).toMatchObject({ ok: false, blocked: true });
  });

  it("still answers when the attempt log is unavailable, without letting a wrong guess through", async () => {
    const { call } = setup({ record: async () => { throw new Error("db down"); } });
    expect((await call(GOOD)).body).toEqual({ ok: true });
    expect((await call("wrong-pass-1")).body.ok).toBe(false);
  });

  it("copes with junk bodies and wrong methods", async () => {
    const { call } = setup();
    expect((await call(undefined)).body.ok).toBe(false);
    const handler = staffAuthHandler({ verify: () => true, problem: () => null, attemptsSince: async () => [], record: async () => {} });
    expect((await handler(post(fn("staff-auth"), "not json{"))).status).toBe(200);
    expect((await handler(new Request(fn("staff-auth"), { method: "GET" }))).status).toBe(405);
    expect((await handler(new Request(fn("staff-auth"), { method: "OPTIONS" }))).status).toBe(204);
  });
});

describe("calling another edge function as the service role", () => {
  it("posts JSON with the service key and fails loudly on an error status", async () => {
    const seen: { url: string; auth: string | null; body: string }[] = [];
    const ok = serviceFunctionCaller("https://p.supabase.co/", "SERVICE-KEY", (async (url: RequestInfo | URL, init?: RequestInit) => {
      seen.push({ url: String(url), auth: new Headers(init?.headers).get("authorization"), body: String(init?.body) });
      return new Response("{}", { status: 200 });
    }) as typeof fetch);
    await ok("send-invoice-email", { order_id: "o1" });
    expect(seen).toEqual([{ url: "https://p.supabase.co/functions/v1/send-invoice-email", auth: "Bearer SERVICE-KEY", body: '{"order_id":"o1"}' }]);

    const bad = serviceFunctionCaller("https://p.supabase.co", "K", (async () => new Response("no", { status: 500 })) as typeof fetch);
    await expect(bad("x", {})).rejects.toThrow(/responded 500/);
  });
});
