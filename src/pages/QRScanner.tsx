import { useState, useEffect, useRef } from "react";
import { useNavigate } from "react-router-dom";
import { Html5Qrcode } from "html5-qrcode";
import { supabase } from "@/integrations/supabase/client";
import { getStaffPasscode } from "@/lib/staffAccess";
import { Button } from "@/components/ui/button";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

import { CheckCircle2, XCircle, Loader2, Search, Camera, AlertCircle, LogOut, Calendar, Users, ChevronDown, ChevronUp, RotateCcw, QrCode, RefreshCw, UserRound, ScanLine } from "lucide-react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import { useActivityLog } from "@/hooks/useActivityLog";
import { format } from "date-fns";
import { playErrorSound } from "@/lib/sfx";

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

interface RelatedTicket extends TicketHolder {
  event_date?: string;
  event_title?: string;
  booking_reference?: string;
  is_same_day: boolean;
}

interface SuccessData {
  totalTickets: number;
  mainName: string;
  ticketHolders: { name: string; ticketType: string }[];
  ticketTypes: { type: string; quantity: number }[];
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
  const { logActivity } = useActivityLog();
  const [scanning, setScanning] = useState(false);
  const [processing, setProcessing] = useState(false);
  const processingRef = useRef(false);
  const updateProcessing = (value: boolean) => {
    processingRef.current = value;
    setProcessing(value);
  };
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
  const [relatedTicketsSameDay, setRelatedTicketsSameDay] = useState<RelatedTicket[]>([]);
  const [relatedTicketsOtherDays, setRelatedTicketsOtherDays] = useState<RelatedTicket[]>([]);
  const [sameBookingTickets, setSameBookingTickets] = useState<RelatedTicket[]>([]);
  const [showSuccessDialog, setShowSuccessDialog] = useState(false);
  const [successData, setSuccessData] = useState<SuccessData | null>(null);
  const [collapsedDates, setCollapsedDates] = useState<Record<string, boolean>>({});
  const [errorDialogMessage, setErrorDialogMessage] = useState<string | null>(null);
  const [alreadyScanned, setAlreadyScanned] = useState<{
    name: string;
    ticketType: string;
    reference: string;
    confirmedAt?: string | null;
    confirmedBy?: string | null;
  } | null>(null);
  const cameraScanRef = useRef(false);
  const [staffUsers, setStaffUsers] = useState<{ id: string; name: string; icon: string | null }[]>([]);
  const [staffName, setStaffName] = useState<string>(() => localStorage.getItem("scanner_staff_name") || "");
  const [scanHistory, setScanHistory] = useState<
    { id: string; name: string; ticket_type: string; confirmed_at: string | null; confirmed_by_name: string | null; orders?: { booking_reference: string; events?: { title: string } | null } | null }[]
  >([]);
  const [isAdminUser, setIsAdminUser] = useState(false);
  const [resettingId, setResettingId] = useState<string | null>(null);

  useEffect(() => {
    localStorage.setItem("scanner_staff_name", staffName);
  }, [staffName]);

  const loadStaffUsers = async () => {
    const { data } = await supabase
      .from("pos_users")
      .select("id, name, icon")
      .eq("is_active", true)
      .order("name");
    setStaffUsers(data ?? []);
  };

  const loadScanHistory = async () => {
    try {
      const { data } = await supabase.functions.invoke("ticket-checkin", { body: { mode: "history", passcode: getStaffPasscode() } });
      if (data?.history) setScanHistory(data.history);
    } catch (e) {
      console.error("Failed to load scan history:", e);
    }
  };

  useEffect(() => {
    loadStaffUsers();
    loadScanHistory();
  }, []);

  useEffect(() => {
    if (errorDialogMessage) playErrorSound();
  }, [errorDialogMessage]);

  // Already-scanned alert: warn loudly, then get the camera ready for the next ticket
  useEffect(() => {
    if (!alreadyScanned) return;
    playErrorSound();
    if (!cameraScanRef.current) return;
    const timer = setTimeout(() => {
      setAlreadyScanned(null);
      resetScanner();
    }, 4000);
    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [alreadyScanned]);

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
      .from("public_settings")
      .select("logo_url, header_bg_color")
      .maybeSingle();

    if (error) {
      console.error("Error fetching settings:", error);
      return;
    }

    if (data?.logo_url) {
      setLogoUrl(data.logo_url);
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
    if (session) {
      // A signed-in admin account may reset scanned tickets — even if the
      // team passcode is also stored in this browser.
      const [{ data: adminRow }, { data: roleRow }] = await Promise.all([
        supabase.from("admin_users").select("id").eq("id", session.user.id).maybeSingle(),
        supabase.from("user_roles").select("role").eq("user_id", session.user.id).eq("role", "admin").maybeSingle(),
      ]);
      setIsAdminUser(!!adminRow || !!roleRow);
      return;
    }
    // The team passcode (verified by the route guard) is enough — no account needed.
    if (getStaffPasscode()) return;
    navigate("/admin/login");
  };

  const handleResetTicket = async (holderId: string, holderName: string) => {
    if (!window.confirm(`إلغاء مسح تذكرة ${holderName}؟ ستعود التذكرة صالحة من جديد.`)) return;
    setResettingId(holderId);
    try {
      const { data, error } = await supabase.functions.invoke("ticket-checkin", {
        body: { mode: "reset", holder_id: holderId },
      });
      if (error || !data?.success) {
        toast.error(data?.message || "تعذر إلغاء المسح — هذه العملية للأدمن فقط");
        return;
      }
      toast.success(data.message || "تم إلغاء المسح");
      setScanHistory((prev) => prev.filter((h) => h.id !== holderId));
    } catch {
      toast.error("تعذر إلغاء المسح");
    } finally {
      setResettingId(null);
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
    // Ignore overlapping scans so a slow earlier lookup cannot overwrite a newer one
    if (processingRef.current) return;
    updateProcessing(true);
    setScanning(false);
    setAvailableTickets([]);
    setSelectedTicketIds([]);
    setRelatedTicketsSameDay([]);
    setRelatedTicketsOtherDays([]);
    setSameBookingTickets([]);

    // Log search activity
    await logActivity({
      activityType: 'qr_search',
      userType: 'admin',
      actionData: {
        search_query: scannedCode,
        search_type: /^[\d\s+\-()]+$/.test(scannedCode) ? 'phone' : 
                     scannedCode.includes('-TKT') ? 'ticket_code' : 'booking_reference'
      }
    });

    try {
      // Check if it's a phone number (contains only digits, +, spaces, or hyphens)
      const isPhoneNumber = /^[\d\s+\-()]+$/.test(scannedCode);
      
      // Check if it's a specific ticket code (contains -TKT) or just booking reference
      const isSpecificTicket = scannedCode.includes('-TKT');
      
      if (isPhoneNumber) {
        // Search by phone number in ticket_holders
        // Keep only digits/plus so the filter below cannot be broken by stray characters
        const cleanPhone = scannedCode.replace(/[^\d+]/g, '');
        
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
            confirmed_by_name,
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
          .ilike('phone', `%${cleanPhone}%`)
          .order('created_at', { ascending: false });
        
        // Filter to show only successful payments
        const filteredTickets = ticketsData?.filter((ticket: any) => 
          ticket.orders?.payment_status === 'confirmed' || 
          ticket.orders?.payment_method === 'cash_pos'
        );

        if (ticketsError || !filteredTickets || filteredTickets.length === 0) {
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
          updateProcessing(false);
          return;
        }

        // Group tickets by order
        const orderGroups = new Map();
        filteredTickets.forEach(ticket => {
          const orderId = ticket.order_id;
          if (!orderGroups.has(orderId)) {
            orderGroups.set(orderId, []);
          }
          orderGroups.get(orderId).push(ticket);
        });

        // If multiple orders, show all tickets to choose from
        if (orderGroups.size > 1 || filteredTickets.length > 1) {
          setAvailableTickets(filteredTickets);
          const firstTicket = filteredTickets[0];
          const order: any = firstTicket.orders;
          
          const isPOSOrder = order.booking_reference?.startsWith('POS-') || order.payment_method === 'cash_pos';
          const effectivePaymentStatus = isPOSOrder ? 'confirmed' : order.payment_status;
          
          // Don't show tickets with pending payment (unless POS)
          if (effectivePaymentStatus !== 'confirmed') {
            setScanResult('error');
            setTicketInfo({
              booking_reference: order.booking_reference,
              customer_name: order.customers.name,
              event_title: order.events.title,
              ticket_type: "-",
              quantity: 0,
              payment_status: effectivePaymentStatus,
              is_present: false,
            });
            toast.error('⚠️ حالة الدفع: قيد الانتظار - لا يمكن عرض التذاكر');
            updateProcessing(false);
            return;
          }
          
          setTicketInfo({
            booking_reference: `${filteredTickets.length} تذكرة`,
            customer_name: order.customers.name,
            event_title: order.events.title,
            ticket_type: firstTicket.ticket_type,
            quantity: filteredTickets.length,
            payment_status: effectivePaymentStatus,
            is_present: false,
          });
          setScanResult('success');
          toast.info(`تم العثور على ${filteredTickets.length} تذكرة لهذا الرقم - اختر التذكرة المراد تأكيدها`);
        } else {
          // Single ticket found - auto-select it
          const ticket = filteredTickets[0];
          const order: any = ticket.orders;
          
          const isPOSOrder = order.booking_reference?.startsWith('POS-') || order.payment_method === 'cash_pos';
          const effectivePaymentStatus = isPOSOrder ? 'confirmed' : order.payment_status;
          
          // Don't show tickets with pending payment (unless POS)
          if (effectivePaymentStatus !== 'confirmed') {
            setScanResult('error');
            setTicketInfo({
              booking_reference: order.booking_reference,
              customer_name: order.customers.name,
              event_title: order.events.title,
              ticket_type: "-",
              quantity: 0,
              payment_status: effectivePaymentStatus,
              is_present: false,
            });
            toast.error('⚠️ حالة الدفع: قيد الانتظار - لا يمكن عرض التذاكر');
            updateProcessing(false);
            return;
          }
          
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
            setAlreadyScanned({
              name: ticket.name,
              ticketType: ticket.ticket_type,
              reference: order.booking_reference,
              confirmedAt: ticket.confirmed_at,
              confirmedBy: (ticket as any).confirmed_by_name,
            });
          } else if (effectivePaymentStatus !== 'confirmed') {
            setScanResult('success');
            toast.warning('⚠️ الدفع غير مؤكد');
          } else {
            setScanResult('success');
            toast.success('معلومات التذكرة - جاهز للتأكيد');
          }

          // Fetch related tickets by same phone number
          if (ticket.phone && order.events?.event_date) {
            fetchRelatedTickets(ticket.phone, order.events.event_date, [ticket.id]);
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
            confirmed_by_name,
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
              confirmed_by_name,
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

        // Fallback for passcode-only staff (no signed-in session): use the secure lookup service
        if (!orderData) {
          try {
            const { data: lookup } = await supabase.functions.invoke('ticket-checkin', {
              body: { mode: 'lookup', booking_reference: scannedCode, passcode: getStaffPasscode() },
            });
            const found = (lookup as any)?.results?.[0];
            if (found) {
              orderData = found;
              orderError = null;
            }
          } catch (lookupErr) {
            console.error('Lookup fallback failed:', lookupErr);
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
        
        // Don't show tickets with pending payment (unless POS)
        if (effectivePaymentStatus !== 'confirmed') {
          setScanResult('error');
          setTicketInfo({
            booking_reference: order.booking_reference,
            customer_name: order.customers.name,
            event_title: order.events.title,
            ticket_type: "-",
            quantity: 0,
            payment_status: effectivePaymentStatus,
            is_present: false,
          });
          toast.error('⚠️ حالة الدفع: قيد الانتظار - لا يمكن عرض التذاكر');
          return;
        }
        
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
          setAlreadyScanned({
            name: orderData.name,
            ticketType: orderData.ticket_type,
            reference: order.booking_reference,
            confirmedAt: orderData.confirmed_at,
            confirmedBy: (orderData as any).confirmed_by_name,
          });
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
            events!inner (title, event_date)
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
        
        // Fetch all tickets for this order with orders relation for display
        const { data: ticketsData, error: ticketsError } = await supabase
          .from('ticket_holders')
          .select(`
            *,
            orders!inner (
              id,
              booking_reference,
              payment_status,
              payment_method,
              quantity,
              customers (name),
              events (title, event_date)
            )
          `)
          .eq('order_id', orderData.id)
          .order('qr_code');

        console.log('=== Booking Reference Tickets Debug ===');
        console.log('Order ID:', orderData.id);
        console.log('Booking Reference:', orderData.booking_reference);
        console.log('Tickets found:', ticketsData?.length);
        console.log('Tickets data:', ticketsData);

        if (ticketsError || !ticketsData || ticketsData.length === 0) {
          console.error('Tickets error:', ticketsError);
          setScanResult('error');
          toast.error('لا توجد تذاكر لهذا الحجز');
          return;
        }

        // Force confirmed status for POS orders
        const isPOSBooking = orderData.booking_reference?.startsWith('POS-');
        const effectiveBookingPaymentStatus = isPOSBooking ? 'confirmed' : orderData.payment_status;
        
        console.log('Booking reference scan - Is POS:', isPOSBooking);
        console.log('Booking reference scan - Effective status:', effectiveBookingPaymentStatus);
        
        // Don't show tickets with pending payment (unless POS)
        if (effectiveBookingPaymentStatus !== 'confirmed') {
          setScanResult('error');
          setTicketInfo({
            booking_reference: orderData.booking_reference,
            customer_name: orderData.customers.name,
            event_title: orderData.events.title,
            ticket_type: "-",
            quantity: 0,
            payment_status: effectiveBookingPaymentStatus,
            is_present: false,
          });
          toast.error('⚠️ حالة الدفع: قيد الانتظار - لا يمكن عرض التذاكر');
          return;
        }
        
        console.log('Setting available tickets count:', ticketsData.length);
        
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

        // Fetch related tickets by phone for the first ticket holder
        const firstTicket = ticketsData[0];
        if (firstTicket?.phone && orderData.events?.event_date) {
          fetchRelatedTickets(firstTicket.phone, orderData.events.event_date, ticketsData.map(t => t.id));
        }

        // Fetch same booking reference tickets that might have been already selected
        fetchSameBookingTickets(orderData.booking_reference, ticketsData.map(t => t.id));
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
      updateProcessing(false);
    }
  };

  const handleConfirmPresence = async () => {
    if (!ticketInfo) return;
    
    // If we have multiple tickets available, user must select at least one
    if (availableTickets.length > 0 && selectedTicketIds.length === 0) {
      toast.error('الرجاء اختيار التذاكر المراد تأكيدها');
      return;
    }
    
    updateProcessing(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      
      // Get selected tickets — fall back to the single scanned ticket
      const selectedTickets = selectedTicketIds.length > 0
        ? availableTickets.filter(t => selectedTicketIds.includes(t.id))
        : ticketInfo.ticket_holder_qr_code
          ? [{
              id: ticketInfo.ticket_holder_qr_code,
              name: ticketInfo.ticket_holder_name || ticketInfo.customer_name,
              ticket_type: ticketInfo.ticket_type,
              qr_code: ticketInfo.ticket_holder_qr_code,
            } as any]
          : [];
      
      if (selectedTickets.length === 0) {
        setErrorDialogMessage('لم يتم تحديد أي تذكرة للتأكيد');
        return;
      }

      
      let successCount = 0;
      let errorCount = 0;
      const confirmedTickets: typeof selectedTickets = [];

      // Process each ticket through the edge function for proper validation
      for (const ticket of selectedTickets) {
        try {
          const response = await supabase.functions.invoke('ticket-checkin', {
            body: {
              booking_reference: ticket.qr_code,
              admin_id: user?.id,
              staff_name: staffName || undefined,
              passcode: getStaffPasscode()
            }
          });

          if (response.error) {
            console.error('Edge function error for ticket:', ticket.qr_code, response.error);
            errorCount++;
            continue;
          }

          const result = response.data;
          
          if (result.success) {
            successCount++;
            confirmedTickets.push(ticket);
            
            // Log activity for each ticket (fire and forget - non-blocking)
            logActivity({
              activityType: 'ticket_scan',
              userType: 'admin',
              userIdentifier: user?.id,
              actionData: {
                ticket_holder_id: ticket.id,
                ticket_holder_name: ticket.name,
                ticket_type: ticket.ticket_type,
                qr_code: ticket.qr_code,
                action: 'confirm_presence'
              }
            }).catch(err => console.error('Activity log error:', err));
          } else {
            // Show specific error message from edge function in popup dialog
            setErrorDialogMessage(result.message || 'فشل تأكيد التذكرة');
            errorCount++;
          }
        } catch (err) {
          console.error('Error confirming ticket:', ticket.qr_code, err);
          errorCount++;
        }
      }

      // Show results
      if (successCount > 0) {
        // Prepare success data for dialog
        const ticketTypesMap = new Map<string, number>();
        confirmedTickets.forEach(ticket => {
          const type = ticket.ticket_type;
          ticketTypesMap.set(type, (ticketTypesMap.get(type) || 0) + 1);
        });

        const ticketTypeSummary = Array.from(ticketTypesMap.entries()).map(([type, qty]) => ({
          type: type.toUpperCase(),
          quantity: qty
        }));

        setSuccessData({
          totalTickets: successCount,
          mainName: confirmedTickets[0]?.name || ticketInfo.customer_name,
          ticketHolders: confirmedTickets.map(t => ({ name: t.name, ticketType: t.ticket_type.toUpperCase() })),
          ticketTypes: ticketTypeSummary
        });
        setShowSuccessDialog(true);
        toast.success(`✅ تم تأكيد حضور ${successCount} تذكرة`);
        loadScanHistory();
      }
      
      if (errorCount > 0 && successCount === 0) {
        // All tickets failed - keep the UI as is for retry
        updateProcessing(false);
        return;
      }

      // Clear selections and refresh
      setAvailableTickets([]);
      setSelectedTicketIds([]);
      setRelatedTicketsSameDay([]);
      setRelatedTicketsOtherDays([]);
      setSameBookingTickets([]);
      setTicketInfo(null);
      setScanResult(null);
    } catch (err: any) {
      console.error('Confirmation error:', err);
      toast.error(err.message || 'حدث خطأ أثناء تأكيد الحضور');
    } finally {
      updateProcessing(false);
    }
  };

  const handleUnconfirmPresence = async () => {
    if (!ticketInfo) return;
    
    // If we have multiple tickets available, user must select at least one
    if (availableTickets.length > 0 && selectedTicketIds.length === 0) {
      toast.error('الرجاء اختيار التذاكر المراد إلغاء تأكيدها');
      return;
    }
    
    updateProcessing(true);
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
      setRelatedTicketsSameDay([]);
      setRelatedTicketsOtherDays([]);
      setSameBookingTickets([]);
      setTicketInfo(null);
      setScanResult(null);
    } catch (err: any) {
      console.error('Unconfirmation error:', err);
      toast.error(err.message || 'حدث خطأ أثناء إلغاء تأكيد الحضور');
    } finally {
      updateProcessing(false);
    }
  };

  const onScanSuccess = async (decodedText: string) => {
    if (processing) return;
    console.log("QR Code scanned:", decodedText);
    
    // Stop scanner while processing
    await stopScanner();
    setScanning(false);
    
    cameraScanRef.current = true;
    await processTicket(decodedText);
  };

  const onScanError = (error: any) => {
    // Ignore scan errors (they happen frequently during scanning)
    // Don't log to avoid console spam
  };

  const resetScanner = async () => {
    setTicketInfo(null);
    setScanResult(null);
    updateProcessing(false);
    setManualSearch("");
    setCameraError(null);
    setAvailableTickets([]);
    setSelectedTicketIds([]);
    setRelatedTicketsSameDay([]);
    setRelatedTicketsOtherDays([]);
    setSameBookingTickets([]);
    
    // Restart scanner
    await startScanner();
  };

  // Fetch related tickets by phone number
  const fetchRelatedTickets = async (phone: string, currentEventDate: string, currentTicketIds: string[]) => {
    try {
      const cleanPhone = phone.replace(/[\s\-()]/g, '');
      const currentDate = new Date(currentEventDate);
      const currentDateStr = format(currentDate, 'yyyy-MM-dd');

      const { data: relatedData, error } = await supabase
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
          confirmed_by_name,
          id_number,
          order_id,
          orders!inner (
            id,
            booking_reference,
            payment_status,
            payment_method,
            customers (name),
            events (title, event_date)
          )
        `)
        .or(`phone.ilike.%${cleanPhone}%`)
        .order('created_at', { ascending: false });

      if (error || !relatedData) return;

      // Filter out current tickets and unpaid
      const otherTickets = relatedData.filter((ticket: any) => 
        !currentTicketIds.includes(ticket.id) &&
        (ticket.orders?.payment_status === 'confirmed' || ticket.orders?.payment_method === 'cash_pos')
      );

      // Separate by same day vs other days
      const sameDay: RelatedTicket[] = [];
      const otherDays: RelatedTicket[] = [];

      otherTickets.forEach((ticket: any) => {
        const ticketEventDate = ticket.orders?.events?.event_date;
        const ticketDateStr = ticketEventDate ? format(new Date(ticketEventDate), 'yyyy-MM-dd') : '';
        const isSameDay = ticketDateStr === currentDateStr;

        const relatedTicket: RelatedTicket = {
          id: ticket.id,
          qr_code: ticket.qr_code,
          name: ticket.name,
          phone: ticket.phone,
          nationality: ticket.nationality,
          ticket_type: ticket.ticket_type,
          id_number: ticket.id_number,
          is_present: ticket.is_present,
          confirmed_at: ticket.confirmed_at,
          event_date: ticketEventDate,
          event_title: ticket.orders?.events?.title,
          booking_reference: ticket.orders?.booking_reference,
          is_same_day: isSameDay
        };

        if (isSameDay) {
          sameDay.push(relatedTicket);
        } else {
          otherDays.push(relatedTicket);
        }
      });

      setRelatedTicketsSameDay(sameDay);
      setRelatedTicketsOtherDays(otherDays);
    } catch (err) {
      console.error('Error fetching related tickets:', err);
    }
  };

  // Fetch other tickets with same booking reference
  const fetchSameBookingTickets = async (bookingReference: string, currentTicketIds: string[]) => {
    try {
      const { data: orderData } = await supabase
        .from('orders')
        .select('id, events(event_date)')
        .eq('booking_reference', bookingReference)
        .maybeSingle();

      if (!orderData) return;

      const { data: ticketsData } = await supabase
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
          confirmed_by_name,
          id_number,
          order_id
        `)
        .eq('order_id', orderData.id);

      if (!ticketsData) return;

      // Filter out current tickets
      const otherTickets = ticketsData.filter(t => !currentTicketIds.includes(t.id));

      if (otherTickets.length > 0) {
        const eventDate = (orderData.events as any)?.event_date;
        setSameBookingTickets(otherTickets.map(t => ({
          ...t,
          event_date: eventDate,
          event_title: '',
          booking_reference: bookingReference,
          is_same_day: true
        })));
      }
    } catch (err) {
      console.error('Error fetching same booking tickets:', err);
    }
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
    cameraScanRef.current = false;
    await processTicket(manualSearch.trim());
  };

  return (
    <div className="min-h-screen bg-scanner-background font-lusail text-scanner-foreground" dir="rtl">
      {/* Header */}
      <header className="sticky top-0 z-20 border-b border-scanner-elevated bg-scanner-background/95 backdrop-blur-xl">
        <div className="mx-auto flex max-w-5xl flex-wrap items-center gap-2 px-3 py-2 sm:px-6 sm:py-2.5">
          <button onClick={() => navigate("/staff")} className="flex items-center gap-2 text-right focus:outline-none focus-visible:ring-2 focus-visible:ring-scanner-gold">
            {logoUrl ? (
              <span className="flex size-9 items-center justify-center rounded-lg border border-scanner-gold/30 bg-scanner-elevated p-1.5"><img src={logoUrl} alt="Logo" className="h-full w-full object-contain" /></span>
            ) : (
              <span className="flex size-9 items-center justify-center rounded-lg bg-scanner-maroon"><QrCode className="size-5" /></span>
            )}
            <span>
              <strong className="block text-sm leading-tight sm:text-base">ماسح التذاكر الذكي</strong>
              <small className="flex items-center gap-1.5 text-[10px] text-scanner-muted">
                <span className="size-1.5 rounded-full bg-success animate-pulse" />
                نظام إدارة الدخول — متصل
              </small>
            </span>
          </button>
          <div className="mr-auto flex items-center gap-2">
            {staffUsers.length > 0 ? (
              <Select value={staffName || undefined} onValueChange={setStaffName} dir="rtl">
                <SelectTrigger className="h-9 w-40 border-scanner-elevated bg-scanner-elevated text-xs text-scanner-foreground focus:ring-scanner-gold sm:w-52 sm:text-sm">
                  <UserRound className="size-3.5 shrink-0 text-scanner-gold" />
                  <SelectValue placeholder="اختر موظف البوابة..." />
                </SelectTrigger>
                <SelectContent className="border-scanner-elevated bg-scanner-surface text-scanner-foreground">
                  {staffUsers.map((u) => (
                    <SelectItem key={u.id} value={u.name} className="focus:bg-scanner-elevated focus:text-scanner-foreground">
                      <span className="ml-2">{u.icon || "⭐"}</span>
                      {u.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            ) : (
              <span className="text-[11px] text-scanner-muted">لا يوجد موظفون مفعّلون</span>
            )}
            <Button
              variant="outline"
              size="icon"
              onClick={handleLogout}
              aria-label={t("logout")}
              title={t("logout")}
              className="size-9 shrink-0 border-scanner-elevated bg-scanner-surface text-scanner-foreground hover:bg-destructive hover:text-destructive-foreground"
            >
              <LogOut className="size-4" />
            </Button>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-5xl space-y-3 px-3 py-3 sm:px-6 sm:py-4">



        {/* Mode Buttons */}
        <div className="grid grid-cols-2 gap-2">
          <Button
            onClick={() => setScanMode('confirm')}
            className={`h-11 border text-xs sm:text-sm ${scanMode === 'confirm' ? "border-scanner-gold/60 bg-scanner-maroon text-scanner-foreground shadow-elegant hover:bg-scanner-maroon/90 hover:text-scanner-foreground" : "border-scanner-elevated bg-scanner-surface text-scanner-muted hover:bg-scanner-elevated hover:text-scanner-foreground"}`}
          >
            <CheckCircle2 className="w-4 h-4 ml-1.5" />
            <span>تأكيد الحضور</span>
          </Button>
          <Button
            onClick={() => setScanMode('unconfirm')}
            className={`h-11 border text-xs sm:text-sm ${scanMode === 'unconfirm' ? "border-destructive/60 bg-destructive text-destructive-foreground shadow-elegant hover:bg-destructive/90" : "border-scanner-elevated bg-scanner-surface text-scanner-muted hover:bg-scanner-elevated hover:text-scanner-foreground"}`}
          >
            <XCircle className="w-4 h-4 ml-1.5" />
            <span>إلغاء التأكيد</span>
          </Button>
        </div>

        {/* Scanner */}
        <Card className="overflow-hidden border-scanner-elevated bg-scanner-surface text-scanner-foreground shadow-elegant">
          <CardHeader className="border-b border-scanner-elevated pb-3">
            <div className="flex items-center justify-between gap-3">
              <div>
                <CardTitle className="text-base sm:text-lg">{t('scanTicket') || 'مسح التذكرة'}</CardTitle>
                <p className="mt-0.5 text-[11px] text-scanner-muted">ضع رمز QR داخل الإطار ليتم التحقق تلقائياً</p>
              </div>
              <span className={`flex items-center gap-2 rounded-full px-2.5 py-1 text-[11px] font-bold ${scanning ? "bg-success/15 text-success" : "bg-scanner-elevated text-scanner-muted"}`}>
                <span className={`size-2 rounded-full ${scanning ? "bg-success animate-pulse" : "bg-scanner-muted"}`} />
                {scanning ? "الكاميرا نشطة" : "الكاميرا متوقفة"}
              </span>
            </div>
          </CardHeader>
          <CardContent className="space-y-3 p-3 sm:p-4">
            {/* Camera Controls */}
            {!scanning && !ticketInfo && (
              <div className="flex flex-col items-center gap-3">
                {cameraError && (
                  <div className="flex w-full items-center gap-2 rounded-lg border border-destructive/30 bg-destructive/10 p-3 text-sm text-destructive">
                    <AlertCircle className="w-4 h-4 shrink-0" />
                    <span>{cameraError}</span>
                  </div>
                )}
                <Button
                  onClick={startScanner}
                  disabled={cameraStarting}
                  className="h-12 w-full max-w-sm bg-scanner-maroon text-scanner-foreground hover:bg-scanner-maroon/90"
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
            <div className="flex justify-center pt-1">
              <Button
                variant="ghost"
                onClick={() => setShowManualSearch(!showManualSearch)}
                size="sm"
                className="text-xs text-scanner-muted hover:bg-scanner-elevated hover:text-scanner-foreground sm:text-sm"
              >
                <Search className="w-4 h-4 ml-2" />
                {showManualSearch ? "إخفاء البحث اليدوي" : "بحث يدوي"}
              </Button>
            </div>

            {/* Manual Search Input */}
            {showManualSearch && (
              <form onSubmit={handleManualSearch} className="mx-auto max-w-xl space-y-3 rounded-lg border border-scanner-elevated bg-scanner-background p-3">
                <Input
                  type="text"
                  placeholder="أدخل رقم الحجز أو رقم الهاتف"
                  value={manualSearch}
                  onChange={(e) => setManualSearch(e.target.value.toUpperCase())}
                  className="border-scanner-elevated bg-scanner-surface text-center font-mono text-scanner-foreground placeholder:text-scanner-muted"
                  disabled={processing}
                />
                <Button type="submit" className="w-full bg-scanner-gold text-scanner-background hover:bg-scanner-gold/90" disabled={processing}>
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
            <div className="relative mx-auto w-full max-w-2xl overflow-hidden rounded-lg border border-scanner-elevated bg-scanner-background p-2">
              <div id="qr-reader" className="min-h-[280px] w-full overflow-hidden rounded-md bg-scanner-background sm:min-h-[400px]" />
              {!scanning && !ticketInfo && !cameraStarting && (
                <div className="pointer-events-none absolute inset-2 flex flex-col items-center justify-center rounded-md bg-scanner-background">
                  <div className="relative flex size-48 items-center justify-center sm:size-64">
                    <span className="absolute right-0 top-0 size-10 border-r-2 border-t-2 border-scanner-gold" />
                    <span className="absolute left-0 top-0 size-10 border-l-2 border-t-2 border-scanner-gold" />
                    <span className="absolute bottom-0 right-0 size-10 border-b-2 border-r-2 border-scanner-gold" />
                    <span className="absolute bottom-0 left-0 size-10 border-b-2 border-l-2 border-scanner-gold" />
                    <ScanLine className="size-20 text-scanner-elevated" />
                  </div>
                  <p className="mt-5 text-sm text-scanner-muted">الكاميرا جاهزة للتشغيل</p>
                </div>
              )}
              {scanning && <span className="pointer-events-none absolute inset-x-10 top-10 h-px bg-scanner-gold shadow-elegant animate-scanner-line" />}
            </div>
            
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
                    {(() => {
                      console.log('=== Rendering Tickets ===');
                      console.log('Total tickets in availableTickets:', availableTickets.length);
                      console.log('Tickets being rendered:', availableTickets.map(t => ({ id: t.id, name: t.name, qr: t.qr_code, is_present: t.is_present })));
                      return null;
                    })()}
                    {availableTickets.map((ticket, index) => {
                      const bookingReference = (ticket as any).orders?.booking_reference || '';
                      const eventTitle = (ticket as any).orders?.events?.title || '';
                      
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
                                {eventTitle && (
                                  <div className="text-xs sm:text-sm mt-1 bg-primary/10 p-1.5 sm:p-2 rounded">
                                    <span className="font-semibold">الفعالية:</span> <span className="font-medium">{eventTitle}</span>
                                  </div>
                                )}
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

              {/* Same Booking Reference - Other Tickets */}
              {sameBookingTickets.length > 0 && (
                <div className="mt-4 p-3 sm:p-4 bg-purple-50 dark:bg-purple-950/20 rounded-lg border-2 border-purple-300">
                  <h3 className="font-bold text-sm sm:text-base text-purple-900 dark:text-purple-100 flex items-center gap-2 mb-3">
                    <Users className="w-4 h-4" />
                    تذاكر أخرى بنفس الرقم المرجعي ({sameBookingTickets.length})
                  </h3>
                  <div className="space-y-2">
                    {sameBookingTickets.map((ticket) => (
                      <div
                        key={ticket.id}
                        className="p-2 sm:p-3 rounded-lg border bg-card text-right"
                      >
                        <div className="flex justify-between items-start gap-2">
                          <div className="flex-1">
                            <div className="font-bold text-sm sm:text-base">{ticket.name}</div>
                            <div className="text-xs text-muted-foreground mt-1">
                              <span className="font-semibold">النوع:</span> {ticket.ticket_type.toUpperCase()}
                            </div>
                          </div>
                          <div>
                            {ticket.is_present ? (
                              <span className="text-green-600 font-bold text-xs">✅ حاضر</span>
                            ) : (
                              <span className="text-muted-foreground text-xs">⭕ غير حاضر</span>
                            )}
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Related Tickets - Same Day */}
              {relatedTicketsSameDay.length > 0 && (
                <div className="mt-4 p-3 sm:p-4 bg-emerald-50 dark:bg-emerald-950/20 rounded-lg border-2 border-emerald-300">
                  <h3 className="font-bold text-sm sm:text-base text-emerald-900 dark:text-emerald-100 flex items-center gap-2 mb-3">
                    <Calendar className="w-4 h-4" />
                    تذاكر أخرى لنفس رقم الهاتف - نفس اليوم ({relatedTicketsSameDay.length})
                  </h3>
                  <div className="space-y-2">
                    {relatedTicketsSameDay.map((ticket) => (
                      <div
                        key={ticket.id}
                        className="p-2 sm:p-3 rounded-lg border bg-card text-right"
                      >
                        <div className="flex justify-between items-start gap-2">
                          <div className="flex-1">
                            <div className="font-bold text-sm sm:text-base">{ticket.name}</div>
                            {ticket.event_title && (
                              <div className="text-xs text-muted-foreground mt-1">
                                <span className="font-semibold">الفعالية:</span> {ticket.event_title}
                              </div>
                            )}
                            <div className="text-xs text-muted-foreground mt-0.5">
                              <span className="font-semibold">النوع:</span> {ticket.ticket_type.toUpperCase()}
                            </div>
                            {ticket.booking_reference && (
                              <div className="text-xs text-muted-foreground mt-0.5 font-mono">
                                {ticket.booking_reference}
                              </div>
                            )}
                          </div>
                          <div>
                            {ticket.is_present ? (
                              <span className="text-green-600 font-bold text-xs">✅ حاضر</span>
                            ) : (
                              <span className="text-muted-foreground text-xs">⭕ غير حاضر</span>
                            )}
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Related Tickets - Other Days */}
              {relatedTicketsOtherDays.length > 0 && (
                <div className="mt-4 p-3 sm:p-4 bg-amber-50 dark:bg-amber-950/20 rounded-lg border-2 border-amber-300">
                  <h3 className="font-bold text-sm sm:text-base text-amber-900 dark:text-amber-100 flex items-center gap-2 mb-3">
                    <Calendar className="w-4 h-4" />
                    تذاكر أخرى لنفس رقم الهاتف - أيام أخرى ({relatedTicketsOtherDays.length})
                  </h3>
                  <p className="text-xs text-amber-700 dark:text-amber-300 mb-3 bg-amber-100 dark:bg-amber-900/30 p-2 rounded">
                    ⚠️ هذه التذاكر ليوم مختلف - لا يمكن تسجيل الحضور اليوم
                  </p>
                  <div className="space-y-4">
                    {(() => {
                      // Group tickets by date
                      const ticketsByDate = relatedTicketsOtherDays.reduce((acc, ticket) => {
                        const dateKey = ticket.event_date ? format(new Date(ticket.event_date), 'yyyy-MM-dd') : 'unknown';
                        if (!acc[dateKey]) {
                          acc[dateKey] = [];
                        }
                        acc[dateKey].push(ticket);
                        return acc;
                      }, {} as Record<string, typeof relatedTicketsOtherDays>);

                      // Sort dates
                      const sortedDates = Object.keys(ticketsByDate).sort();

                      return sortedDates.map((dateKey, dateIndex) => {
                        const isCollapsed = collapsedDates[dateKey] ?? false;
                        
                        return (
                          <div key={dateKey} className={dateIndex > 0 ? 'mt-[30px]' : ''}>
                            {/* Top Separator Line */}
                            {dateIndex > 0 && (
                              <div className="mb-4 h-1 bg-gradient-to-r from-amber-200 via-amber-500 to-amber-200 rounded-full"></div>
                            )}
                            
                            {/* Date Header - Clickable */}
                            <div 
                              className="flex items-center gap-3 mb-3 cursor-pointer"
                              onClick={() => setCollapsedDates(prev => ({ ...prev, [dateKey]: !isCollapsed }))}
                            >
                              <div className="flex-1 h-1 bg-gradient-to-r from-transparent via-amber-400 to-amber-500 rounded-full"></div>
                              <div className="flex items-center gap-2 px-4 py-2.5 bg-gradient-to-r from-amber-300 to-amber-200 dark:from-amber-700 dark:to-amber-800 rounded-full shadow-md border-2 border-amber-400 dark:border-amber-600 hover:shadow-lg transition-shadow">
                                {isCollapsed ? (
                                  <ChevronDown className="w-5 h-5 text-amber-800 dark:text-amber-200" />
                                ) : (
                                  <ChevronUp className="w-5 h-5 text-amber-800 dark:text-amber-200" />
                                )}
                                <Calendar className="w-5 h-5 text-amber-800 dark:text-amber-200" />
                                <span className="text-sm font-bold text-amber-900 dark:text-amber-100">
                                  📅 {dateKey !== 'unknown' ? format(new Date(dateKey), 'dd MMMM yyyy') : 'تاريخ غير محدد'}
                                </span>
                                <span className="text-xs bg-amber-500 dark:bg-amber-600 text-white px-2.5 py-1 rounded-full font-bold shadow">
                                  {ticketsByDate[dateKey].length} تذكرة
                                </span>
                              </div>
                              <div className="flex-1 h-1 bg-gradient-to-l from-transparent via-amber-400 to-amber-500 rounded-full"></div>
                            </div>
                            
                            {/* Tickets for this date - Collapsible */}
                            {!isCollapsed && (
                              <div className="space-y-2 border-r-4 border-amber-400 pr-3 mr-1">
                                {ticketsByDate[dateKey].map((ticket) => (
                                  <div
                                    key={ticket.id}
                                    className="p-2 sm:p-3 rounded-lg border bg-card text-right opacity-80 hover:opacity-100 transition-opacity"
                                  >
                                    <div className="flex justify-between items-start gap-2">
                                      <div className="flex-1">
                                        <div className="font-bold text-sm sm:text-base">{ticket.name}</div>
                                        {ticket.event_title && (
                                          <div className="text-xs text-muted-foreground mt-1">
                                            <span className="font-semibold">الفعالية:</span> {ticket.event_title}
                                          </div>
                                        )}
                                        <div className="text-xs text-muted-foreground mt-0.5">
                                          <span className="font-semibold">النوع:</span> {ticket.ticket_type.toUpperCase()}
                                        </div>
                                        {ticket.booking_reference && (
                                          <div className="text-[10px] text-muted-foreground mt-0.5 font-mono">
                                            {ticket.booking_reference}
                                          </div>
                                        )}
                                      </div>
                                      <div>
                                        {ticket.is_present ? (
                                          <span className="text-green-600 font-bold text-xs">✅ حاضر</span>
                                        ) : (
                                          <span className="text-muted-foreground text-xs">⭕ غير حاضر</span>
                                        )}
                                      </div>
                                    </div>
                                  </div>
                                ))}
                              </div>
                            )}
                            
                            {/* Bottom Separator Line */}
                            <div className="mt-3 h-0.5 bg-gradient-to-r from-amber-300 via-amber-400 to-amber-300 rounded-full"></div>
                          </div>
                        );
                      });
                    })()}
                  </div>
                </div>
              )}

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

        {/* Scan history */}
        <Card className="border-scanner-elevated bg-scanner-surface text-scanner-foreground shadow-elegant">
          <CardHeader className="flex-row items-center justify-between space-y-0 border-b border-scanner-elevated p-4 sm:p-5">
            <div>
              <CardTitle className="text-base sm:text-lg">آخر عمليات الدخول</CardTitle>
              <p className="mt-1 text-xs text-scanner-muted">{scanHistory.length} تذكرة مسجلة</p>
            </div>
            <Button variant="outline" size="sm" onClick={loadScanHistory} className="border-scanner-elevated bg-scanner-elevated text-xs text-scanner-foreground hover:bg-scanner-elevated/70 hover:text-scanner-foreground">
              <RefreshCw className="size-3.5" /> تحديث
            </Button>
          </CardHeader>
          <CardContent className="p-3 sm:p-5">
            {scanHistory.length === 0 ? (
              <p className="py-8 text-center text-sm text-scanner-muted">لا يوجد سجل بعد</p>
            ) : (
              <div className="max-h-[32rem] space-y-2 overflow-y-auto pl-1">
                {scanHistory.map((h, index) => (
                  <div
                    key={h.id}
                    className="flex items-center justify-between gap-3 rounded-lg border border-scanner-elevated bg-scanner-background px-3 py-3 transition-colors hover:border-scanner-gold/40 sm:px-4"
                  >
                    <div className="flex min-w-0 items-center gap-3">
                      <span className={`flex size-9 shrink-0 items-center justify-center rounded-md text-xs font-black ${h.ticket_type?.toUpperCase() === "VIP" ? "bg-scanner-gold text-scanner-background" : "bg-scanner-maroon text-scanner-foreground"}`}>{index + 1}</span>
                      <div className="min-w-0">
                      <p className="truncate text-sm font-semibold">{h.name}</p>
                      <p className="truncate text-[11px] text-scanner-muted">
                        {h.orders?.booking_reference} · {h.ticket_type?.toUpperCase()}
                        {h.orders?.events?.title ? ` · ${h.orders.events.title}` : ""}
                      </p>
                      </div>
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                      {isAdminUser && (
                        <Button
                          variant="outline"
                          size="sm"
                          className="h-9 border-destructive/60 bg-destructive/10 px-3 text-[11px] font-bold text-destructive hover:bg-destructive hover:text-destructive-foreground"
                          disabled={resettingId === h.id}
                          onClick={() => handleResetTicket(h.id, h.name)}
                          title="إلغاء المسح (للأدمن فقط)"
                        >
                          {resettingId === h.id ? (
                            <Loader2 className="h-3.5 w-3.5 animate-spin" />
                          ) : (
                            <RotateCcw className="h-3.5 w-3.5" />
                          )}
                          إلغاء المسح
                        </Button>
                      )}
                      <div className="text-end">
                        <p className="text-[11px] text-scanner-muted">
                          {h.confirmed_at
                            ? new Date(h.confirmed_at).toLocaleString("ar-u-nu-latn", {
                                timeZone: "Asia/Qatar",
                                dateStyle: "short",
                                timeStyle: "short",
                              })
                            : "-"}
                        </p>
                        {h.confirmed_by_name && (
                          <p className="text-[11px] font-medium text-scanner-gold">بواسطة {h.confirmed_by_name}</p>
                        )}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </main>


      {/* Success Dialog */}
      <Dialog open={showSuccessDialog} onOpenChange={setShowSuccessDialog}>
        <DialogContent className="sm:max-w-md text-center p-8">
          <div className="flex flex-col items-center gap-6">
            <div className="w-20 h-20 bg-green-100 rounded-full flex items-center justify-center">
              <CheckCircle2 className="w-12 h-12 text-green-600" />
            </div>
            
            <div className="space-y-2">
              <h2 className="text-2xl font-bold text-green-600">تم تأكيد الحضور!</h2>
              <p className="text-muted-foreground">تم تسجيل الحضور بنجاح</p>
            </div>

            {successData && (
              <div className="w-full space-y-4 text-right bg-muted/50 rounded-lg p-4">
                <div className="flex justify-between items-center border-b pb-2">
                  <span className="text-2xl font-bold text-primary">{successData.totalTickets}</span>
                  <span className="font-medium">عدد التذاكر</span>
                </div>
                
                <div className="space-y-2">
                  <p className="font-medium text-sm text-muted-foreground">أنواع التذاكر:</p>
                  {successData.ticketTypes.map((tt, idx) => (
                    <div key={idx} className="flex justify-between text-sm">
                      <span className="font-semibold">{tt.quantity}x</span>
                      <span>{tt.type}</span>
                    </div>
                  ))}
                </div>

                <div className="space-y-2 border-t pt-2">
                  <p className="font-medium text-sm text-muted-foreground">حاملي التذاكر:</p>
                  {successData.ticketHolders.map((holder, idx) => (
                    <div key={idx} className="flex justify-between text-sm">
                      <span className="text-xs text-muted-foreground">({holder.ticketType})</span>
                      <span className="font-medium">{idx === 0 ? `👤 ${holder.name}` : holder.name}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            <Button 
              onClick={() => setShowSuccessDialog(false)} 
              size="lg" 
              className="w-full h-12 text-lg"
            >
              حسناً
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Error Dialog - Centered Popup */}
      <Dialog 
        open={!!errorDialogMessage} 
        onOpenChange={(open) => !open && setErrorDialogMessage(null)}
      >
        <DialogContent className="sm:max-w-md text-center p-8">
          <div className="flex flex-col items-center gap-6">

            <div className="w-20 h-20 bg-red-100 rounded-full flex items-center justify-center">
              <XCircle className="w-12 h-12 text-red-600" />
            </div>
            
            <div className="space-y-2">
              <h2 className="text-2xl font-bold text-red-600">لا يمكن تسجيل الحضور</h2>
              <p className="text-lg text-foreground whitespace-pre-wrap">{errorDialogMessage}</p>
            </div>

            <Button 
              onClick={() => setErrorDialogMessage(null)} 
              size="lg" 
              variant="destructive"
              className="w-full h-12 text-lg"
            >
              إغلاق
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Fixed Floating Action Button - Right Middle */}
      {selectedTicketIds.length > 0 && scanMode === 'confirm' && (
        <div className="fixed right-4 top-1/2 -translate-y-1/2 z-50">
          <Button
            onClick={handleConfirmPresence}
            disabled={processing}
            className="w-16 h-16 rounded-xl bg-green-600 hover:bg-green-700 text-white shadow-2xl flex flex-col items-center justify-center gap-1 animate-pulse hover:animate-none"
          >
            {processing ? (
              <Loader2 className="w-8 h-8 animate-spin" />
            ) : (
              <>
                <CheckCircle2 className="w-7 h-7" />
                <span className="text-xs font-bold">{selectedTicketIds.length}</span>
              </>
            )}
          </Button>
        </div>
      )}

      {/* Fixed Floating Action Button for Unconfirm - Right Middle */}
      {selectedTicketIds.length > 0 && scanMode === 'unconfirm' && (
        <div className="fixed right-4 top-1/2 -translate-y-1/2 z-50">
          <Button
            onClick={handleUnconfirmPresence}
            disabled={processing}
            className="w-16 h-16 rounded-xl bg-red-600 hover:bg-red-700 text-white shadow-2xl flex flex-col items-center justify-center gap-1 animate-pulse hover:animate-none"
          >
            {processing ? (
              <Loader2 className="w-8 h-8 animate-spin" />
            ) : (
              <>
                <XCircle className="w-7 h-7" />
                <span className="text-xs font-bold">{selectedTicketIds.length}</span>
              </>
            )}
          </Button>
        </div>
      )}
    </div>
  );
};

export default QRScanner;
