import { createClient } from "https://esm.sh/@supabase/supabase-js@2.58.0";
import { sadadPaymentHandler } from "./handler.ts";
import { createRepo, type SupabaseLike } from "./_shared/repo.ts";

const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
const sb = createClient(supabaseUrl, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!, {
  auth: { persistSession: false, autoRefreshToken: false },
}) as unknown as SupabaseLike;

Deno.serve(sadadPaymentHandler({ repo: createRepo(sb), supabaseUrl }));
