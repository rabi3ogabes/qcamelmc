import { createClient } from "https://esm.sh/@supabase/supabase-js@2.58.0";
import { createOrderHandler } from "./handler.ts";
import { serviceFunctionCaller } from "../_shared/internal-call.ts";
import { makeQrGenerator } from "../_shared/qr.ts";
import { createQrStorage, createRepo, type SupabaseLike } from "../_shared/repo.ts";

const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const sb = createClient(supabaseUrl, serviceKey, {
  auth: { persistSession: false, autoRefreshToken: false },
}) as unknown as SupabaseLike;

const repo = createRepo(sb);

Deno.serve(
  createOrderHandler({
    repo,
    auth: repo,
    storage: createQrStorage(sb),
    generateQr: makeQrGenerator({ loadLib: () => import("npm:qrcode@1.5.4"), fetch }),
    fetch,
    supabaseUrl,
    staffPasscode: Deno.env.get("STAFF_PASSCODE"),
    callFunction: serviceFunctionCaller(supabaseUrl, serviceKey),
    waitUntil: (work) => {
      const runtime = (globalThis as { EdgeRuntime?: { waitUntil?: (p: Promise<unknown>) => void } }).EdgeRuntime;
      if (runtime?.waitUntil) runtime.waitUntil(work);
      else work.catch(() => undefined);
    },
  }),
);
