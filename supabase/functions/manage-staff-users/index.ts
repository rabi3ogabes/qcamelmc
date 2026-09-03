import { createClient } from "https://esm.sh/@supabase/supabase-js@2.57.4";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const admin = createClient(
  Deno.env.get("SUPABASE_URL") ?? "",
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "",
);

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });

/** Only a full admin may manage staff accounts and roles. */
async function requireAdmin(req: Request): Promise<boolean> {
  const token = (req.headers.get("Authorization") || "").replace("Bearer ", "").trim();
  if (!token) return false;
  const { data } = await admin.auth.getUser(token);
  const userId = data?.user?.id;
  if (!userId) return false;
  const { data: adminRow } = await admin
    .from("admin_users").select("id").eq("id", userId).maybeSingle();
  if (adminRow) return true;
  const { data: roleRow } = await admin
    .from("user_roles").select("role").eq("user_id", userId).eq("role", "admin").maybeSingle();
  return !!roleRow;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    if (!(await requireAdmin(req))) {
      return json({ success: false, message: "غير مصرح" }, 401);
    }

    const { action, email, password, userId, role } = await req.json();

    if (action === "list") {
      const { data: roles } = await admin.from("user_roles").select("user_id, role");
      const { data: users } = await admin.auth.admin.listUsers({ page: 1, perPage: 200 });
      const emailById = new Map((users?.users || []).map((u: any) => [u.id, u.email]));
      const list = (roles || []).map((r: any) => ({
        user_id: r.user_id,
        role: r.role,
        email: emailById.get(r.user_id) || "—",
      }));
      return json({ success: true, users: list });
    }

    if (action === "create") {
      if (!email || !password || password.length < 8) {
        return json({ success: false, message: "البريد وكلمة مرور (8 أحرف على الأقل) مطلوبة" }, 400);
      }
      const { data: created, error } = await admin.auth.admin.createUser({
        email,
        password,
        email_confirm: true,
      });
      if (error) return json({ success: false, message: error.message }, 400);
      await admin.from("user_roles").insert({ user_id: created.user.id, role: role || "moderator" });
      return json({ success: true, user_id: created.user.id });
    }

    if (action === "set_role") {
      if (!userId || !role) return json({ success: false, message: "بيانات ناقصة" }, 400);
      await admin.from("user_roles").delete().eq("user_id", userId);
      await admin.from("user_roles").insert({ user_id: userId, role });
      return json({ success: true });
    }

    if (action === "revoke") {
      if (!userId) return json({ success: false, message: "بيانات ناقصة" }, 400);
      await admin.from("user_roles").delete().eq("user_id", userId);
      return json({ success: true });
    }

    return json({ success: false, message: "إجراء غير معروف" }, 400);
  } catch (e) {
    return json({ success: false, message: (e as Error).message }, 500);
  }
});
