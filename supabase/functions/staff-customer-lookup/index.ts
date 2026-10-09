import { createClient } from "https://esm.sh/@supabase/supabase-js@2.58.0";
import { isStaffAuthorized } from "../_shared/staffAuth.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};


Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { term, passcode } = await req.json();
    const cleaned = typeof term === "string" ? term.trim() : "";
    if (cleaned.length < 3) {
      return new Response(JSON.stringify({ customers: [] }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const admin = createClient(supabaseUrl, serviceKey);

    // isStaffAuthorized already covers administrators, moderators and the team passcode
    const authorized = await isStaffAuthorized(req, admin, passcode);

    if (!authorized) {
      return new Response(JSON.stringify({ error: "unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const pattern = `%${cleaned.replace(/[%,]/g, "")}%`;
    const { data, error } = await admin
      .from("customers")
      .select("id, name, email, phone, country_code, nationality, id_number")
      .ilike("phone", pattern)
      .order("created_at", { ascending: false })
      .limit(8);

    if (error) throw error;

    return new Response(JSON.stringify({ customers: data || [] }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err) {
    console.error("staff-customer-lookup failed:", err);
    return new Response(JSON.stringify({ error: String(err) }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
