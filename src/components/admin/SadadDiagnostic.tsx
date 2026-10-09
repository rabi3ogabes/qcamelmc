import { useState } from "react";
import { AlertCircle, CheckCircle2, Copy, Loader2, ShieldCheck, TriangleAlert } from "lucide-react";
import { toast } from "sonner";
import { useTranslation } from "react-i18next";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { api, apiErrorMessage, type DiagnoseReport } from "@/lib/api";

const ICONS = {
  ok: <CheckCircle2 className="h-5 w-5 shrink-0 text-green-600" />,
  warn: <TriangleAlert className="h-5 w-5 shrink-0 text-amber-600" />,
  error: <AlertCircle className="h-5 w-5 shrink-0 text-destructive" />,
} as const;

const TITLES: Record<string, string> = {
  merchant_id: "معرف التاجر",
  secret: "المفتاح السري",
  website: "النطاق المسجل",
  api_login: "الاتصال بواجهة سداد",
  api_lookup: "التحقق من المدفوعات",
  callback_url: "رابط العودة بعد الدفع",
  webhook_registration: "تسجيل الـ Webhook في سداد",
  automation: "الأتمتة (n8n)",
  site_url: "عنوان الموقع",
};

function CopyField({ label, value }: { label: string; value: string }) {
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(value);
      toast.success("تم النسخ");
    } catch {
      /* the text is selectable as a fallback */
    }
  };
  return (
    <div>
      <p className="mb-1 text-xs text-muted-foreground">{label}</p>
      <div className="flex items-center gap-2 rounded-md border bg-muted/40 px-3 py-2">
        <code className="min-w-0 flex-1 select-all break-all text-xs" dir="ltr">
          {value}
        </code>
        <Button type="button" variant="ghost" size="icon" onClick={copy} aria-label="copy">
          <Copy className="h-4 w-4" />
        </Button>
      </div>
    </div>
  );
}

/** Is online payment ready? Runs real checks, including a login against Sadad's API. */
export const SadadDiagnostic = () => {
  const { t } = useTranslation();
  const [running, setRunning] = useState(false);
  const [report, setReport] = useState<DiagnoseReport | null>(null);

  const run = async () => {
    setRunning(true);
    const result = await api.diagnoseSadad();
    setRunning(false);
    if (result.ok) {
      setReport(result.data);
    } else {
      setReport(null);
      toast.error(apiErrorMessage(result.error, t));
    }
  };

  return (
    <Card className="p-6">
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <h3 className="flex items-center gap-2 text-lg font-semibold font-lusail">
          <ShieldCheck className="h-5 w-5" />
          فحص جاهزية الدفع
        </h3>
        <Button onClick={run} disabled={running} variant="outline" className="font-lusail">
          {running && <Loader2 className="ml-2 h-4 w-4 animate-spin" />}
          {running ? "جارٍ الفحص..." : "تشغيل الفحص"}
        </Button>
      </div>

      {!report && !running && (
        <p className="text-sm text-muted-foreground">
          احفظ إعدادات سداد ثم شغّل الفحص: يتأكد من الإعدادات ويجرّب الاتصال بسداد فعلياً (اختبار أو إنتاج) ويعرض الروابط التي يجب تسجيلها في لوحة سداد.
        </p>
      )}

      {report && (
        <div className="space-y-5">
          <div className="flex items-center gap-2">
            <Badge variant={report.ready ? "default" : "destructive"}>{report.ready ? "جاهز للدفع" : "يحتاج إلى إصلاح"}</Badge>
            {report.environment && (
              <Badge variant="outline">{report.environment === "sandbox" ? "بيئة الاختبار (Sandbox)" : "بيئة الإنتاج (Live)"}</Badge>
            )}
          </div>

          <ul className="space-y-3">
            {report.checks.map((check) => (
              <li key={check.id} className="flex items-start gap-3 rounded-lg border p-3">
                {ICONS[check.status]}
                <div className="min-w-0">
                  <p className="text-sm font-semibold">{TITLES[check.id] ?? check.id}</p>
                  <p className="break-words text-sm text-muted-foreground">{check.message}</p>
                </div>
              </li>
            ))}
          </ul>

          <div className="space-y-3 rounded-lg bg-muted/40 p-4">
            <p className="text-sm font-semibold">سجّل هذا الرابط في لوحة سداد (Payment Gateway ← Webhook):</p>
            <CopyField label="Webhook URL" value={report.webhookUrl} />
            <CopyField label="Callback URL (يُرسل مع كل طلب تلقائياً)" value={report.callbackUrl} />
          </div>
        </div>
      )}
    </Card>
  );
};
