import { useState, useEffect, useRef } from "react";
import { useNavigate } from "react-router-dom";
import { Html5Qrcode } from "html5-qrcode";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import { ArrowLeft, CheckCircle2, XCircle, Loader2, Search, Camera, AlertCircle, LogOut } from "lucide-react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";

interface TicketHolder {
  id: string;
  qr_code: string;
  name: string;
  phone: string;
  nationality: string;
  ticket_type: string;
  id_number: string;
  is_present: boolean;
  confirmed_at?: string;
}

interface TicketInfo {
  booking_reference: string;
  customer_name: string;
  event_title: string;
  ticket_type: string;
  ticket_holder_name?: string;
  ticket_holder_phone?: string;
  ticket_holder_nationality?: string;
  ticket_holder_id_number?: string;
  ticket_holder_qr_code?: string;
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
  const [availableTickets, setAvailableTickets] = useState<TicketHolder[]>([]);
  const [selectedTicketIds, setSelectedTicketIds] = useState<string[]>([]);
  const [scanMode, setScanMode] = useState<'confirm' | 'unconfirm'>('confirm');
  const [logoUrl, setLogoUrl] = useState<string | null>(null);
  const [headerBgColor, setHeaderBgColor] = useState<string>("hsl(var(--card) / 0.5)");
  const scannerRef = useRef<Html5Qrcode | null>(null);
  const isScanning = useRef(false);

  useEffect(() => {
    checkAuth();
    fetchSettings();
    return () => {
      stopScanner();
    };
  }, []);

  // Update ticket info when a specific ticket is selected from the list
  useEffect(() => {
    if (selectedTicketIds.length === 1 && availableTickets.length > 0) {
      const selectedTicket: any = availableTickets.find(t => t.id === selectedTicketIds[0]);
      if (selectedTicket) {
        const order = selectedTicket.orders;
        const isPOSOrder = order.booking_reference?.startsWith('POS-') || order.payment_method === 'cash_pos';
        const effectivePaymentStatus = isPOSOrder ? 'confirmed' : order.payment_status;
        
        setTicketInfo({
          booking_reference: order.booking_reference,
          customer_name: order.customers.name,
          event_title: order.events.title,
          ticket_type: selectedTicket.ticket_type,
          ticket_holder_name: selectedTicket.name,
          ticket_holder_phone: selectedTicket.phone,
          ticket_holder_nationality: selectedTicket.nationality,
          ticket_holder_id_number: selectedTicket.id_number,
          ticket_holder_qr_code: selectedTicket.qr_code,
          quantity: 1,
          payment_status: effectivePaymentStatus,
          is_present: selectedTicket.is_present,
          confirmed_at: selectedTicket.confirmed_at,
        });
        
        if (selectedTicket.is_present) {
          toast.info('هذه التذكرة تم تسجيل حضورها مسبقاً');
        }
      }
    }
  }, [selectedTicketIds, availableTickets]);

  const fetchSettings = async () => {
    const { data, error } = await supabase
      .from("settings")
      .select("logo_url, header_bg_color")
      .maybeSingle();

    if (error) {
      console.error("Error fetching settings:", error);
      return;
    }

    if (data?.logo_url) {
      setLogoUrl(data.logo_url);
    }
    
    if (data?.header_bg_color) {
      setHeaderBgColor(data.header_bg_color);
    }
  };

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

  const handleLogout = async () => {
    await supabase.auth.signOut();
    navigate("/admin/login");
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

  const processTicket = async (scannedCode: string) => {
    setProcessing(true);
    setScanning(false);
    setAvailableTickets([]);
    setSelectedTicketIds([]);

    try {
      // Check if it's a phone number (contains only digits, +, spaces, or hyphens)
      const isPhoneNumber = /^[\d\s+\-()]+$/.test(scannedCode);
      
      // Check if it's a specific ticket code (contains -TKT) or just booking reference
      const isSpecificTicket = scannedCode.includes('-TKT');
      
      if (isPhoneNumber) {
        // Search by phone number in ticket_holders
        const cleanPhone = scannedCode.replace(/[\s\-()]/g, ''); // Remove spaces, hyphens, parentheses
        
        const { data: ticketsData, error: ticketsError } = await supabase
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
            order_id,
            orders!inner (
              id,
              booking_reference,
              payment_status,
              payment_method,
              quantity,
              customers!inner (name),
              events!inner (title, event_date)
            )
          `)
          .or(`phone.ilike.%${cleanPhone}%,phone.ilike.%${scannedCode}%`)
          .order('created_at', { ascending: false });

        if (ticketsError || !ticketsData || ticketsData.length === 0) {
          setScanResult('error');
          setTicketInfo({
            booking_reference: scannedCode,
            customer_name: "غير موجود",
            event_title: "-",
            ticket_type: "-",
            quantity: 0,
            payment_status: "غير مؤكد",
            is_present: false,
          });
          toast.error('لا توجد تذاكر لهذا الرقم');
          setProcessing(false);
          return;
        }

        // Group tickets by order
        const orderGroups = new Map();
        ticketsData.forEach(ticket => {
          const orderId = ticket.order_id;
          if (!orderGroups.has(orderId)) {
            orderGroups.set(orderId, []);
          }
          orderGroups.get(orderId).push(ticket);
        });

        // If multiple orders, show all tickets to choose from
        if (orderGroups.size > 1 || ticketsData.length > 1) {
          setAvailableTickets(ticketsData);
          const firstTicket = ticketsData[0];
          const order: any = firstTicket.orders;
          
          const isPOSOrder = order.booking_reference?.startsWith('POS-') || order.payment_method === 'cash_pos';
          const effectivePaymentStatus = isPOSOrder ? 'confirmed' : order.payment_status;
          
          setTicketInfo({
            booking_reference: `${ticketsData.length} تذكرة`,
            customer_name: order.customers.name,
            event_title: order.events.title,
            ticket_type: firstTicket.ticket_type,
            quantity: ticketsData.length,
            payment_status: effectivePaymentStatus,
            is_present: false,
          });
          setScanResult('success');
          toast.info(`تم العثور على ${ticketsData.length} تذكرة لهذا الرقم - اختر التذكرة المراد تأكيدها`);
        } else {
          // Single ticket found - auto-select it
          const ticket = ticketsData[0];
          const order: any = ticket.orders;
          
          const isPOSOrder = order.booking_reference?.startsWith('POS-') || order.payment_method === 'cash_pos';
          const effectivePaymentStatus = isPOSOrder ? 'confirmed' : order.payment_status;
          
          // Set as available ticket and auto-select it if not already present
          setAvailableTickets([ticket]);
          if (!ticket.is_present && scanMode === 'confirm') {
            setSelectedTicketIds([ticket.id]);
          } else if (ticket.is_present && scanMode === 'unconfirm') {
            setSelectedTicketIds([ticket.id]);
          }
          
          setTicketInfo({
            booking_reference: order.booking_reference,
            customer_name: order.customers.name,
            event_title: order.events.title,
            ticket_type: ticket.ticket_type,
            ticket_holder_name: ticket.name,
            ticket_holder_phone: ticket.phone,
            ticket_holder_nationality: ticket.nationality,
            ticket_holder_id_number: ticket.id_number,
            ticket_holder_qr_code: ticket.qr_code,
            quantity: 1,
            payment_status: effectivePaymentStatus,
            is_present: ticket.is_present,
            confirmed_at: ticket.confirmed_at,
          });

          if (ticket.is_present) {
            setScanResult('error');
            toast.error('تم استخدام التذكرة مسبقاً');
          } else if (effectivePaymentStatus !== 'confirmed') {
            setScanResult('success');
            toast.warning('⚠️ الدفع غير مؤكد');
          } else {
            setScanResult('success');
            toast.success('معلومات التذكرة - جاهز للتأكيد');
          }
        }
      } else if (isSpecificTicket) {
        // Process specific ticket
        // First try exact match
        let { data: orderData, error: orderError } = await supabase
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
              payment_method,
              quantity,
              customers!inner (name),
              events!inner (title)
            )
          `)
          .eq('qr_code', scannedCode)
          .maybeSingle();

        // If not found, try searching by QR code that contains the scanned code (handles URL vs plain code mismatch)
        if (!orderData) {
          const { data: ticketsData, error: ticketsError } = await supabase
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
                payment_method,
                quantity,
                customers!inner (name),
                events!inner (title)
              )
            `)
            .ilike('qr_code', `%${scannedCode}%`);

          if (ticketsData && ticketsData.length > 0) {
            orderData = ticketsData[0];
            orderError = ticketsError;
          }
        }

        if (orderError || !orderData) {
          setScanResult('error');
          setTicketInfo({
            booking_reference: scannedCode,
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
        
        console.log('=== Specific Ticket Scan Debug ===');
        console.log('Scanned code:', scannedCode);
        console.log('Order data:', orderData);
        console.log('Payment status from order:', order.payment_status);
        console.log('Payment method:', order.payment_method);
        console.log('Booking reference:', order.booking_reference);
        console.log('Is ticket present:', orderData.is_present);
        
        // Force confirmed status for POS orders
        const isPOSOrder = order.booking_reference?.startsWith('POS-') || order.payment_method === 'cash_pos';
        const effectivePaymentStatus = isPOSOrder ? 'confirmed' : order.payment_status;
        
        console.log('Is POS order:', isPOSOrder);
        console.log('Effective payment status:', effectivePaymentStatus);
        console.log('=== End Debug ===');
        
        setTicketInfo({
          booking_reference: order.booking_reference,
          customer_name: order.customers.name,
          event_title: order.events.title,
          ticket_type: orderData.ticket_type,
          ticket_holder_name: orderData.name,
          ticket_holder_phone: orderData.phone,
          ticket_holder_nationality: orderData.nationality,
          ticket_holder_id_number: orderData.id_number,
          ticket_holder_qr_code: orderData.qr_code,
          quantity: 1,
          payment_status: effectivePaymentStatus,
          is_present: orderData.is_present,
          confirmed_at: orderData.confirmed_at,
        });

        if (orderData.is_present) {
          setScanResult('error');
          toast.error('تم استخدام التذكرة مسبقاً');
        } else if (effectivePaymentStatus !== 'confirmed') {
          setScanResult('success');
          toast.warning('⚠️ الدفع غير مؤكد');
        } else {
          setScanResult('success');
          toast.success('معلومات التذكرة - جاهز للتأكيد');
        }
      } else {
        // It's a booking reference - fetch all tickets for this booking
        const { data: orderData, error: orderError } = await supabase
          .from('orders')
          .select(`
            id,
            booking_reference,
            payment_status,
            payment_method,
            quantity,
            customers!inner (name),
            events!inner (title)
          `)
          .eq('booking_reference', scannedCode)
          .single();

        if (orderError || !orderData) {
          setScanResult('error');
          setTicketInfo({
            booking_reference: scannedCode,
            customer_name: "غير موجود",
            event_title: "-",
            ticket_type: "-",
            quantity: 0,
            payment_status: "غير مؤكد",
            is_present: false,
          });
          toast.error('حجز غير موجود');
          return;
        }

        console.log('=== Booking Reference Scan Debug ===');
        console.log('Scanned booking:', scannedCode);
        console.log('Order payment status:', orderData.payment_status);
        console.log('Order payment method:', orderData.payment_method);
        
        // Fetch all tickets for this order
        const { data: ticketsData, error: ticketsError } = await supabase
          .from('ticket_holders')
          .select('*')
          .eq('order_id', orderData.id)
          .order('qr_code');

        if (ticketsError || !ticketsData || ticketsData.length === 0) {
          setScanResult('error');
          toast.error('لا توجد تذاكر لهذا الحجز');
          return;
        }

        // Force confirmed status for POS orders
        const isPOSBooking = orderData.booking_reference?.startsWith('POS-');
        const effectiveBookingPaymentStatus = isPOSBooking ? 'confirmed' : orderData.payment_status;
        
        console.log('Booking reference scan - Is POS:', isPOSBooking);
        console.log('Booking reference scan - Effective status:', effectiveBookingPaymentStatus);
        
        setAvailableTickets(ticketsData);
        
        // Auto-select single ticket or all unpresent/present tickets based on mode
        if (ticketsData.length === 1) {
          const ticket = ticketsData[0];
          if ((!ticket.is_present && scanMode === 'confirm') || (ticket.is_present && scanMode === 'unconfirm')) {
            setSelectedTicketIds([ticket.id]);
          }
        }
        
        setTicketInfo({
          booking_reference: orderData.booking_reference,
          customer_name: orderData.customers.name,
          event_title: orderData.events.title,
          ticket_type: ticketsData[0].ticket_type,
          quantity: ticketsData.length,
          payment_status: effectiveBookingPaymentStatus,
          is_present: false,
        });
        setScanResult('success');
        
        if (ticketsData.length === 1) {
          toast.success('تم العثور على التذكرة - جاهز للتأكيد');
        } else {
          toast.info(`تم العثور على ${ticketsData.length} تذكرة - اختر التذكرة المراد تأكيدها`);
        }
      }
    } catch (error) {
      console.error("Error validating ticket:", error);
      setScanResult('error');
      setTicketInfo({
        booking_reference: scannedCode,
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
    
    // If we have multiple tickets available, user must select at least one
    if (availableTickets.length > 0 && selectedTicketIds.length === 0) {
      toast.error('الرجاء اختيار التذاكر المراد تأكيدها');
      return;
    }
    
    setProcessing(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      
      // Get selected tickets
      const selectedTickets = selectedTicketIds.length > 0
        ? availableTickets.filter(t => selectedTicketIds.includes(t.id))
        : [];
      
      if (selectedTickets.length === 0) {
        toast.error('خطأ: لم يتم العثور على تذاكر');
        return;
      }
      
      // Use the actual QR codes from the database
      const qrCodes = selectedTickets.map(ticket => ticket.qr_code);

      let successCount = 0;
      let errorCount = 0;

      // Process each ticket
      for (const qrCode of qrCodes) {
        try {
          const { data, error } = await supabase.functions.invoke('ticket-checkin', {
            body: { 
              booking_reference: qrCode,
              admin_id: user?.id 
            },
          });

          if (error) throw error;

          const response = data as { success: boolean; message: string; ticket_info?: any; };

          if (response.success) {
            successCount++;
          } else {
            errorCount++;
          }
        } catch (err) {
          console.error('Error confirming ticket:', qrCode, err);
          errorCount++;
        }
      }

      // Show results
      if (successCount > 0) {
        toast.success(`✅ تم تأكيد ${successCount} تذكرة بنجاح`);
      }
      if (errorCount > 0) {
        toast.error(`⚠️ فشل تأكيد ${errorCount} تذكرة`);
      }

      // Clear selections and refresh
      setAvailableTickets([]);
      setSelectedTicketIds([]);
      setTicketInfo(null);
      setScanResult(null);
    } catch (err: any) {
      console.error('Confirmation error:', err);
      toast.error(err.message || 'حدث خطأ أثناء تأكيد الحضور');
    } finally {
      setProcessing(false);
    }
  };

  const handleUnconfirmPresence = async () => {
    if (!ticketInfo) return;
    
    // If we have multiple tickets available, user must select at least one
    if (availableTickets.length > 0 && selectedTicketIds.length === 0) {
      toast.error('الرجاء اختيار التذاكر المراد إلغاء تأكيدها');
      return;
    }
    
    setProcessing(true);
    try {
      // Get QR codes for selected tickets
      const qrCodes = selectedTicketIds.length > 0
        ? availableTickets.filter(t => selectedTicketIds.includes(t.id)).map(t => t.qr_code)
        : ticketInfo.ticket_holder_qr_code ? [ticketInfo.ticket_holder_qr_code] : [];
      
      if (qrCodes.length === 0) {
        toast.error('خطأ: لم يتم العثور على رموز QR');
        return;
      }

      let successCount = 0;
      let errorCount = 0;

      // Process each ticket
      for (const qrCode of qrCodes) {
        try {
          const { error } = await supabase
            .from('ticket_holders')
            .update({ 
              is_present: false,
              confirmed_at: null,
              confirmed_by: null
            })
            .eq('qr_code', qrCode);

          if (error) throw error;
          successCount++;
        } catch (err) {
          console.error('Error unconfirming ticket:', qrCode, err);
          errorCount++;
        }
      }

      // Show results
      if (successCount > 0) {
        toast.success(`✅ تم إلغاء تأكيد ${successCount} تذكرة بنجاح`);
      }
      if (errorCount > 0) {
        toast.error(`⚠️ فشل إلغاء تأكيد ${errorCount} تذكرة`);
      }

      // Clear selections and refresh
      setAvailableTickets([]);
      setSelectedTicketIds([]);
      setTicketInfo(null);
      setScanResult(null);
    } catch (err: any) {
      console.error('Unconfirmation error:', err);
      toast.error(err.message || 'حدث خطأ أثناء إلغاء تأكيد الحضور');
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
    setAvailableTickets([]);
    setSelectedTicketIds([]);
    
    // Restart scanner
    await startScanner();
  };

  const toggleTicketSelection = (ticketId: string) => {
    setSelectedTicketIds(prev => 
      prev.includes(ticketId) 
        ? prev.filter(id => id !== ticketId)
        : [...prev, ticketId]
    );
  };

  const toggleSelectAll = () => {
    // In confirm mode, select non-present tickets. In unconfirm mode, select present tickets
    const selectableTickets = scanMode === 'confirm' 
      ? availableTickets.filter(t => !t.is_present)
      : availableTickets.filter(t => t.is_present);
    
    if (selectedTicketIds.length === selectableTickets.length && selectableTickets.length > 0) {
      setSelectedTicketIds([]);
    } else {
      setSelectedTicketIds(selectableTickets.map(t => t.id));
    }
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
    <div className="min-h-screen bg-background font-lusail" dir="rtl">
      {/* Header */}
      <header className="border-b backdrop-blur-sm sticky top-0 z-10" style={{ backgroundColor: headerBgColor }}>
        <div className="container mx-auto px-3 sm:px-4 py-3 sm:py-4 flex justify-between items-center gap-2">
          <button onClick={() => navigate("/admin/dashboard")} className="focus:outline-none hover:opacity-80 transition-opacity">
            {logoUrl ? (
              <img src={logoUrl} alt="Logo" className="h-10 sm:h-12 object-contain" />
            ) : (
              <h1 className="text-xl sm:text-2xl font-bold">{t('scanTicket') || 'مسح التذكرة'}</h1>
            )}
          </button>
          <Button variant="outline" onClick={handleLogout} size="sm" className="sm:size-default">
            <LogOut className="w-4 h-4 ml-2" />
            <span className="hidden sm:inline">{t("logout")}</span>
          </Button>
        </div>
      </header>

      <div className="max-w-4xl mx-auto py-3 sm:py-6 lg:py-8 px-3 sm:px-4 lg:px-6">
        {/* Mode Toggle Buttons */}
        <div className="flex justify-center gap-2 sm:gap-3 lg:gap-4 mb-4 sm:mb-6">
          <Button
            variant={scanMode === 'confirm' ? 'default' : 'secondary'}
            onClick={() => setScanMode('confirm')}
            size="sm"
            className="flex-1 sm:flex-none sm:min-w-[160px] lg:min-w-[200px] text-xs sm:text-sm lg:text-base"
          >
            <CheckCircle2 className="w-3 h-3 sm:w-4 sm:h-4 lg:w-5 lg:h-5 ml-1 sm:ml-2" />
            <span>تأكيد الحضور</span>
          </Button>
          <Button
            variant={scanMode === 'unconfirm' ? 'destructive' : 'secondary'}
            onClick={() => setScanMode('unconfirm')}
            size="sm"
            className="flex-1 sm:flex-none sm:min-w-[160px] lg:min-w-[200px] text-xs sm:text-sm lg:text-base"
          >
            <XCircle className="w-3 h-3 sm:w-4 sm:h-4 lg:w-5 lg:h-5 ml-1 sm:ml-2" />
            <span>إلغاء التأكيد</span>
          </Button>
        </div>

        {/* Scanner */}
        <Card className="mb-4 sm:mb-6">
          <CardHeader>
            <CardTitle className="text-center text-lg sm:text-xl">{t('scanTicket') || 'مسح التذكرة'}</CardTitle>
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
                className="text-xs sm:text-sm"
              >
                <Search className="w-4 h-4 ml-2" />
                {showManualSearch ? "إخفاء البحث اليدوي" : "بحث يدوي"}
              </Button>
            </div>

            {/* Manual Search Input */}
            {showManualSearch && (
              <form onSubmit={handleManualSearch} className="space-y-3">
                <Input
                  type="tel"
                  inputMode="numeric"
                  pattern="[0-9]*"
                  placeholder="أدخل رقم الحجز أو رقم الهاتف"
                  value={manualSearch}
                  onChange={(e) => setManualSearch(e.target.value.replace(/\D/g, ''))}
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
              className="w-full min-h-[200px] sm:min-h-[280px] md:min-h-[320px] lg:min-h-[360px] rounded-lg overflow-hidden bg-muted/30"
            ></div>
            
            {processing && (
              <div className="flex items-center justify-center gap-2 mt-4 text-sm sm:text-base">
                <Loader2 className="w-5 h-5 sm:w-6 sm:h-6 animate-spin" />
                <span>{t('processing') || 'جاري المعالجة...'}</span>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Result Display */}
        {ticketInfo && (
          <Card className={`mb-4 sm:mb-6 border-2 ${
            scanResult === 'success' && ticketInfo.payment_status === 'confirmed'
              ? 'border-green-500 bg-green-50 dark:bg-green-950/20' 
              : scanResult === 'success' && ticketInfo.payment_status !== 'confirmed'
              ? 'border-yellow-500 bg-yellow-50 dark:bg-yellow-950/20'
              : 'border-red-500 bg-red-50 dark:bg-red-950/20'
          }`}>
            <CardHeader>
              <CardTitle className={`flex items-center justify-center gap-2 sm:gap-3 text-lg sm:text-2xl ${
                scanResult === 'success' && ticketInfo.payment_status === 'confirmed'
                  ? 'text-green-700 dark:text-green-400' 
                  : scanResult === 'success' && ticketInfo.payment_status !== 'confirmed'
                  ? 'text-yellow-700 dark:text-yellow-400'
                  : 'text-red-700 dark:text-red-400'
              }`}>
                {scanResult === 'success' && ticketInfo.payment_status === 'confirmed' ? (
                  <>
                    <CheckCircle2 className="w-6 h-6 sm:w-8 sm:h-8" />
                    <span className="text-base sm:text-2xl">✅ تم التحقق من التذكرة</span>
                  </>
                ) : scanResult === 'success' && ticketInfo.payment_status !== 'confirmed' ? (
                  <>
                    <CheckCircle2 className="w-6 h-6 sm:w-8 sm:h-8" />
                    <span className="text-base sm:text-2xl">⚠️ معلومات التذكرة (الدفع معلق)</span>
                  </>
                ) : (
                  <>
                    <XCircle className="w-6 h-6 sm:w-8 sm:h-8" />
                    <span className="text-base sm:text-2xl">❌ تذكرة غير صالحة</span>
                  </>
                )}
              </CardTitle>
            </CardHeader>
            <CardContent>
              {/* Ticket Selection for Booking Reference */}
              {availableTickets.length > 0 && (
                <div className="mb-4 sm:mb-6 p-3 sm:p-4 bg-blue-50 dark:bg-blue-950/20 rounded-lg border-2 border-blue-300">
                  <div className="flex flex-col sm:flex-row sm:justify-between sm:items-center gap-2 mb-3">
                    <h3 className="font-bold text-sm sm:text-base lg:text-lg text-blue-900 dark:text-blue-100">
                      {scanMode === 'confirm' 
                        ? `اختر التذاكر (${availableTickets.filter(t => !t.is_present).length} متاحة):`
                        : `اختر التذاكر (${availableTickets.filter(t => t.is_present).length} حاضرة):`
                      }
                    </h3>
                    <div className="flex items-center gap-2">
                      <Checkbox
                        id="select-all"
                        checked={
                          scanMode === 'confirm'
                            ? selectedTicketIds.length === availableTickets.filter(t => !t.is_present).length && selectedTicketIds.length > 0
                            : selectedTicketIds.length === availableTickets.filter(t => t.is_present).length && selectedTicketIds.length > 0
                        }
                        onCheckedChange={toggleSelectAll}
                      />
                      <label htmlFor="select-all" className="text-sm cursor-pointer">
                        اختيار الكل
                      </label>
                    </div>
                  </div>
                  <div className="space-y-2">
                    {availableTickets.map((ticket, index) => {
                      const bookingReference = (ticket as any).orders?.booking_reference || '';
                      
                      // Calculate ticket position within the same booking reference
                      const ticketsWithSameBooking = availableTickets.filter(
                        t => (t as any).orders?.booking_reference === bookingReference
                      );
                      const totalTicketsForBooking = ticketsWithSameBooking.length;
                      const ticketPosition = ticketsWithSameBooking.findIndex(t => t.id === ticket.id) + 1;
                      
                      return (
                        <div
                          key={ticket.id}
                          onClick={() => {
                            // In confirm mode, only allow selecting non-present tickets
                            // In unconfirm mode, only allow selecting present tickets
                            const isSelectable = scanMode === 'confirm' ? !ticket.is_present : ticket.is_present;
                            if (isSelectable) {
                              toggleTicketSelection(ticket.id);
                            }
                          }}
                          className={`w-full p-2 sm:p-3 rounded-lg border-2 text-right transition-all cursor-pointer ${
                            selectedTicketIds.includes(ticket.id)
                              ? 'border-primary bg-primary/10 shadow-md'
                              : 'border-border bg-card hover:border-primary/50'
                          } ${
                            (scanMode === 'confirm' && ticket.is_present) || (scanMode === 'unconfirm' && !ticket.is_present)
                              ? 'opacity-50 cursor-not-allowed'
                              : ''
                          }`}
                        >
                           <div className="flex flex-col sm:flex-row justify-between items-start gap-2 sm:gap-3">
                            <div className="flex items-start gap-2 sm:gap-3 flex-1 w-full sm:w-auto">
                              <Checkbox
                                id={`ticket-${ticket.id}`}
                                checked={selectedTicketIds.includes(ticket.id)}
                                onCheckedChange={() => toggleTicketSelection(ticket.id)}
                                disabled={
                                  scanMode === 'confirm' ? ticket.is_present : !ticket.is_present
                                }
                                onClick={(e) => e.stopPropagation()}
                                className="mt-1"
                              />
                              <div className="flex-1 min-w-0">
                                <div className="flex flex-wrap items-center gap-2 mb-1.5">
                                  <span className="bg-primary text-primary-foreground text-xs font-bold px-1.5 sm:px-2 py-0.5 sm:py-1 rounded whitespace-nowrap">
                                    {ticketPosition}/{totalTicketsForBooking}
                                  </span>
                                  <div className="font-bold text-sm sm:text-base lg:text-lg truncate flex-1 min-w-0">{ticket.name}</div>
                                </div>
                                {bookingReference && (
                                  <div className="text-xs sm:text-sm mt-1.5 bg-muted/50 p-1.5 sm:p-2 rounded">
                                    <span className="font-semibold">الرقم المرجعي:</span>
                                    <div className="font-mono text-[10px] sm:text-xs break-all mt-0.5">{bookingReference}</div>
                                  </div>
                                )}
                                <div className="text-xs sm:text-sm mt-1 break-words">
                                  <span className="font-semibold">الهاتف:</span> <span className="font-mono">{ticket.phone}</span>
                                </div>
                                <div className="text-xs sm:text-sm mt-0.5">
                                  <span className="font-semibold">النوع:</span> <span className="uppercase font-medium">{ticket.ticket_type}</span>
                                </div>
                              </div>
                            </div>
                            <div className="flex-shrink-0 self-start sm:self-auto mt-1 sm:mt-0">
                              {ticket.is_present ? (
                                <span className="text-green-600 font-bold text-xs sm:text-sm whitespace-nowrap">✅ حاضر</span>
                              ) : (
                                <span className="text-muted-foreground text-xs sm:text-sm whitespace-nowrap">⭕ غير حاضر</span>
                              )}
                            </div>
                          </div>
                        </div>
                      );
                    })}
                  </div>

                  {/* Bulk Action Buttons */}
                  {selectedTicketIds.length > 0 && (
                    <div className="mt-4 pt-4 border-t">
                      {scanMode === 'confirm' && (
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
                              ✓ تأكيد حضور {selectedTicketIds.length} تذكرة
                            </>
                          )}
                        </Button>
                      )}
                      
                      {scanMode === 'unconfirm' && (
                        <Button 
                          onClick={handleUnconfirmPresence}
                          disabled={processing}
                          className="w-full bg-red-600 hover:bg-red-700 text-white"
                          size="lg"
                        >
                          {processing ? (
                            <>
                              <Loader2 className="w-5 h-5 ml-2 animate-spin" />
                              جاري إلغاء التأكيد...
                            </>
                          ) : (
                            <>
                              <XCircle className="w-5 h-5 ml-2" />
                              ✗ إلغاء تأكيد {selectedTicketIds.length} تذكرة
                            </>
                          )}
                        </Button>
                      )}
                    </div>
                  )}
                </div>
              )}

               <div className="space-y-2 sm:space-y-3">
                <div className="flex flex-col sm:flex-row sm:justify-between py-2 border-b gap-1">
                  <span className="font-semibold text-xs sm:text-sm lg:text-base">{t('bookingReference') || 'رقم الحجز'}</span>
                  <span className="font-mono text-sm sm:text-base lg:text-lg break-all text-left sm:text-right">{ticketInfo.booking_reference}</span>
                </div>
                
                {ticketInfo.ticket_holder_name && (
                  <div className="flex flex-col sm:flex-row sm:justify-between py-2 border-b gap-1">
                    <span className="font-semibold text-xs sm:text-sm lg:text-base">اسم حامل التذكرة</span>
                    <span className="font-bold text-sm sm:text-base lg:text-lg break-words text-left sm:text-right">{ticketInfo.ticket_holder_name}</span>
                  </div>
                )}
                
                {ticketInfo.ticket_holder_phone && (
                  <div className="flex flex-col sm:flex-row sm:justify-between py-2 border-b gap-1">
                    <span className="font-semibold text-xs sm:text-sm lg:text-base">رقم الهاتف</span>
                    <span className="font-mono text-sm sm:text-base lg:text-lg">{ticketInfo.ticket_holder_phone}</span>
                  </div>
                )}
                
                {ticketInfo.ticket_holder_nationality && (
                  <div className="flex flex-col sm:flex-row sm:justify-between py-2 border-b gap-1">
                    <span className="font-semibold text-xs sm:text-sm lg:text-base">الجنسية</span>
                    <span className="text-sm sm:text-base lg:text-lg">{ticketInfo.ticket_holder_nationality}</span>
                  </div>
                )}
                
                {ticketInfo.ticket_holder_id_number && (
                  <div className="flex flex-col sm:flex-row sm:justify-between py-2 border-b gap-1">
                    <span className="font-semibold text-xs sm:text-sm lg:text-base">رقم الهوية</span>
                    <span className="font-mono text-sm sm:text-base lg:text-lg break-all">{ticketInfo.ticket_holder_id_number}</span>
                  </div>
                )}
                
                <div className="flex flex-col sm:flex-row sm:justify-between py-2 border-b gap-1">
                  <span className="font-semibold text-xs sm:text-sm lg:text-base">{t('customerName') || 'إسم العميل'}</span>
                  <span className="text-sm sm:text-base lg:text-lg break-words text-left sm:text-right">{ticketInfo.customer_name}</span>
                </div>
                
                 {/* Confirm Presence Button - Only show when there are no available tickets (single ticket scan) */}
                {availableTickets.length === 0 && scanMode === 'confirm' && !ticketInfo.is_present && ticketInfo.payment_status === 'confirmed' && (
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
                
                {/* Unconfirm Presence Button - Only show when there are no available tickets (single ticket scan) */}
                {availableTickets.length === 0 && scanMode === 'unconfirm' && ticketInfo.is_present && (
                  <div className="pt-4">
                    <Button 
                      onClick={handleUnconfirmPresence}
                      disabled={processing}
                      className="w-full bg-red-600 hover:bg-red-700 text-white"
                      size="lg"
                    >
                      {processing ? (
                        <>
                          <Loader2 className="w-5 h-5 ml-2 animate-spin" />
                          جاري إلغاء التأكيد...
                        </>
                      ) : (
                        <>
                          <XCircle className="w-5 h-5 ml-2" />
                          ✗ إلغاء تأكيد الحضور
                        </>
                      )}
                    </Button>
                  </div>
                )}
                <div className="flex flex-col sm:flex-row sm:justify-between py-2 border-b gap-1">
                  <span className="font-semibold text-xs sm:text-sm lg:text-base">اسم الحدث</span>
                  <span className="text-sm sm:text-base lg:text-lg break-words text-left sm:text-right">{ticketInfo.event_title}</span>
                </div>
                <div className="flex flex-col sm:flex-row sm:justify-between py-2 border-b gap-1">
                  <span className="font-semibold text-xs sm:text-sm lg:text-base">{t('ticketType') || 'نوع التذكرة'}</span>
                  <span className="uppercase font-bold text-sm sm:text-base lg:text-lg">{ticketInfo.ticket_type}</span>
                </div>
                <div className="flex flex-col sm:flex-row sm:justify-between py-2 border-b gap-1">
                  <span className="font-semibold text-xs sm:text-sm lg:text-base">{t('quantity') || 'الكمية'}</span>
                  <span className="text-base sm:text-lg lg:text-xl font-medium">{ticketInfo.quantity}</span>
                </div>
                <div className="flex flex-col sm:flex-row sm:justify-between py-2 border-b gap-1">
                  <span className="font-semibold text-xs sm:text-sm lg:text-base">حالة الدفع</span>
                  <span className={`font-semibold text-sm sm:text-base lg:text-lg ${
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
                  <div className="pt-3 mt-3 border-t-2 border-yellow-400 bg-yellow-100 dark:bg-yellow-900/30 p-3 sm:p-4 rounded-lg">
                    <p className="text-yellow-800 dark:text-yellow-300 font-bold text-center text-sm sm:text-lg">
                      ⚠️ تحذير: الدفع غير مؤكد - لا يمكن تسجيل الدخول
                    </p>
                    <p className="text-yellow-700 dark:text-yellow-400 text-center text-xs sm:text-sm mt-2">
                      يرجى تأكيد الدفع قبل السماح بالدخول
                    </p>
                  </div>
                )}
                
                {ticketInfo.is_present && scanResult === 'error' && (
                  <div className="pt-3 mt-3 border-t-2 border-red-400">
                    <p className="text-red-700 dark:text-red-400 font-bold text-center text-sm sm:text-lg">
                      ⚠️ {t('alreadyCheckedIn') || 'تم تسجيل الدخول مسبقاً'}
                    </p>
                  </div>
                )}
              </div>

              {/* Reset Button */}
              <div className="mt-4 sm:mt-6">
                <Button 
                  onClick={resetScanner} 
                  className="w-full text-sm sm:text-base"
                  variant={scanResult === 'success' ? 'default' : 'outline'}
                  disabled={cameraStarting}
                  size="lg"
                >
                  {cameraStarting ? (
                    <>
                      <Loader2 className="w-4 h-4 sm:w-5 sm:h-5 ml-2 animate-spin" />
                      <span className="text-sm sm:text-base">جاري التحميل...</span>
                    </>
                  ) : (
                    <span className="text-sm sm:text-base">مسح تذكرة جديدة</span>
                  )}
                </Button>
              </div>
            </CardContent>
          </Card>
        )}

      </div>
    </div>
  );
};

export default QRScanner;
