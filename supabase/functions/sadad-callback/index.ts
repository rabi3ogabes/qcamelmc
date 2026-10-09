import { createClient } from "https://esm.sh/@supabase/supabase-js@2.58.0";
import { sadadCallbackHandler } from "./handler.ts";
import { createRepo, type SupabaseLike } from "./_shared/repo.ts";

const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
const sb = createClient(supabaseUrl, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!, {
  auth: { persistSession: false, autoRefreshToken: false },
}) as unknown as SupabaseLike;

Deno.serve(
  sadadCallbackHandler({
    repo: createRepo(sb),
    fetch,
    supabaseUrl,
    waitUntil: (work) => {
      const runtime = (globalThis as { EdgeRuntime?: { waitUntil?: (p: Promise<unknown>) => void } }).EdgeRuntime;
      if (runtime?.waitUntil) runtime.waitUntil(work);
      else work.catch(() => undefined);
    },
  }),
);
