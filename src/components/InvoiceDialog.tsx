import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { Loader2, SearchX } from "lucide-react";
import { InvoiceCard } from "@/components/InvoiceCard";
import { useSettings } from "@/contexts/SettingsContext";
import type { InvoiceData } from "@/lib/generateInvoicePdf";

/** Popup that renders the full invoice (same card as the public /invoice page) */
const InvoiceDialog = ({
  bookingReference,
  open,
  onOpenChange,
}: {
  bookingReference: string | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) => {
  const { settings } = useSettings();
  const [invoice, setInvoice] = useState<InvoiceData | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!open || !bookingReference) {
      setInvoice(null);
      return;
    }
    let active = true;
    setLoading(true);

    const load = async () => {
      try {
        const { data, error } = await supabase.rpc("get_public_order", {
          p_booking_reference: bookingReference,
        });
        if (error) throw error;
        if (!active) return;

        const order = data as any;
        if (!order?.id) {
          setInvoice(null);
          return;
        }

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
    // Refresh so a scanned ticket switches to "مستخدمة" live
    const interval = window.setInterval(load, 15000);
    return () => {
      active = false;
      window.clearInterval(interval);
    };
  }, [open, bookingReference, settings?.logo_url]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        dir="rtl"
        className="max-h-[90vh] max-w-3xl overflow-y-auto"
      >
        {loading ? (
          <div className="flex items-center justify-center py-20">
            <Loader2 className="h-8 w-8 animate-spin text-primary" />
          </div>
        ) : invoice ? (
          <InvoiceCard data={invoice} />
        ) : (
          <div className="flex flex-col items-center gap-2 py-14 text-center">
            <SearchX className="h-10 w-10 text-muted-foreground" />
            <p className="text-sm text-muted-foreground">
              لم يتم العثور على الفاتورة
            </p>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
};

export default InvoiceDialog;
