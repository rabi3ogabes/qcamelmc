import { createClient } from "https://esm.sh/@supabase/supabase-js@2.58.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const STAFF_PASSCODE = Deno.env.get("STAFF_PASSCODE") || "@@@Qatar123";

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

    // Authorize: either a signed-in admin, or the staff passcode.
    let authorized = passcode === STAFF_PASSCODE;

    if (!authorized) {
      const authHeader = req.headers.get("Authorization") || "";
      const token = authHeader.replace("Bearer ", "");
      if (token) {
        const { data: userData } = await admin.auth.getUser(token);
        const userId = userData?.user?.id;
        if (userId) {
          const { data: adminRow } = await admin
            .from("admin_users")
            .select("id")
            .eq("id", userId)
            .maybeSingle();
          authorized = !!adminRow;
        }
      }
    }

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
      .or(`phone.ilike.${pattern},id_number.ilike.${pattern},name.ilike.${pattern}`)
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
