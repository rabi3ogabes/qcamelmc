import { createClient } from "https://esm.sh/@supabase/supabase-js@2.58.0";
import { regenerateBookingQrHandler } from "./handler.ts";
import { makeQrGenerator } from "./_shared/qr.ts";
import { createQrStorage, createRepo, type SupabaseLike } from "./_shared/repo.ts";

const sb = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!, {
  auth: { persistSession: false, autoRefreshToken: false },
}) as unknown as SupabaseLike;

const repo = createRepo(sb);
Deno.serve(
  regenerateBookingQrHandler({
    repo,
    auth: repo,
    storage: createQrStorage(sb),
    generateQr: makeQrGenerator({ loadLib: () => import("npm:qrcode@1.5.4"), fetch }),
  }),
);
