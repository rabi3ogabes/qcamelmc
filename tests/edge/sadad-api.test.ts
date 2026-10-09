import { describe, expect, it } from "vitest";
import {
  detectEnvironment,
  lookupTransaction,
  type SadadApiResult,
} from "../../supabase/functions/_shared/sadad-api.ts";

const creds = { sadadId: "1664851", secretKey: "S3CR3T", domain: "example.qa" };
const LIVE = "https://api-s.sadad.qa";
const SANDBOX = "https://api-sandbox.sadad.qa";

type Call = { url: string; method: string; headers: Record<string, string>; body?: string };

/** Fake Sadad: which environments accept the credentials and what they return. */
function fakeSadad(opts: {
  loginOk?: { live?: boolean; sandbox?: boolean };
  list?: unknown;
  single?: unknown;
  listStatus?: number;
  networkDown?: boolean;
}) {
  const calls: Call[] = [];
  const fetchImpl = (async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input);
    const headers = Object.fromEntries(Object.entries((init?.headers ?? {}) as Record<string, string>));
    calls.push({ url, method: init?.method ?? "GET", headers, body: init?.body as string | undefined });
    if (opts.networkDown) throw new TypeError("network down");
    const json = (data: unknown, status = 200) =>
      new Response(JSON.stringify(data), { status, headers: { "content-type": "application/json" } });

    if (url.endsWith("/api/userbusinesses/login")) {
      const env = url.startsWith(LIVE) ? "live" : "sandbox";
      return opts.loginOk?.[env as "live" | "sandbox"]
        ? json({ accessToken: `token-${env}` })
        : json({ error: "Invalid credentials" }, 401);
    }
    if (url.includes("/api/transactions/listTransactions")) {
      return json(opts.list ?? [], opts.listStatus ?? 200);
    }
    if (url.includes("/api/transactions/getTransaction")) {
      return opts.single ? json(opts.single) : json({ error: "Transaction not found" }, 404);
    }
    return json({}, 404);
  }) as typeof fetch;
  return { fetchImpl, calls };
}

const txn = (over: Record<string, unknown> = {}) => ({
  invoicenumber: "SD2883696582255",
  amount: 150,
  website_ref_no: "QTR-ABC123DEF456",
  transactionstatusId: 3,
  transactionstatus: { id: 3, name: "SUCCESS" },
  ...over,
});

const run = (
  f: ReturnType<typeof fakeSadad>,
  extra: Partial<Parameters<typeof lookupTransaction>[0]> = {},
): Promise<SadadApiResult> =>
  lookupTransaction({
    fetch: f.fetchImpl,
    creds,
    environment: "auto",
    orderRef: "QTR-ABC123DEF456",
    ...extra,
  });

describe("detectEnvironment", () => {
  it("reports which Sadad environment accepts the credentials", async () => {
    const live = fakeSadad({ loginOk: { live: true } });
    expect(await detectEnvironment({ fetch: live.fetchImpl, creds, environment: "auto" })).toEqual({ ok: true, environment: "live" });

    const sandbox = fakeSadad({ loginOk: { live: false, sandbox: true } });
    expect(await detectEnvironment({ fetch: sandbox.fetchImpl, creds, environment: "auto" })).toEqual({ ok: true, environment: "sandbox" });
  });

  it("explains a failed login for every environment tried", async () => {
    const f = fakeSadad({ loginOk: { live: false, sandbox: false } });
    const result = await detectEnvironment({ fetch: f.fetchImpl, creds, environment: "auto" });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.errors).toEqual(["login_live_401", "login_sandbox_401"]);
  });

  it("respects an explicitly configured environment", async () => {
    const f = fakeSadad({ loginOk: { live: false, sandbox: true } });
    expect((await detectEnvironment({ fetch: f.fetchImpl, creds, environment: "live" })).ok).toBe(false);
    expect(await detectEnvironment({ fetch: f.fetchImpl, creds, environment: "sandbox" })).toEqual({ ok: true, environment: "sandbox" });
  });

  it("never throws on network failure", async () => {
    const f = fakeSadad({ networkDown: true });
    expect((await detectEnvironment({ fetch: f.fetchImpl, creds, environment: "auto" })).ok).toBe(false);
  });
});

describe("lookupTransaction", () => {
  it("logs in with sadadId/secretKey/domain and sends the raw token as Authorization", async () => {
    const f = fakeSadad({ loginOk: { live: true }, list: [txn()] });
    await run(f);
    const login = f.calls[0];
    expect(login.url).toBe(`${LIVE}/api/userbusinesses/login`);
    expect(login.method).toBe("POST");
    expect(JSON.parse(login.body!)).toEqual({ sadadId: 1664851, secretKey: "S3CR3T", domain: "example.qa" });
    const list = f.calls[1];
    expect(list.url).toContain(`${LIVE}/api/transactions/listTransactions?`);
    expect(list.url).toContain("website_ref_no=QTR-ABC123DEF456");
    expect(list.headers.Authorization).toBe("token-live");
  });

  it("reports a successful transaction with its amount and number", async () => {
    const f = fakeSadad({ loginOk: { live: true }, list: [txn()] });
    expect(await run(f)).toEqual({
      kind: "success",
      transactionNumber: "SD2883696582255",
      amount: 150,
      websiteRefNo: "QTR-ABC123DEF456",
      sandbox: false,
    });
  });

  it("falls back to the sandbox API when the live login is rejected (auto)", async () => {
    const f = fakeSadad({ loginOk: { live: false, sandbox: true }, list: [txn()] });
    const result = await run(f);
    expect(result).toMatchObject({ kind: "success", sandbox: true });
    expect(f.calls.map((c) => c.url.split("/api/")[0])).toEqual([LIVE, SANDBOX, SANDBOX]);
  });

  it("only talks to the configured environment when it is not auto", async () => {
    const f = fakeSadad({ loginOk: { live: false, sandbox: true }, list: [txn()] });
    const result = await run(f, { environment: "live" });
    expect(result.kind).toBe("unavailable");
    expect(f.calls.every((c) => c.url.startsWith(LIVE))).toBe(true);
  });

  it("prefers a success over earlier failed attempts for the same order", async () => {
    const f = fakeSadad({
      loginOk: { live: true },
      list: [txn({ invoicenumber: "SD1", transactionstatusId: 2 }), txn({ invoicenumber: "SD2" })],
    });
    expect(await run(f)).toMatchObject({ kind: "success", transactionNumber: "SD2" });
  });

  it.each([
    [2, "failed"],
    [7, "failed"],
    [4, "failed"],
    [1, "in_progress"],
    [5, "in_progress"],
    [6, "in_progress"],
  ])("maps Sadad status %s to %s", async (statusId, kind) => {
    const f = fakeSadad({ loginOk: { live: true }, list: [txn({ transactionstatusId: statusId })] });
    expect((await run(f)).kind).toBe(kind);
  });

  it("returns not_found when Sadad knows nothing about the order", async () => {
    const f = fakeSadad({ loginOk: { live: true }, list: [] });
    expect(await run(f)).toEqual({ kind: "not_found" });
  });

  it("looks the transaction number up when the order search is empty", async () => {
    const f = fakeSadad({ loginOk: { live: true }, list: [], single: txn({ website_ref_no: null }) });
    const result = await run(f, { transactionNumber: "SD2883696582255" });
    expect(result).toMatchObject({ kind: "success", transactionNumber: "SD2883696582255" });
    expect(f.calls.at(-1)!.url).toContain("getTransaction?transactionno=SD2883696582255");
  });

  it("ignores a transaction that belongs to a different order", async () => {
    const f = fakeSadad({
      loginOk: { live: true },
      list: [],
      single: txn({ website_ref_no: "QTR-SOMEONEELSE" }),
    });
    expect(await run(f, { transactionNumber: "SD2883696582255" })).toEqual({ kind: "not_found" });
  });

  it("never throws: network failure becomes unavailable", async () => {
    const f = fakeSadad({ networkDown: true });
    const result = await run(f);
    expect(result.kind).toBe("unavailable");
  });

  it("treats a server error from the list endpoint as unavailable", async () => {
    const f = fakeSadad({ loginOk: { live: true }, listStatus: 500, list: { error: "boom" } });
    expect((await run(f)).kind).toBe("unavailable");
  });

  it("ignores rows with a non-numeric amount instead of trusting them", async () => {
    const f = fakeSadad({ loginOk: { live: true }, list: [txn({ amount: "n/a" })] });
    expect((await run(f)).kind).not.toBe("success");
  });

  it("rejects an unsafe order reference before making any request", async () => {
    const f = fakeSadad({ loginOk: { live: true } });
    const result = await run(f, { orderRef: "x&evil=1" });
    expect(result.kind).toBe("unavailable");
    expect(f.calls).toHaveLength(0);
  });
});
