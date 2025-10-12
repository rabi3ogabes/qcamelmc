import { useState, useEffect, useRef } from "react";
import { useNavigate } from "react-router-dom";
import { Html5Qrcode } from "html5-qrcode";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { ArrowLeft, CheckCircle2, XCircle, Loader2, Search, Camera, AlertCircle } from "lucide-react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";

interface TicketInfo {
  booking_reference: string;
  customer_name: string;
  event_title: string;
  ticket_type: string;
  ticket_holder_name?: string;
  ticket_holder_phone?: string;
  ticket_holder_nationality?: string;
  ticket_holder_id_number?: string;
  quantity: number;
  payment_status: string;
  is_present: boolean;
  confirmed_at?: string;
}

const QRScanner = () => {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const [scanning, setScanning] = useState(false);
  const [processing, setProcessing] = useState(false);
  const [ticketInfo, setTicketInfo] = useState<TicketInfo | null>(null);
  const [scanResult, setScanResult] = useState<'success' | 'error' | null>(null);
  const [manualSearch, setManualSearch] = useState("");
  const [showManualSearch, setShowManualSearch] = useState(false);
  const [cameraError, setCameraError] = useState<string | null>(null);
  const [cameraStarting, setCameraStarting] = useState(false);
  const scannerRef = useRef<Html5Qrcode | null>(null);
  const isScanning = useRef(false);

  useEffect(() => {
    checkAuth();
    return () => {
      stopScanner();
    };
  }, []);

  const stopScanner = async () => {
    if (scannerRef.current && isScanning.current) {
      try {
        await scannerRef.current.stop();
        console.log("Scanner stopped");
      } catch (error) {
        console.error("Error stopping scanner:", error);
      }
      isScanning.current = false;
    }
  };

  const checkAuth = async () => {
    const { data: { session } } = await supabase.auth.getSession();
    if (!session) {
      navigate("/admin/login");
    }
  };

  const startScanner = async () => {
    setCameraStarting(true);
    setCameraError(null);
    
    try {
      console.log("Starting camera...");
      
      // Check if browser supports camera
      if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
        throw new Error("المتصفح لا يدعم الكاميرا");
      }

      // Stop any existing scanner
      await stopScanner();

      // Create new scanner instance
      const scanner = new Html5Qrcode("qr-reader");
      scannerRef.current = scanner;

      // Get available cameras
      const cameras = await Html5Qrcode.getCameras();
      console.log("Available cameras:", cameras);

      if (!cameras || cameras.length === 0) {
        throw new Error("لم يتم العثور على كاميرا");
      }

      // Prefer back camera on mobile
      const backCamera = cameras.find(cam => 
        cam.label.toLowerCase().includes('back') || 
        cam.label.toLowerCase().includes('rear')
      ) || cameras[0];

      console.log("Using camera:", backCamera.label);

      // Start scanning
      await scanner.start(
        backCamera.id,
        {
          fps: 10,
          qrbox: { width: 250, height: 250 },
        },
        onScanSuccess,
        onScanError
      );

      isScanning.current = true;
      setScanning(true);
      setCameraStarting(false);
      console.log("Scanner started successfully");
      toast.success("تم تشغيل الكاميرا بنجاح");

    } catch (error: any) {
      console.error("Failed to start scanner:", error);
      setCameraStarting(false);
      
      let errorMessage = "فشل تشغيل الكاميرا";
      
      if (error.name === 'NotAllowedError') {
        errorMessage = "يرجى السماح بالوصول إلى الكاميرا";
      } else if (error.name === 'NotFoundError') {
        errorMessage = "لم يتم العثور على كاميرا";
      } else if (error.name === 'NotReadableError') {
        errorMessage = "الكاميرا قيد الاستخدام من تطبيق آخر";
      } else if (error.message) {
        errorMessage = error.message;
      }
      
      setCameraError(errorMessage);
      toast.error(errorMessage);
    }
  };

  const processTicket = async (bookingRef: string) => {
    setProcessing(true);
    setScanning(false);

    try {
      // First, just fetch ticket info without confirming
      const { data: orderData, error: orderError } = await supabase
        .from('ticket_holders')
        .select(`
          id,
          name,
          phone,
          nationality,
          ticket_type,
          qr_code,
          is_present,
          confirmed_at,
          id_number,
          orders!inner (
            booking_reference,
            payment_status,
            quantity,
            customers!inner (name),
            events!inner (title)
          )
        `)
        .eq('qr_code', bookingRef)
        .single();

      if (orderError || !orderData) {
        setScanResult('error');
        setTicketInfo({
          booking_reference: bookingRef,
          customer_name: "غير موجود",
          event_title: "-",
          ticket_type: "-",
          quantity: 0,
          payment_status: "غير مؤكد",
          is_present: false,
        });
        toast.error('تذكرة غير موجودة');
        return;
      }

      const order: any = orderData.orders;
      
      setTicketInfo({
        booking_reference: order.booking_reference,
        customer_name: order.customers.name,
        event_title: order.events.title,
        ticket_type: orderData.ticket_type,
        ticket_holder_name: orderData.name,
        ticket_holder_phone: orderData.phone,
        ticket_holder_nationality: orderData.nationality,
        ticket_holder_id_number: orderData.id_number,
        quantity: 1,
        payment_status: order.payment_status,
        is_present: orderData.is_present,
        confirmed_at: orderData.confirmed_at,
      });

      if (orderData.is_present) {
        setScanResult('error');
        toast.error('تم استخدام التذكرة مسبقاً');
      } else if (order.payment_status !== 'confirmed') {
        setScanResult('success');
        toast.warning('⚠️ الدفع غير مؤكد');
      } else {
        setScanResult('success');
        toast.success('معلومات التذكرة - جاهز للتأكيد');
      }
    } catch (error) {
      console.error("Error validating ticket:", error);
      setScanResult('error');
      setTicketInfo({
        booking_reference: bookingRef,
        customer_name: "خطأ",
        event_title: "-",
        ticket_type: "-",
        quantity: 0,
        payment_status: "خطأ",
        is_present: false,
      });
      toast.error(t('validationError') || "خطأ في التحقق من التذكرة");
    } finally {
      setProcessing(false);
    }
  };

  const handleConfirmPresence = async () => {
    if (!ticketInfo) return;
    
    setProcessing(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      
      const { data, error } = await supabase.functions.invoke('ticket-checkin', {
        body: { 
          booking_reference: ticketInfo.booking_reference + '-TKT01',
          admin_id: user?.id 
        },
      });

      if (error) throw error;

      const response = data as { success: boolean; message: string; ticket_info?: any; };

      if (!response.success) {
        toast.error(response.message || 'فشل تأكيد الحضور');
        return;
      }

      setTicketInfo(response.ticket_info);
      setScanResult('success');
      toast.success(response.message || '✅ تم تأكيد الحضور بنجاح');
    } catch (err: any) {
      console.error('Confirmation error:', err);
      toast.error(err.message || 'حدث خطأ أثناء تأكيد الحضور');
    } finally {
      setProcessing(false);
    }
  };

  const onScanSuccess = async (decodedText: string) => {
    if (processing) return;
    console.log("QR Code scanned:", decodedText);
    
    // Stop scanner while processing
    await stopScanner();
    setScanning(false);
    
    await processTicket(decodedText);
  };

  const onScanError = (error: any) => {
    // Ignore scan errors (they happen frequently during scanning)
    // Don't log to avoid console spam
  };

  const resetScanner = async () => {
    setTicketInfo(null);
    setScanResult(null);
    setProcessing(false);
    setManualSearch("");
    setCameraError(null);
    
    // Restart scanner
    await startScanner();
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
            {/* Camera Controls */}
            {!scanning && !ticketInfo && (
              <div className="flex flex-col items-center gap-3">
                {cameraError && (
                  <div className="flex items-center gap-2 text-destructive text-sm bg-destructive/10 p-3 rounded-lg w-full">
                    <AlertCircle className="w-4 h-4 shrink-0" />
                    <span>{cameraError}</span>
                  </div>
                )}
                <Button
                  onClick={startScanner}
                  disabled={cameraStarting}
                  className="w-full max-w-xs"
                  size="lg"
                >
                  {cameraStarting ? (
                    <>
                      <Loader2 className="w-5 h-5 ml-2 animate-spin" />
                      جاري تشغيل الكاميرا...
                    </>
                  ) : (
                    <>
                      <Camera className="w-5 h-5 ml-2" />
                      تشغيل الكاميرا
                    </>
                  )}
                </Button>
              </div>
            )}

            {/* Scanner Status */}
            {scanning && !ticketInfo && (
              <div className="text-center space-y-2">
                <div className="flex items-center justify-center gap-2 text-green-600 dark:text-green-400">
                  <div className="w-2 h-2 bg-green-600 dark:bg-green-400 rounded-full animate-pulse"></div>
                  <span className="font-semibold">الكاميرا تعمل - جاهز للمسح</span>
                </div>
              </div>
            )}

            {/* Manual Search Toggle */}
            <div className="flex justify-center gap-2 pt-2">
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

            {/* QR Scanner Container */}
            <div 
              id="qr-reader" 
              className="w-full min-h-[300px] rounded-lg overflow-hidden bg-muted/30"
            ></div>
            
            {processing && (
              <div className="flex items-center justify-center gap-2 mt-4">
                <Loader2 className="w-6 h-6 animate-spin" />
                <span>{t('processing') || 'جاري المعالجة...'}</span>
              </div>
            )}

            {!scanning && !ticketInfo && !cameraStarting && (
              <div className="text-center space-y-2 text-sm text-muted-foreground">
                <p>اضغط على زر "تشغيل الكاميرا" للبدء</p>
                <p className="text-xs">أو استخدم البحث اليدوي</p>
              </div>
            )}

            {scanning && (
              <div className="text-center space-y-2 text-sm text-muted-foreground">
                <p>وجه الكاميرا نحو QR Code للمسح التلقائي</p>
                <p className="text-xs">يعمل على الجوال والكمبيوتر 📱💻</p>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Result Display */}
        {ticketInfo && (
          <Card className={`mb-6 border-2 ${
            scanResult === 'success' && ticketInfo.payment_status === 'confirmed'
              ? 'border-green-500 bg-green-50 dark:bg-green-950/20' 
              : scanResult === 'success' && ticketInfo.payment_status !== 'confirmed'
              ? 'border-yellow-500 bg-yellow-50 dark:bg-yellow-950/20'
              : 'border-red-500 bg-red-50 dark:bg-red-950/20'
          }`}>
            <CardHeader>
              <CardTitle className={`flex items-center justify-center gap-3 text-2xl ${
                scanResult === 'success' && ticketInfo.payment_status === 'confirmed'
                  ? 'text-green-700 dark:text-green-400' 
                  : scanResult === 'success' && ticketInfo.payment_status !== 'confirmed'
                  ? 'text-yellow-700 dark:text-yellow-400'
                  : 'text-red-700 dark:text-red-400'
              }`}>
                {scanResult === 'success' && ticketInfo.payment_status === 'confirmed' ? (
                  <>
                    <CheckCircle2 className="w-8 h-8" />
                    ✅ تم التحقق من التذكرة
                  </>
                ) : scanResult === 'success' && ticketInfo.payment_status !== 'confirmed' ? (
                  <>
                    <CheckCircle2 className="w-8 h-8" />
                    ⚠️ معلومات التذكرة (الدفع معلق)
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
                
                {ticketInfo.ticket_holder_name && (
                  <div className="flex justify-between items-center py-2 border-b">
                    <span className="font-semibold">اسم حامل التذكرة:</span>
                    <span className="font-bold text-lg">{ticketInfo.ticket_holder_name}</span>
                  </div>
                )}
                
                {ticketInfo.ticket_holder_phone && (
                  <div className="flex justify-between items-center py-2 border-b">
                    <span className="font-semibold">رقم الهاتف:</span>
                    <span className="font-mono">{ticketInfo.ticket_holder_phone}</span>
                  </div>
                )}
                
                {ticketInfo.ticket_holder_nationality && (
                  <div className="flex justify-between items-center py-2 border-b">
                    <span className="font-semibold">الجنسية:</span>
                    <span>{ticketInfo.ticket_holder_nationality}</span>
                  </div>
                )}
                
                {ticketInfo.ticket_holder_id_number && (
                  <div className="flex justify-between items-center py-2 border-b">
                    <span className="font-semibold">رقم الهوية:</span>
                    <span className="font-mono">{ticketInfo.ticket_holder_id_number}</span>
                  </div>
                )}
                
                <div className="flex justify-between items-center py-2 border-b">
                  <span className="font-semibold">{t('customerName') || 'اسم العميل'}:</span>
                  <span>{ticketInfo.customer_name}</span>
                </div>
                
                {/* Confirm Presence Button */}
                {!ticketInfo.is_present && ticketInfo.payment_status === 'confirmed' && (
                  <div className="pt-4">
                    <Button 
                      onClick={handleConfirmPresence}
                      disabled={processing}
                      className="w-full bg-green-600 hover:bg-green-700 text-white"
                      size="lg"
                    >
                      {processing ? (
                        <>
                          <Loader2 className="w-5 h-5 ml-2 animate-spin" />
                          جاري التأكيد...
                        </>
                      ) : (
                        <>
                          <CheckCircle2 className="w-5 h-5 ml-2" />
                          ✓ تأكيد الحضور
                        </>
                      )}
                    </Button>
                  </div>
                )}
                <div className="flex justify-between items-center py-2 border-b">
                  <span className="font-semibold">اسم الحدث:</span>
                  <span>{ticketInfo.event_title}</span>
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
                
                {ticketInfo.payment_status !== 'confirmed' && (
                  <div className="pt-3 mt-3 border-t-2 border-yellow-400 bg-yellow-100 dark:bg-yellow-900/30 p-4 rounded-lg">
                    <p className="text-yellow-800 dark:text-yellow-300 font-bold text-center text-lg">
                      ⚠️ تحذير: الدفع غير مؤكد - لا يمكن تسجيل الدخول
                    </p>
                    <p className="text-yellow-700 dark:text-yellow-400 text-center text-sm mt-2">
                      يرجى تأكيد الدفع قبل السماح بالدخول
                    </p>
                  </div>
                )}
                
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
                  disabled={cameraStarting}
                >
                  {cameraStarting ? (
                    <>
                      <Loader2 className="w-4 h-4 ml-2 animate-spin" />
                      جاري التحميل...
                    </>
                  ) : (
                    "مسح تذكرة جديدة"
                  )}
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
