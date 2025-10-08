import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { Html5QrcodeScanner } from "html5-qrcode";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { ArrowLeft, CheckCircle2, XCircle, Loader2 } from "lucide-react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";

interface TicketInfo {
  booking_reference: string;
  customer_name: string;
  ticket_type: string;
  quantity: number;
  payment_status: string;
  is_present: boolean;
}

const QRScanner = () => {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const [scanning, setScanning] = useState(true);
  const [processing, setProcessing] = useState(false);
  const [ticketInfo, setTicketInfo] = useState<TicketInfo | null>(null);
  const [scanResult, setScanResult] = useState<'success' | 'error' | null>(null);

  useEffect(() => {
    checkAuth();
    initializeScanner();

    return () => {
      const scanner = document.getElementById("qr-reader");
      if (scanner) {
        scanner.innerHTML = "";
      }
    };
  }, []);

  const checkAuth = async () => {
    const { data: { session } } = await supabase.auth.getSession();
    if (!session) {
      navigate("/admin/login");
    }
  };

  const initializeScanner = () => {
    const config = {
      fps: 10,
      qrbox: { width: 250, height: 250 },
      aspectRatio: 1.0,
    };

    const scanner = new Html5QrcodeScanner("qr-reader", config, false);

    scanner.render(onScanSuccess, onScanError);
  };

  const onScanSuccess = async (decodedText: string) => {
    setProcessing(true);
    setScanning(false);

    try {
      // Query the order by booking reference
      const { data: order, error } = await supabase
        .from("orders")
        .select("*, customers(name)")
        .eq("booking_reference", decodedText)
        .single();

      if (error || !order) {
        setScanResult('error');
        toast.error(t('ticketNotFound') || "تذكرة غير موجودة");
        setTimeout(resetScanner, 3000);
        return;
      }

      // Check if already checked in
      if (order.is_present) {
        setScanResult('error');
        setTicketInfo({
          booking_reference: order.booking_reference,
          customer_name: order.customers.name,
          ticket_type: order.ticket_type,
          quantity: order.quantity,
          payment_status: order.payment_status,
          is_present: order.is_present,
        });
        toast.error(t('ticketAlreadyUsed') || "تم استخدام التذكرة مسبقاً");
        setTimeout(resetScanner, 3000);
        return;
      }

      // Check payment status
      if (order.payment_status !== 'confirmed') {
        setScanResult('error');
        setTicketInfo({
          booking_reference: order.booking_reference,
          customer_name: order.customers.name,
          ticket_type: order.ticket_type,
          quantity: order.quantity,
          payment_status: order.payment_status,
          is_present: order.is_present,
        });
        toast.error(t('paymentNotConfirmed') || "الدفع غير مؤكد");
        setTimeout(resetScanner, 3000);
        return;
      }

      // Mark as present
      const { error: updateError } = await supabase
        .from("orders")
        .update({ is_present: true })
        .eq("id", order.id);

      if (updateError) throw updateError;

      setScanResult('success');
      setTicketInfo({
        booking_reference: order.booking_reference,
        customer_name: order.customers.name,
        ticket_type: order.ticket_type,
        quantity: order.quantity,
        payment_status: order.payment_status,
        is_present: true,
      });

      toast.success(t('ticketValidated') || "تم التحقق من التذكرة بنجاح");
      setTimeout(resetScanner, 3000);

    } catch (error) {
      console.error("Error validating ticket:", error);
      setScanResult('error');
      toast.error(t('validationError') || "خطأ في التحقق من التذكرة");
      setTimeout(resetScanner, 3000);
    } finally {
      setProcessing(false);
    }
  };

  const onScanError = (error: any) => {
    // Ignore scan errors (they happen frequently during scanning)
    console.debug("Scan error:", error);
  };

  const resetScanner = () => {
    setTicketInfo(null);
    setScanResult(null);
    setScanning(true);
    setProcessing(false);
    
    // Reinitialize scanner
    const scanner = document.getElementById("qr-reader");
    if (scanner) {
      scanner.innerHTML = "";
    }
    initializeScanner();
  };

  return (
    <div className="min-h-screen bg-background py-8 px-4 font-lusail" dir="rtl">
      <div className="max-w-2xl mx-auto">
        {/* Header */}
        <div className="flex items-center gap-4 mb-8">
          <Button
            variant="ghost"
            onClick={() => navigate("/admin/dashboard")}
            className="gap-2"
          >
            <ArrowLeft className="w-4 h-4" />
            {t('back') || 'رجوع'}
          </Button>
          <h1 className="text-3xl font-bold">
            {t('scanTicket') || 'مسح التذكرة'}
          </h1>
        </div>

        {/* Scanner */}
        <Card className="p-6 mb-6">
          <div id="qr-reader" className="w-full"></div>
          
          {processing && (
            <div className="flex items-center justify-center gap-2 mt-4">
              <Loader2 className="w-6 h-6 animate-spin" />
              <span>{t('processing') || 'جاري المعالجة...'}</span>
            </div>
          )}
        </Card>

        {/* Result Display */}
        {ticketInfo && (
          <Card className={`p-6 ${scanResult === 'success' ? 'border-green-500 bg-green-50' : 'border-red-500 bg-red-50'}`}>
            <div className="flex items-center gap-3 mb-4">
              {scanResult === 'success' ? (
                <CheckCircle2 className="w-8 h-8 text-green-600" />
              ) : (
                <XCircle className="w-8 h-8 text-red-600" />
              )}
              <h2 className="text-2xl font-bold">
                {scanResult === 'success' 
                  ? (t('validTicket') || 'تذكرة صالحة') 
                  : (t('invalidTicket') || 'تذكرة غير صالحة')}
              </h2>
            </div>

            <div className="space-y-3">
              <div className="flex justify-between">
                <span className="font-semibold">{t('bookingReference') || 'رقم الحجز'}:</span>
                <span className="font-mono">{ticketInfo.booking_reference}</span>
              </div>
              <div className="flex justify-between">
                <span className="font-semibold">{t('customerName') || 'اسم العميل'}:</span>
                <span>{ticketInfo.customer_name}</span>
              </div>
              <div className="flex justify-between">
                <span className="font-semibold">{t('ticketType') || 'نوع التذكرة'}:</span>
                <span className="uppercase">{ticketInfo.ticket_type}</span>
              </div>
              <div className="flex justify-between">
                <span className="font-semibold">{t('quantity') || 'الكمية'}:</span>
                <span>{ticketInfo.quantity}</span>
              </div>
              <div className="flex justify-between">
                <span className="font-semibold">{t('paymentStatus') || 'حالة الدفع'}:</span>
                <span className={ticketInfo.payment_status === 'confirmed' ? 'text-green-600' : 'text-orange-600'}>
                  {ticketInfo.payment_status === 'confirmed' 
                    ? (t('confirmed') || 'مؤكد') 
                    : (t('pending') || 'معلق')}
                </span>
              </div>
              {ticketInfo.is_present && scanResult === 'error' && (
                <div className="pt-3 border-t border-red-300">
                  <p className="text-red-700 font-semibold">
                    {t('alreadyCheckedIn') || 'تم تسجيل الدخول مسبقاً'}
                  </p>
                </div>
              )}
            </div>
          </Card>
        )}

        {/* Instructions */}
        <Card className="p-6 mt-6 bg-blue-50 border-blue-200">
          <h3 className="font-semibold mb-2 text-blue-900">
            {t('instructions') || 'التعليمات'}:
          </h3>
          <ul className="space-y-2 text-blue-800">
            <li>• {t('scanInstruction1') || 'وجه الكاميرا نحو رمز QR'}</li>
            <li>• {t('scanInstruction2') || 'تأكد من وضوح الرمز'}</li>
            <li>• {t('scanInstruction3') || 'سيتم التحقق من التذكرة تلقائياً'}</li>
          </ul>
        </Card>
      </div>
    </div>
  );
};

export default QRScanner;
