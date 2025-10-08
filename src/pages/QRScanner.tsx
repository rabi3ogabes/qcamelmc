import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { Html5QrcodeScanner } from "html5-qrcode";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { ArrowLeft, CheckCircle2, XCircle, Loader2, Search } from "lucide-react";
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
  const [manualSearch, setManualSearch] = useState("");
  const [showManualSearch, setShowManualSearch] = useState(false);

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

  const processTicket = async (bookingRef: string) => {
    setProcessing(true);
    setScanning(false);

    try {
      // Query the order by booking reference with event info
      const { data: order, error } = await supabase
        .from("orders")
        .select("*, customers(name), events(title)")
        .eq("booking_reference", bookingRef)
        .single();

      if (error || !order) {
        setScanResult('error');
        setTicketInfo({
          booking_reference: bookingRef,
          customer_name: "غير موجود",
          ticket_type: "-",
          quantity: 0,
          payment_status: "غير مؤكد",
          is_present: false,
        });
        toast.error(t('ticketNotFound') || "تذكرة غير موجودة");
        return;
      }

      // Check payment status first
      if (order.payment_status !== 'confirmed') {
        setScanResult('error');
        setTicketInfo({
          booking_reference: order.booking_reference,
          customer_name: order.customers?.name || "غير معروف",
          ticket_type: order.ticket_type,
          quantity: order.quantity,
          payment_status: order.payment_status,
          is_present: order.is_present,
        });
        toast.error(t('paymentNotConfirmed') || "الدفع غير مؤكد");
        return;
      }

      // Check if already checked in
      if (order.is_present) {
        setScanResult('error');
        setTicketInfo({
          booking_reference: order.booking_reference,
          customer_name: order.customers?.name || "غير معروف",
          ticket_type: order.ticket_type,
          quantity: order.quantity,
          payment_status: order.payment_status,
          is_present: order.is_present,
        });
        toast.error(t('ticketAlreadyUsed') || "تم استخدام التذكرة مسبقاً");
        return;
      }

      // Mark as present (checked in)
      const { error: updateError } = await supabase
        .from("orders")
        .update({ 
          is_present: true,
          confirmed_at: new Date().toISOString()
        })
        .eq("id", order.id);

      if (updateError) throw updateError;

      setScanResult('success');
      setTicketInfo({
        booking_reference: order.booking_reference,
        customer_name: order.customers?.name || "غير معروف",
        ticket_type: order.ticket_type,
        quantity: order.quantity,
        payment_status: order.payment_status,
        is_present: true,
      });

      toast.success("✅ " + (t('ticketValidated') || "تم التحقق من التذكرة بنجاح"));

    } catch (error) {
      console.error("Error validating ticket:", error);
      setScanResult('error');
      toast.error(t('validationError') || "خطأ في التحقق من التذكرة");
    } finally {
      setProcessing(false);
    }
  };

  const onScanSuccess = async (decodedText: string) => {
    if (processing) return;
    await processTicket(decodedText);
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
    setManualSearch("");
    
    // Reinitialize scanner
    const scanner = document.getElementById("qr-reader");
    if (scanner) {
      scanner.innerHTML = "";
    }
    initializeScanner();
  };

  const handleManualSearch = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!manualSearch.trim()) {
      toast.error("الرجاء إدخال رقم الحجز");
      return;
    }
    await processTicket(manualSearch.trim());
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
        <Card className="mb-6">
          <CardHeader>
            <CardTitle className="text-center">{t('scanTicket') || 'مسح التذكرة'}</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            {/* Manual Search Toggle */}
            <div className="flex justify-center gap-2">
              <Button
                variant={showManualSearch ? "default" : "outline"}
                onClick={() => setShowManualSearch(!showManualSearch)}
                size="sm"
              >
                <Search className="w-4 h-4 ml-2" />
                {showManualSearch ? "إخفاء البحث اليدوي" : "بحث يدوي"}
              </Button>
            </div>

            {/* Manual Search Input */}
            {showManualSearch && (
              <form onSubmit={handleManualSearch} className="space-y-3">
                <Input
                  type="text"
                  placeholder="أدخل رقم الحجز (مثال: QTR-XXXXXXXX)"
                  value={manualSearch}
                  onChange={(e) => setManualSearch(e.target.value)}
                  className="text-center font-mono"
                  disabled={processing}
                />
                <Button type="submit" className="w-full" disabled={processing}>
                  {processing ? (
                    <>
                      <Loader2 className="w-4 h-4 ml-2 animate-spin" />
                      جاري البحث...
                    </>
                  ) : (
                    <>
                      <Search className="w-4 h-4 ml-2" />
                      بحث عن التذكرة
                    </>
                  )}
                </Button>
              </form>
            )}

            {/* QR Scanner */}
            <div id="qr-reader" className="w-full"></div>
            
            {processing && !showManualSearch && (
              <div className="flex items-center justify-center gap-2 mt-4">
                <Loader2 className="w-6 h-6 animate-spin" />
                <span>{t('processing') || 'جاري المعالجة...'}</span>
              </div>
            )}

            <div className="text-center space-y-2 text-sm text-muted-foreground">
              <p>وجه الكاميرا نحو QR Code للمسح التلقائي</p>
              <p className="text-xs">يعمل على الجوال والكمبيوتر 📱💻</p>
            </div>
          </CardContent>
        </Card>

        {/* Result Display */}
        {ticketInfo && (
          <Card className={`mb-6 border-2 ${
            scanResult === 'success' 
              ? 'border-green-500 bg-green-50 dark:bg-green-950/20' 
              : 'border-red-500 bg-red-50 dark:bg-red-950/20'
          }`}>
            <CardHeader>
              <CardTitle className={`flex items-center justify-center gap-3 text-2xl ${
                scanResult === 'success' 
                  ? 'text-green-700 dark:text-green-400' 
                  : 'text-red-700 dark:text-red-400'
              }`}>
                {scanResult === 'success' ? (
                  <>
                    <CheckCircle2 className="w-8 h-8" />
                    ✅ تم التحقق من التذكرة
                  </>
                ) : (
                  <>
                    <XCircle className="w-8 h-8" />
                    ❌ تذكرة غير صالحة
                  </>
                )}
              </CardTitle>
            </CardHeader>
            <CardContent>

              <div className="space-y-3">
                <div className="flex justify-between items-center py-2 border-b">
                  <span className="font-semibold">{t('bookingReference') || 'رقم الحجز'}:</span>
                  <span className="font-mono text-lg">{ticketInfo.booking_reference}</span>
                </div>
                <div className="flex justify-between items-center py-2 border-b">
                  <span className="font-semibold">{t('customerName') || 'اسم العميل'}:</span>
                  <span>{ticketInfo.customer_name}</span>
                </div>
                <div className="flex justify-between items-center py-2 border-b">
                  <span className="font-semibold">{t('ticketType') || 'نوع التذكرة'}:</span>
                  <span className="uppercase font-bold">{ticketInfo.ticket_type}</span>
                </div>
                <div className="flex justify-between items-center py-2 border-b">
                  <span className="font-semibold">{t('quantity') || 'الكمية'}:</span>
                  <span className="text-lg">{ticketInfo.quantity}</span>
                </div>
                <div className="flex justify-between items-center py-2 border-b">
                  <span className="font-semibold">{t('paymentStatus') || 'حالة الدفع'}:</span>
                  <span className={`font-semibold ${
                    ticketInfo.payment_status === 'confirmed'
                      ? 'text-green-600 dark:text-green-400' 
                      : 'text-orange-600 dark:text-orange-400'
                  }`}>
                    {ticketInfo.payment_status === 'confirmed'
                      ? (t('confirmed') || 'مؤكد') 
                      : (t('pending') || 'معلق')}
                  </span>
                </div>
                {ticketInfo.is_present && scanResult === 'error' && (
                  <div className="pt-3 mt-3 border-t-2 border-red-400">
                    <p className="text-red-700 dark:text-red-400 font-bold text-center text-lg">
                      ⚠️ {t('alreadyCheckedIn') || 'تم تسجيل الدخول مسبقاً'}
                    </p>
                  </div>
                )}
              </div>

              {/* Reset Button */}
              <div className="mt-6">
                <Button 
                  onClick={resetScanner} 
                  className="w-full"
                  variant={scanResult === 'success' ? 'default' : 'outline'}
                >
                  مسح تذكرة جديدة
                </Button>
              </div>
            </CardContent>
          </Card>
        )}

        {/* Instructions */}
        {!ticketInfo && (
          <Card className="bg-blue-50 dark:bg-blue-950/20 border-blue-200 dark:border-blue-800">
            <CardHeader>
              <CardTitle className="text-blue-900 dark:text-blue-400 text-lg">
                {t('instructions') || 'التعليمات'}
              </CardTitle>
            </CardHeader>
            <CardContent>
              <ul className="space-y-2 text-blue-800 dark:text-blue-300">
                <li>📷 {t('scanInstruction1') || 'وجه الكاميرا نحو رمز QR'}</li>
                <li>✨ {t('scanInstruction2') || 'تأكد من وضوح الرمز'}</li>
                <li>⚡ {t('scanInstruction3') || 'سيتم التحقق من التذكرة تلقائياً'}</li>
                <li>🔍 يمكنك استخدام البحث اليدوي إذا لم تعمل الكاميرا</li>
              </ul>
            </CardContent>
          </Card>
        )}
      </div>
    </div>
  );
};

export default QRScanner;
