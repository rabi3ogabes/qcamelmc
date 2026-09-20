import { useEffect, useState } from "react";
import { useParams } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Card } from "@/components/ui/card";
import { Loader2, SearchX } from "lucide-react";
import { Footer } from "@/components/Footer";
import { InvoiceCard } from "@/components/InvoiceCard";
import { useSettings } from "@/contexts/SettingsContext";
import type { InvoiceData } from "@/lib/generateInvoicePdf";

const InvoicePage = () => {
  const { bookingReference } = useParams<{ bookingReference: string }>();
  const { settings } = useSettings();
  const [invoice, setInvoice] = useState<InvoiceData | null>(null);
  const [orderId, setOrderId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let active = true;

    const load = async () => {
      if (!bookingReference) {
        setLoading(false);
        return;
      }
      try {
        const { data, error } = await supabase.rpc("get_public_order", {
          p_booking_reference: bookingReference,
        });
        if (error) throw error;
        if (!active) return;

        const order = data as any;
        if (!order?.id) {
          setInvoice(null);
          setOrderId(null);
          return;
        }
        setOrderId(order.id);

        const holders = (order.ticket_holders || []) as Array<{
          qr_code: string | null;
          ticket_type: string;
          is_present?: boolean | null;
          confirmed_at?: string | null;
          confirmed_by_name?: string | null;
        }>;
        const withQr = holders.filter((h) => h.qr_code);
        setInvoice({
          booking_reference: order.booking_reference,
          customer_name: order.customers?.name || "-",
          customer_phone: `${order.customers?.country_code || ""}${order.customers?.phone || ""}`,
          nationality: order.customers?.nationality ?? null,
          ticket_type: order.ticket_type,
          quantity: order.quantity,
          total_amount: Number(order.total_amount || 0),
          payment_status: order.payment_status,
          event_title: order.events?.title || "-",
          event_date: order.events?.event_date || "",
          qr_codes: withQr.map((h) => h.qr_code) as string[],
          ticket_types: withQr.map((h) => h.ticket_type),
          ticket_states: withQr,
          logo_url: settings?.logo_url ?? null,
          payment_id: order.payment_id ?? null,
          payment_method: order.payment_method ?? null,
          paid_at: order.confirmed_at ?? null,
        });
      } catch (e) {
        console.error("Failed to load invoice:", e);
        if (active) setInvoice(null);
      } finally {
        if (active) setLoading(false);
      }
    };

    load();
    // Refresh so a scanned ticket switches to "مستخدمة" without a manual reload
    const interval = window.setInterval(load, 15000);
    const onFocus = () => load();
    window.addEventListener("focus", onFocus);
    return () => {
      active = false;
      window.clearInterval(interval);
      window.removeEventListener("focus", onFocus);
    };
  }, [bookingReference, settings?.logo_url]);

  // Real-time: refresh instantly when any ticket of this order is scanned
  useEffect(() => {
    if (!orderId) return;
    const channel = supabase
      .channel(`invoice-holders-${orderId}`)
      .on(
        "postgres_changes",
        {
          event: "UPDATE",
          schema: "public",
          table: "ticket_holders",
          filter: `order_id=eq.${orderId}`,
        },
        () => loadRef.current?.(),
      )
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
  }, [orderId]);

  return (
    <div className="min-h-screen bg-background" dir="rtl">
      <main className="mx-auto w-full max-w-3xl px-4 py-10">
        {loading ? (
          <div className="flex items-center justify-center py-24">
            <Loader2 className="h-8 w-8 animate-spin text-primary" />
          </div>
        ) : invoice ? (
          <InvoiceCard data={invoice} />
        ) : (
          <Card className="flex flex-col items-center gap-3 p-10 text-center">
            <SearchX className="h-10 w-10 text-muted-foreground" />
            <h1 className="text-xl font-semibold">لم يتم العثور على الفاتورة</h1>
            <p className="text-sm text-muted-foreground">
              تأكد من رقم الحجز في الرابط، أو تواصل مع خدمة العملاء.
            </p>
          </Card>
        )}
      </main>
      <Footer />
    </div>
  );
};

export default InvoicePage;
