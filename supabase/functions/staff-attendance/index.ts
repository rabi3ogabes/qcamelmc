import { createClient } from "https://esm.sh/@supabase/supabase-js@2.58.0";
import { isStaffAuthorized, unauthorizedResponse } from "../_shared/staffAuth.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });

const isDateKey = (v: unknown): v is string =>
  typeof v === "string" && /^\d{4}-\d{2}-\d{2}$/.test(v);

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const body = await req.json().catch(() => ({}));
    const { mode, passcode, date, from, to, pos_user_id, status, marked_by } = body ?? {};

    const admin = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
      { auth: { persistSession: false } },
    );

    if (!(await isStaffAuthorized(req, admin, passcode))) {
      return unauthorizedResponse(corsHeaders);
    }

    if (mode === "list") {
      if (!isDateKey(from) || !isDateKey(to)) return json({ error: "bad_range" }, 400);
      const [users, records] = await Promise.all([
        admin
          .from("pos_users")
          .select("id, name, icon, is_active")
          .eq("is_active", true)
          .order("name", { ascending: true }),
        admin
          .from("staff_attendance")
          .select("pos_user_id, attendance_date, status")
          .gte("attendance_date", from)
          .lte("attendance_date", to),
      ]);
      if (users.error || records.error) {
        return json({ error: (users.error || records.error)?.message }, 500);
      }
      return json({ users: users.data ?? [], records: records.data ?? [] });
    }

    if (mode === "set") {
      if (!isDateKey(date) || typeof pos_user_id !== "string") {
        return json({ error: "bad_input" }, 400);
      }
      if (status === null) {
        const { error } = await admin
          .from("staff_attendance")
          .delete()
          .eq("pos_user_id", pos_user_id)
          .eq("attendance_date", date);
        if (error) return json({ error: error.message }, 500);
        return json({ success: true });
      }
      if (status !== "present" && status !== "absent") {
        return json({ error: "bad_status" }, 400);
      }
      const { error } = await admin.from("staff_attendance").upsert(
        {
          pos_user_id,
          attendance_date: date,
          status,
          marked_by: typeof marked_by === "string" ? marked_by : null,
          marked_at: new Date().toISOString(),
        },
        { onConflict: "pos_user_id,attendance_date" },
      );
      if (error) return json({ error: error.message }, 500);
      return json({ success: true });
    }

    if (mode === "bulk_present") {
      if (!isDateKey(date)) return json({ error: "bad_input" }, 400);
      const { data: users, error: usersError } = await admin
        .from("pos_users")
        .select("id")
        .eq("is_active", true);
      if (usersError) return json({ error: usersError.message }, 500);
      const now = new Date().toISOString();
      const rows = (users ?? []).map((u: { id: string }) => ({
        pos_user_id: u.id,
        attendance_date: date,
        status: "present",
        marked_by: typeof marked_by === "string" ? marked_by : null,
        marked_at: now,
      }));
      if (!rows.length) return json({ success: true, ids: [] });
      const { error } = await admin
        .from("staff_attendance")
        .upsert(rows, { onConflict: "pos_user_id,attendance_date" });
      if (error) return json({ error: error.message }, 500);
      return json({ success: true, ids: rows.map((r) => r.pos_user_id) });
    }

    if (mode === "clear_day") {
      if (!isDateKey(date)) return json({ error: "bad_input" }, 400);
      const { error } = await admin
        .from("staff_attendance")
        .delete()
        .eq("attendance_date", date);
      if (error) return json({ error: error.message }, 500);
      return json({ success: true });
    }

    return json({ error: "bad_mode" }, 400);
  } catch (e) {
    return json({ error: (e as Error).message }, 500);
  }
});
