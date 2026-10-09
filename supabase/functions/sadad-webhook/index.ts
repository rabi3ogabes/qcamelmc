import { createClient } from "https://esm.sh/@supabase/supabase-js@2.58.0";
import { sadadWebhookHandler } from "./handler.ts";
import { serviceFunctionCaller } from "../_shared/internal-call.ts";
import { createRepo, type SupabaseLike } from "../_shared/repo.ts";

const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const sb = createClient(supabaseUrl, serviceKey, {
  auth: { persistSession: false, autoRefreshToken: false },
}) as unknown as SupabaseLike;

Deno.serve(
  sadadWebhookHandler({
    repo: createRepo(sb),
    fetch,
    supabaseUrl,
    callFunction: serviceFunctionCaller(supabaseUrl, serviceKey),
    waitUntil: (work) => {
      const runtime = (globalThis as { EdgeRuntime?: { waitUntil?: (p: Promise<unknown>) => void } }).EdgeRuntime;
      if (runtime?.waitUntil) runtime.waitUntil(work);
      else work.catch(() => undefined);
    },
  }),
);
