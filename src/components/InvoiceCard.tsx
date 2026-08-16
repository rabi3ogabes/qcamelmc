import { useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { toPng } from "html-to-image";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { FileDown, ImageDown, CheckCircle2, Loader2, Home } from "lucide-react";
import { generateInvoicePdf, type InvoiceData } from "@/lib/generateInvoicePdf";

interface InvoiceCardProps {
  data: InvoiceData;
}

const formatDateTime = (value?: string | null) =>
  value
    ? new Date(value).toLocaleString("ar-u-nu-latn", {
        timeZone: "Asia/Qatar",
        dateStyle: "medium",
        timeStyle: "short",
      })
    : "-";

const formatDate = (value?: string | null) =>
  value
    ? new Date(value).toLocaleDateString("ar-u-nu-latn", {
        timeZone: "Asia/Qatar",
        weekday: "long",
        year: "numeric",
        month: "long",
        day: "numeric",
      })
    : "-";

const TICKET_TYPE_LABELS: Record<string, string> = {
  normal: "عادي",
  vip: "VIP",
  parking: "مواقف",
};

const ticketLabel = (type?: string | null) =>
  (type && TICKET_TYPE_LABELS[type.toLowerCase()]) || type || "-";

const Row = ({ label, value }: { label: string; value: React.ReactNode }) => (
  <div className="flex flex-col gap-1">
    <span className="text-xs text-muted-foreground">{label}</span>
    <span className="font-semibold break-words">{value}</span>
  </div>
);

export const InvoiceCard = ({ data }: InvoiceCardProps) => {
  const captureRef = useRef<HTMLDivElement>(null);
  const [savingImage, setSavingImage] = useState(false);
  const navigate = useNavigate();

  const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
  const qrUrls = (data.qr_codes || []).map((qr) =>
    qr.startsWith("http") ? qr : `${supabaseUrl}/storage/v1/object/public/qr-codes/${qr}.png`,
  );

  const handleImage = async () => {
    if (!captureRef.current) return;
    setSavingImage(true);
    try {
      const dataUrl = await toPng(captureRef.current, {
        pixelRatio: 2,
        cacheBust: true,
        backgroundColor: "#ffffff",
      });
      const link = document.createElement("a");
      link.download = `invoice-${data.booking_reference}.png`;
      link.href = dataUrl;
      link.click();
    } catch (e) {
      console.error("Error generating image invoice:", e);
    } finally {
      setSavingImage(false);
    }
  };

  const isPaid = data.payment_status === "confirmed";

  return (
    <div className="space-y-4">
      <Card
        ref={captureRef}
        className="relative overflow-hidden border-secondary/40 bg-card p-6 sm:p-8 shadow-lg"
      >
        <div className="pointer-events-none absolute inset-x-0 top-0 h-1.5 bg-gradient-to-l from-secondary via-primary to-secondary" />

        <div className="flex flex-col items-center gap-2 border-b border-border pb-5 text-center">
          {data.logo_url && (
            <img src={data.logo_url} alt="الشعار" className="h-14 object-contain" crossOrigin="anonymous" />
          )}
          <h2 className="text-2xl font-bold tracking-tight">فاتورة الحجز</h2>
          <p className="font-mono text-sm text-muted-foreground">{data.booking_reference}</p>
          {isPaid && (
            <span className="mt-1 inline-flex items-center gap-1.5 rounded-full border border-secondary/50 bg-secondary/10 px-3 py-1 text-xs font-semibold text-secondary">
              <CheckCircle2 className="h-3.5 w-3.5" /> تم الدفع بنجاح
            </span>
          )}
        </div>

        <div className="mt-6 grid grid-cols-2 gap-5 sm:grid-cols-3">
          <Row label="الاسم" value={data.customer_name} />
          <Row label="رقم الهاتف" value={<span dir="ltr">{data.customer_phone}</span>} />
          <Row label="الجنسية" value={data.nationality || "-"} />
          <Row label="الفعالية" value={data.event_title} />
          <Row label="التاريخ" value={formatDate(data.event_date)} />
          <Row label="نوع التذكرة" value={ticketLabel(data.ticket_type)} />
        </div>

        <div className="mt-6 grid grid-cols-2 gap-4 rounded-xl border border-secondary/30 bg-muted/50 p-5">
          <div className="text-center">
            <p className="text-xs text-muted-foreground">عدد التذاكر المدفوعة</p>
            <p className="mt-1 text-3xl font-bold text-secondary">{data.quantity}</p>
          </div>
          <div className="text-center">
            <p className="text-xs text-muted-foreground">المبلغ الإجمالي</p>
            <p className="mt-1 text-3xl font-bold text-secondary">
              {Number(data.total_amount).toFixed(2)} <span className="text-base">ر.ق</span>
            </p>
          </div>
        </div>

        <div className="mt-6 grid grid-cols-2 gap-5 sm:grid-cols-3">
          <Row
            label="وسيلة الدفع"
            value={data.payment_method === "cash_pos" ? "نقاط البيع" : "سداد (أونلاين)"}
          />
          <Row label="رقم عملية سداد" value={<span dir="ltr">{data.payment_id || "-"}</span>} />
          <Row label="تاريخ الدفع" value={formatDateTime(data.paid_at)} />
        </div>

        {qrUrls.length > 0 && (
          <div className="mt-6 border-t border-border pt-5">
            <p className="mb-3 text-sm font-semibold">رموز التذاكر (QR)</p>
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
              {qrUrls.map((url, i) => (
                <div key={url + i} className="rounded-lg border border-border bg-background p-2 text-center">
                  <img src={url} alt="QR" className="mx-auto h-28 w-28 object-contain" crossOrigin="anonymous" />
                  <span className="mt-1 block text-xs text-muted-foreground">
                    {ticketLabel(data.ticket_types[i] || data.ticket_type)}
                  </span>
                </div>
              ))}
            </div>
          </div>
        )}

        <p className="mt-6 text-center text-xs text-muted-foreground">
          شكراً لثقتكم — مهرجان قطر للإبل
        </p>
      </Card>

      <div className="flex flex-col gap-3 sm:flex-row">
        <Button size="lg" className="flex-1" onClick={() => generateInvoicePdf(data)}>
          <FileDown className="ml-2 h-5 w-5" /> تحميل الفاتورة (PDF)
        </Button>
        <Button size="lg" variant="outline" className="flex-1" onClick={handleImage} disabled={savingImage}>
          {savingImage ? (
            <Loader2 className="ml-2 h-5 w-5 animate-spin" />
          ) : (
            <ImageDown className="ml-2 h-5 w-5" />
          )}
          حفظ كصورة (PNG)
        </Button>
      </div>

      <Button
        size="lg"
        variant="secondary"
        className="w-full"
        onClick={() => navigate("/")}
      >
        <Home className="ml-2 h-5 w-5" /> للتحويل للصفحة الرئيسية
      </Button>
    </div>
  );
};
