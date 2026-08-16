import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

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

    const body = await req.json().catch(() => ({}));
    const orderId: string | undefined = body?.orderId;
    let transactionNo: string | undefined = body?.transactionno;

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

    const { data: settings } = await admin
      .from("settings")
      .select("sadad_merchant_id, sadad_api_key, sadad_secret, sadad_website_domain")
      .limit(1)
      .maybeSingle();

    const sadadId = settings?.sadad_merchant_id;
    const domain = settings?.sadad_website_domain || "qcamelmc.org";

    // Transaction API login uses its own private credential. Prefer the
    // encrypted function secret; retain legacy settings only as fallbacks.
    const candidates = [
      Deno.env.get("SADAD_API_SECRET_KEY"),
      settings?.sadad_api_key,
      settings?.sadad_secret,
    ]
      .map((v) => (typeof v === "string" ? v.trim() : ""))
      .filter((v) => v.length > 0)
      .filter((v, i, arr) => arr.indexOf(v) === i);

    if (!sadadId || candidates.length === 0) {
      return json({ error: "إعدادات سداد غير مكتملة (Sadad ID / Secret Key)" }, 400);
    }

    // 1) Authenticate with Sadad
    let accessToken: string | undefined;
    let lastError = "";
    for (const secretKey of candidates) {
      const loginRes = await fetch("https://api-s.sadad.qa/api/userbusinesses/login", {
        method: "POST",
        headers: { "Content-Type": "application/json", Accept: "application/json" },
        body: JSON.stringify({ sadadId: Number(sadadId), secretKey, domain }),
      });
      const loginJson = await loginRes.json().catch(() => ({}));
      if (loginRes.ok && loginJson?.accessToken) {
        accessToken = loginJson.accessToken;
        break;
      }
      lastError = loginJson?.error?.message || `HTTP ${loginRes.status}`;
      console.error("Sadad login attempt failed", loginRes.status, lastError);
    }

    if (!accessToken) {
      return json(
        {
          error:
            `فشل تسجيل الدخول إلى سداد (${lastError}). ` +
            "يرجى إدخال مفتاح API السري الصحيح من لوحة سداد → API في إعدادات النظام، " +
            `والتأكد من أن النطاق المسجل لدى سداد هو ${domain}.`,
        },
        502,
      );
    }


    // 2) Fetch the transaction (GET with JSON body, per Sadad docs)
    const txRes = await fetch("https://api-s.sadad.qa/api/transactions/getTransaction", {
      method: "GET",
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
      console.error("Sadad getTransaction failed", txRes.status, tx);
      return json(
        { error: tx?.error?.message || "تعذر جلب تفاصيل العملية من سداد" },
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
