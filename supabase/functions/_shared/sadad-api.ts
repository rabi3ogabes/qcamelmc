// Server-to-server lookups against the Sadad merchant API. Used to confirm a
// payment independently of whatever the customer's browser (callback) or the
// webhook claims. `fetch` is injected so the client is trivially testable.
//
// Docs: https://developer.sadad.qa/API/Authentication
//       https://developer.sadad.qa/API/List-Transactions
//       https://developer.sadad.qa/API/Get-Single-Transaction

export type SadadEnvironment = "auto" | "sandbox" | "live";

export interface SadadCredentials {
  sadadId: string;
  secretKey: string;
  domain: string;
}

export type SadadApiResult =
  | { kind: "success"; transactionNumber: string; amount: number; websiteRefNo: string | null; sandbox: boolean }
  | { kind: "failed"; transactionNumber: string | null }
  | { kind: "in_progress" }
  | { kind: "not_found" }
  | { kind: "unavailable"; error: string };

export interface LookupOptions {
  fetch: typeof fetch;
  creds: SadadCredentials;
  environment: SadadEnvironment;
  orderRef: string;
  transactionNumber?: string | null;
  timeoutMs?: number;
}

const BASES = { live: "https://api-s.sadad.qa", sandbox: "https://api-sandbox.sadad.qa" } as const;
type Env = keyof typeof BASES;

const SAFE_REF = /^[A-Za-z0-9][A-Za-z0-9_-]{0,59}$/;
const SAFE_TXN = /^[A-Za-z0-9_-]{1,64}$/;

const SUCCESS = 3;
const FAILED = new Set([2, 4, 7]);
const IN_PROGRESS = new Set([1, 5, 6]);

type Row = {
  invoicenumber?: unknown;
  amount?: unknown;
  website_ref_no?: unknown;
  transactionstatusId?: unknown;
  transactionstatus?: { id?: unknown } | null;
};

async function call(fetchImpl: typeof fetch, url: string, init: RequestInit, timeoutMs: number): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetchImpl(url, { ...init, signal: controller.signal });
  } finally {
    clearTimeout(timer);
  }
}

const statusOf = (row: Row): number => Number(row.transactionstatusId ?? row.transactionstatus?.id);

const refOf = (row: Row): string | null => {
  const ref = row.website_ref_no;
  return typeof ref === "string" && ref.trim() !== "" ? ref.trim() : null;
};

const amountOf = (row: Row): number | null => {
  if (row.amount === null || row.amount === undefined || row.amount === "") return null;
  const amount = Number(row.amount);
  return Number.isFinite(amount) ? amount : null;
};

/** Turn the rows Sadad returned for one order into a single verdict. */
function summarise(rows: Row[], orderRef: string, sandbox: boolean): SadadApiResult {
  const mine = rows.filter((row) => {
    const ref = refOf(row);
    return ref === null || ref === orderRef;
  });

  const paid = mine.find((row) => statusOf(row) === SUCCESS && amountOf(row) !== null);
  if (paid) {
    return {
      kind: "success",
      transactionNumber: String(paid.invoicenumber ?? ""),
      amount: amountOf(paid) as number,
      websiteRefNo: refOf(paid),
      sandbox,
    };
  }
  if (mine.some((row) => IN_PROGRESS.has(statusOf(row)))) return { kind: "in_progress" };
  const failed = mine.find((row) => FAILED.has(statusOf(row)));
  if (failed) return { kind: "failed", transactionNumber: failed.invoicenumber ? String(failed.invoicenumber) : null };
  return { kind: "not_found" };
}

async function login(
  opts: Pick<LookupOptions, "fetch" | "creds">,
  env: Env,
  timeoutMs: number,
): Promise<{ token: string } | { error: string }> {
  try {
    const res = await call(
      opts.fetch,
      `${BASES[env]}/api/userbusinesses/login`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Accept: "application/json",
          Origin: `https://${opts.creds.domain}`,
        },
        body: JSON.stringify({
          sadadId: Number(opts.creds.sadadId),
          secretKey: opts.creds.secretKey,
          domain: opts.creds.domain,
        }),
      },
      timeoutMs,
    );
    if (!res.ok) return { error: `login_${env}_${res.status}` };
    const body = (await res.json()) as { accessToken?: string };
    return body.accessToken ? { token: body.accessToken } : { error: `login_${env}_no_token` };
  } catch (error) {
    return { error: `login_${env}_${error instanceof Error ? error.message : "failed"}` };
  }
}

export type EnvironmentCheck =
  | { ok: true; environment: "live" | "sandbox" }
  | { ok: false; errors: string[] };

/** Which Sadad environment accepts these credentials? (Used by the admin diagnostics.) */
export async function detectEnvironment(
  opts: Pick<LookupOptions, "fetch" | "creds" | "environment" | "timeoutMs">,
): Promise<EnvironmentCheck> {
  const envs: Env[] = opts.environment === "auto" ? ["live", "sandbox"] : [opts.environment];
  const errors: string[] = [];
  for (const env of envs) {
    const session = await login(opts, env, opts.timeoutMs ?? 8000);
    if (!("error" in session)) return { ok: true, environment: env };
    errors.push(session.error);
  }
  return { ok: false, errors };
}

/**
 * Ask Sadad what happened to an order. Never throws: any transport or
 * authentication problem is reported as `unavailable`.
 */
export async function lookupTransaction(opts: LookupOptions): Promise<SadadApiResult> {
  if (!SAFE_REF.test(opts.orderRef)) return { kind: "unavailable", error: "invalid_order_ref" };
  const timeoutMs = opts.timeoutMs ?? 8000;
  const envs: Env[] = opts.environment === "auto" ? ["live", "sandbox"] : [opts.environment];

  const errors: string[] = [];
  for (const env of envs) {
    const session = await login(opts, env, timeoutMs);
    if ("error" in session) {
      errors.push(session.error);
      continue;
    }
    const headers = { Authorization: session.token, Accept: "application/json", "Content-Type": "application/json" };

    try {
      const listUrl =
        `${BASES[env]}/api/transactions/listTransactions?website_ref_no=${encodeURIComponent(opts.orderRef)}&skip=0&limit=50`;
      const listRes = await call(opts.fetch, listUrl, { method: "GET", headers }, timeoutMs);
      if (!listRes.ok) return { kind: "unavailable", error: `list_${env}_${listRes.status}` };
      const rows = await listRes.json();
      if (!Array.isArray(rows)) return { kind: "unavailable", error: `list_${env}_unexpected_response` };

      const fromList = summarise(rows as Row[], opts.orderRef, env === "sandbox");
      if (fromList.kind !== "not_found" || !opts.transactionNumber || !SAFE_TXN.test(opts.transactionNumber)) {
        return fromList;
      }

      const singleUrl = `${BASES[env]}/api/transactions/getTransaction?transactionno=${encodeURIComponent(opts.transactionNumber)}`;
      const singleRes = await call(opts.fetch, singleUrl, { method: "GET", headers }, timeoutMs);
      if (singleRes.status === 404) return { kind: "not_found" };
      if (!singleRes.ok) return { kind: "unavailable", error: `single_${env}_${singleRes.status}` };
      const row = (await singleRes.json()) as Row;
      return summarise([row], opts.orderRef, env === "sandbox");
    } catch (error) {
      return { kind: "unavailable", error: `${env}_${error instanceof Error ? error.message : "failed"}` };
    }
  }
  return { kind: "unavailable", error: errors.join(",") || "no_environment" };
}
