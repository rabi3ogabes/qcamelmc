import { createClient } from "https://esm.sh/@supabase/supabase-js@2.58.0";
import { staffAuthHandler } from "./handler.ts";
import { staffPasscodeProblem, verifyStaffPasscode } from "../_shared/staffAuth.ts";

const admin = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!, {
  auth: { persistSession: false, autoRefreshToken: false },
});

/** Verifies the staff passcode server-side so it never ships in the browser bundle. */
Deno.serve(
  staffAuthHandler({
    verify: verifyStaffPasscode,
    problem: staffPasscodeProblem,
    async attemptsSince(identifier, sinceIso) {
      const { data, error } = await admin
        .from("login_attempts")
        .select("attempted_at, success")
        .eq("identifier", identifier)
        .gte("attempted_at", sinceIso)
        .order("attempted_at", { ascending: false })
        .limit(200);
      if (error) throw error;
      return (data ?? []) as { attempted_at: string; success: boolean }[];
    },
    async record({ identifier, success, ip, userAgent }) {
      const { error } = await admin
        .from("login_attempts")
        .insert({ identifier, kind: "passcode", success, ip_address: ip, user_agent: userAgent });
      if (error) throw error;
    },
  }),
);
