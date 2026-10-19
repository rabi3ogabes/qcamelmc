import "../_shared/track-install.ts";
import { createClient } from "npm:@supabase/supabase-js@2";
import { corsHeaders } from "npm:@supabase/supabase-js@2/cors";
import { z } from "npm:zod@3";
import { createRepo } from "../_shared/repo.ts";
import { sadadCredentialsFromSettings } from "../_shared/settings.ts";
import { fetchTransactionDetails, type SadadTransactionDetails } from "../_shared/sadad-api.ts";

// Admin-only: Sadad transaction status, mode, amount and fees for one or many orders.
// Docs: https://developer.sadad.qa/API/Get-Single-Transaction

const RequestSchema = z
  .object({
    orderId: z.string().uuid().optional(),
    orderIds: z.array(z.string().uuid()).min(1).max(50).optional(),
  })
  .refine((v) => v.orderId || v.orderIds, { message: "يجب تحديد الطلب" });

const STATUS_AR: Record<string, string> = {
  INPROGRESS: "قيد المعالجة",
  FAILED: "فشلت",
  SUCCESS: "ناجحة",
  REFUND: "مستردة",
  REFUNDED: "مستردة",
  PENDING: "معلقة",
  ONHOLD: "موقوفة",
  REJECTED: "مرفوضة",
};
const MODE_AR: Record<string, string> = {
  "CREDIT CARD": "بطاقة ائتمان",
  "DEBIT CARD": "بطاقة خصم",
  SADAD: "محفظة سداد",
};

const withArabic = (t: SadadTransactionDetails) => ({
  ...t,
  statusAr: STATUS_AR[t.status] ?? t.status,
  modeAr: t.mode ? MODE_AR[t.mode] ?? t.mode : null,
});

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  const json = (body: unknown, status = 200) =>
    new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, "Content-Type": "application/json" } });

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) return json({ error: "Unauthorized" }, 401);
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const userClient = createClient(supabaseUrl, Deno.env.get("SUPABASE_ANON_KEY")!, {
      global: { headers: { Authorization: authHeader } },
    });
    const { data: userData } = await userClient.auth.getUser();
    const user = userData?.user;
    if (!user) return json({ error: "Unauthorized" }, 401);

    const admin = createClient(supabaseUrl, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
    const { data: isAdmin } = await admin.rpc("is_admin", { user_id: user.id });
    if (!isAdmin) return json({ error: "Forbidden" }, 403);

    const parsed = RequestSchema.safeParse(await req.json().catch(() => ({})));
    if (!parsed.success) return json({ error: parsed.error.issues[0]?.message || "بيانات الطلب غير صالحة" }, 400);
    const single = !parsed.data.orderIds;
    const ids = parsed.data.orderIds ?? [parsed.data.orderId!];

    const { data: orders, error: ordersError } = await admin
      .from("orders")
      .select("id, booking_reference, payment_id, payment_method")
      .in("id", ids);
    if (ordersError) throw ordersError;
    const sadadOrders = (orders ?? []).filter((o) => o.payment_method === "sadad");
    if (single && sadadOrders.length === 0) {
      return json({ error: orders?.length ? "هذا الطلب ليس عبر سداد" : "الطلب غير موجود" }, orders?.length ? 400 : 404);
    }

    const settings = await createRepo(admin).getPrivateSettings();
    const creds = sadadCredentialsFromSettings(settings);
    if (!creds) {
      return json({
        success: false,
        code: "SADAD_API_LOGIN_NOT_CONFIGURED",
        error: "أكمل رقم التاجر والمفتاح السري والنطاق في إعدادات سداد لعرض تفاصيل العملية.",
      });
    }

    const results = await fetchTransactionDetails({
      fetch,
      creds,
      environment: settings.environment,
      items: sadadOrders.map((o) => ({ orderRef: o.booking_reference, transactionNumber: o.payment_id })),
    });

    const byOrder: Record<string, unknown> = {};
    sadadOrders.forEach((o, i) => {
      const r = results[i];
      if (r.kind === "unavailable") console.error("sadad-transaction unavailable", o.booking_reference, r.error);
      byOrder[o.id] = r.kind === "found"
        ? { found: true, transaction: withArabic(r.transaction) }
        : r.kind === "not_found"
          ? { found: false, reason: "not_found" }
          : { found: false, reason: "unavailable", error: r.error };
    });

    if (single) {
      const r = results[0];
      if (r.kind === "found") return json({ success: true, transaction: withArabic(r.transaction) });
      if (r.kind === "not_found") return json({ success: false, error: "لا توجد عملية لدى سداد لهذا الطلب بعد" });
      console.error("sadad-transaction lookup unavailable", r.error);
      return json({ success: false, error: "تعذر جلب تفاصيل العملية من سداد" });
    }
    return json({ success: true, results: byOrder });
  } catch (error) {
    console.error("sadad-transaction error", error);
    return json({ error: (error as Error).message || "خطأ غير متوقع" }, 500);
  }
});
