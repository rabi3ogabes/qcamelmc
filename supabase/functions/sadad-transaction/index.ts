import "../_shared/track-install.ts";
import { createClient } from "npm:@supabase/supabase-js@2";
import { corsHeaders } from "npm:@supabase/supabase-js@2/cors";
import { z } from "npm:zod@3";
import { createRepo } from "../_shared/repo.ts";
import { sadadCredentialsFromSettings } from "../_shared/settings.ts";

const RequestSchema = z
  .object({
    orderId: z.string().uuid().optional(),
    transactionno: z.string().trim().min(1).max(100).optional(),
  })
  .refine((value) => value.orderId || value.transactionno, {
    message: "يجب تحديد الطلب أو رقم عملية سداد",
  });

const STATUS_AR: Record<string, string> = {
  INPROGRESS: "قيد المعالجة",
  "IN PROGRESS": "قيد المعالجة",
  FAILED: "فشلت",
  SUCCESS: "ناجحة",
  REFUND: "مستردة",
  REFUNDED: "مستردة",
  PENDING: "معلقة",
  ONHOLD: "موقوفة",
  "ON HOLD": "موقوفة",
  REJECTED: "مرفوضة",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  const json = (body: unknown, status = 200) =>
    new Response(JSON.stringify(body), {
      status,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });

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

    const parsedBody = RequestSchema.safeParse(await req.json().catch(() => ({})));
    if (!parsedBody.success) {
      return json({ error: parsedBody.error.issues[0]?.message || "بيانات الطلب غير صالحة" }, 400);
    }
    const orderId = parsedBody.data.orderId;
    let transactionNo = parsedBody.data.transactionno;

    if (!transactionNo && orderId) {
      const { data: order } = await admin
        .from("orders")
        .select("payment_id, payment_method")
        .eq("id", orderId)
        .maybeSingle();
      if (!order) return json({ error: "الطلب غير موجود" }, 404);
      if (order.payment_method !== "sadad") {
        return json({ error: "هذا الطلب ليس عبر سداد" }, 400);
      }
      transactionNo = order.payment_id ?? undefined;
    }

    if (!transactionNo) {
      return json({ error: "لا يوجد رقم عملية سداد لهذا الطلب" }, 400);
    }

    const settings = await createRepo(admin).getPrivateSettings();
    const credentials = sadadCredentialsFromSettings(settings);
    if (!credentials) {
      return json({
        success: false,
        code: "SADAD_API_LOGIN_NOT_CONFIGURED",
        error: "أكمل رقم التاجر والمفتاح السري والنطاق في إعدادات سداد لعرض تفاصيل العملية.",
      });
    }
    const { domain } = credentials;

    // 1) Authenticate with Sadad
    const loginRes = await fetch("https://api-s.sadad.qa/api/userbusinesses/login", {
      method: "POST",
      headers: { "Content-Type": "application/json", Accept: "application/json" },
      body: JSON.stringify({ ...credentials, sadadId: Number(credentials.sadadId) }),
    });
    const loginJson = await loginRes.json().catch(() => ({}));
    const accessToken = loginRes.ok && typeof loginJson?.accessToken === "string"
      ? loginJson.accessToken
      : undefined;

    if (!accessToken) {
      console.error("Sadad API login rejected", loginRes.status);
      return json(
        {
          success: false,
          code: "SADAD_API_LOGIN_REJECTED",
          error: "رفضت سداد بيانات الدخول المحفوظة. راجع رقم التاجر والمفتاح السري والنطاق في الإعدادات.",
        },
      );
    }


    // 2) Fetch the transaction. A POST is required because Fetch forbids a
    // request body on GET/HEAD and the Sadad endpoint expects JSON input.
    const txRes = await fetch("https://api-s.sadad.qa/api/transactions/getTransaction", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Accept: "application/json",
        Authorization: accessToken,
        Origin: `https://${domain}`,
      },
      body: JSON.stringify({ transactionno: transactionNo }),
    });
    const tx = await txRes.json().catch(() => ({}));
    if (!txRes.ok || tx?.error) {
      console.error("Sadad getTransaction failed", txRes.status);
      return json(
        { error: "تعذر جلب تفاصيل العملية من سداد" },
        txRes.status === 404 ? 404 : 502,
      );
    }

    const statusName = String(tx?.transactionstatus?.name ?? "").toUpperCase();
    const amount = Number(tx?.amount ?? 0);
    const commission = Number(tx?.servicecharge ?? 0);
    const refundCharge = Number(tx?.refundcharge ?? 0);

    return json({
      success: true,
      transaction: {
        transactionno: tx?.invoicenumber ?? transactionNo,
        status: statusName || "UNKNOWN",
        statusAr: STATUS_AR[statusName] ?? statusName ?? "غير معروف",
        isRefund: Boolean(tx?.isRefund),
        amount,
        commission,
        refundCharge,
        netAmount: Number((amount - commission - refundCharge).toFixed(3)),
        mode: tx?.transactionmode?.name ?? null,
        entity: tx?.transactionentity?.name ?? null,
        transactiondate: tx?.transactiondate ?? null,
        websiteRefNo: tx?.website_ref_no ?? null,
      },
    });
  } catch (error) {
    console.error("sadad-transaction error", error);
    return json({ error: (error as Error).message || "خطأ غير متوقع" }, 500);
  }
});
