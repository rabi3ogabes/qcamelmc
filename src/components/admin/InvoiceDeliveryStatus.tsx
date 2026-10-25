import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { History } from "lucide-react";
import { deliveryCounts } from "../../../supabase/functions/_shared/invoice-delivery";
import { formatQatarDate } from "@/lib/qatarTime";

interface Event { id: string; channel: string; status: string; attempt: number; detail: string | null; template_name: string | null; message_body: string | null; created_at: string; }
export function InvoiceDeliveryStatus({ orderId, emailSentAt, legacyMessage, legacyAt, history = false }: { orderId: string; emailSentAt?: string | null; legacyMessage?: string | null; legacyAt?: string | null; history?: boolean }) {
  const [events, setEvents] = useState<Event[]>([]);
  const [error, setError] = useState(false);
  const [expanded, setExpanded] = useState(history);
  useEffect(() => {
    let active = true;
    const load = async () => {
      const rows: Event[] = [];
      for (let from = 0; ; from += 1000) {
        const { data, error } = await supabase.from("email_delivery_events").select("id, channel, status, attempt, detail, template_name, message_body, created_at").eq("order_id", orderId).order("created_at", { ascending: false }).range(from, from + 999);
        if (error) { if (active) setError(true); return; }
        rows.push(...(data ?? []));
        if (!data || data.length < 1000) break;
      }
      if (active) { setError(false); setEvents(rows); }
    };
    load();
    const timer = setInterval(load, 5000);
    return () => { active = false; clearInterval(timer); };
  }, [orderId]);
  const email = deliveryCounts(events, "email");
  const whatsapp = deliveryCounts(events, "whatsapp");
  return <div className="space-y-2 min-w-[180px]">
    <Badge variant="outline">البريد: {email.sent || (emailSentAt ? 1 : 0)} إرسال</Badge>
    <Badge variant="outline">واتساب: {whatsapp.sent} إرسال مؤكد</Badge>
    {whatsapp.queued > 0 && <p className="text-xs text-muted-foreground">واتساب: {whatsapp.queued} بانتظار تأكيد n8n</p>}
    {whatsapp.failed > 0 && <p className="text-xs text-destructive">واتساب: {whatsapp.failed} محاولة فاشلة</p>}
    {events.every(e => e.channel !== "whatsapp") && legacyMessage && legacyAt && <p className="text-xs text-muted-foreground">سجل سابق: {legacyMessage} — عدد الإرسال غير متوفر</p>}
    {error && <p className="text-xs text-destructive">تعذّر تحميل سجل الإرسال</p>}
    {!history && <Button variant="ghost" size="sm" onClick={() => setExpanded(v => !v)}><History className="h-3 w-3 ml-1" />سجل الإرسال</Button>}
    {expanded && <ol className="space-y-3 max-h-80 overflow-auto">
      {events.length === 0 && <li className="text-xs text-muted-foreground">لا توجد محاولات مسجلة</li>}
      {events.map(e => <li key={e.id} className="border-r-2 border-border pr-2 text-xs space-y-1">
        <p>{e.channel === "whatsapp" ? "واتساب" : "البريد"} — {({ sent: "تم الإرسال", queued: "بانتظار التأكيد", retried: "إعادة محاولة", failed: "فشل", suppressed: "محظور" } as Record<string, string>)[e.status] ?? e.status}</p>
        <p className="text-muted-foreground">{formatQatarDate(e.created_at, { dateStyle: "short", hour: "2-digit", minute: "2-digit" })}</p>
        {e.template_name && <p>{e.template_name}</p>}
        {e.detail && <p className="break-words">{e.detail}</p>}
        {e.message_body && <p className="whitespace-pre-wrap break-words">{e.message_body}</p>}
      </li>)}
    </ol>}
  </div>;
}