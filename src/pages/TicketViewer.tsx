import { useState, useEffect } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { ArrowLeft, Download, Loader2, QrCode as QrCodeIcon, Send } from "lucide-react";
import { toast } from "sonner";
import QRCodeLib from "qrcode";

interface TicketHolder {
  id: string;
  name: string;
  phone: string;
  nationality: string;
  ticket_type: string;
  qr_code: string;
  id_number: string;
  is_present: boolean;
  confirmed_at: string | null;
}

interface OrderDetails {
  booking_reference: string;
  event_title: string;
  event_date: string;
  event_location: string;
  customer_name: string;
  customer_email: string;
  customer_phone: string;
}

const TicketViewer = () => {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const bookingRef = searchParams.get("ref");
  
  const [loading, setLoading] = useState(true);
  const [orderDetails, setOrderDetails] = useState<OrderDetails | null>(null);
  const [ticketHolders, setTicketHolders] = useState<TicketHolder[]>([]);
  const [qrCodeImages, setQrCodeImages] = useState<Record<string, string>>({});
  const [generatingQR, setGeneratingQR] = useState<string | null>(null);
  const [sendingTicket, setSendingTicket] = useState<string | null>(null);
  const [logoUrl, setLogoUrl] = useState<string | null>(null);
  const [headerBgColor, setHeaderBgColor] = useState<string>("hsl(var(--card) / 0.5)");
  const [selectedQR, setSelectedQR] = useState<{ image: string; holder: TicketHolder } | null>(null);

  useEffect(() => {
    if (bookingRef) {
      fetchTickets();
      fetchSettings();
    } else {
      toast.error("رقم الحجز مفقود");
      navigate("/admin/dashboard");
    }
  }, [bookingRef]);

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

  // Real-time subscription for ticket holders updates
  useEffect(() => {
    const channel = supabase
      .channel('ticket-holders-viewer')
      .on(
        'postgres_changes',
        {
          event: 'UPDATE',
          schema: 'public',
          table: 'ticket_holders'
        },
        (payload) => {
          console.log('Ticket holder updated in viewer:', payload);
          
          // Update the specific ticket holder in the list
          setTicketHolders((current) =>
            current.map((holder) =>
              holder.id === payload.new.id
                ? { ...holder, ...payload.new }
                : holder
            )
          );
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, []);

  const fetchTickets = async () => {
    try {
      setLoading(true);
      
      // Fetch order with customer and event details
      const { data: orderData, error: orderError } = await supabase
        .from("orders")
        .select(`
          booking_reference,
          customers (
            name,
            email,
            phone
          ),
          events (
            title,
            event_date,
            location
          )
        `)
        .eq("booking_reference", bookingRef)
        .single();

      if (orderError) throw orderError;

      const order: any = orderData;
      setOrderDetails({
        booking_reference: order.booking_reference,
        event_title: order.events.title,
        event_date: order.events.event_date,
        event_location: order.events.location,
        customer_name: order.customers.name,
        customer_email: order.customers.email,
        customer_phone: order.customers.phone,
      });

      // Fetch ticket holders
      const { data: holdersData, error: holdersError } = await supabase
        .from("ticket_holders")
        .select("*")
        .eq("qr_code", `${bookingRef}-TKT%`)
        .ilike("qr_code", `${bookingRef}-TKT%`);

      if (holdersError) throw holdersError;

      // Also try direct order_id match as fallback
      if (!holdersData || holdersData.length === 0) {
        const { data: orderIdData } = await supabase
          .from("orders")
          .select("id")
          .eq("booking_reference", bookingRef)
          .single();

        if (orderIdData) {
          const { data: holdersByOrderId, error: holdersByOrderIdError } = await supabase
            .from("ticket_holders")
            .select("*")
            .eq("order_id", orderIdData.id);

          if (!holdersByOrderIdError && holdersByOrderId) {
            setTicketHolders(holdersByOrderId);
            generateAllQRCodes(holdersByOrderId);
            return;
          }
        }
      }

      setTicketHolders(holdersData || []);
      generateAllQRCodes(holdersData || []);
    } catch (error) {
      console.error("Error fetching tickets:", error);
      toast.error("فشل تحميل التذاكر");
    } finally {
      setLoading(false);
    }
  };

  const generateAllQRCodes = async (holders: TicketHolder[]) => {
    const qrCodes: Record<string, string> = {};
    
    for (const holder of holders) {
      if (holder.qr_code) {
        try {
          const qrDataUrl = await QRCodeLib.toDataURL(holder.qr_code, {
            width: 400,
            margin: 2,
            errorCorrectionLevel: 'H',
          });
          qrCodes[holder.id] = qrDataUrl;
        } catch (error) {
          console.error(`Error generating QR for ${holder.qr_code}:`, error);
        }
      }
    }
    
    setQrCodeImages(qrCodes);
  };

  const downloadTicket = async (holder: TicketHolder) => {
    if (!orderDetails) return;
    
    setGeneratingQR(holder.id);
    
    try {
      const qrDataUrl = qrCodeImages[holder.id];
      if (!qrDataUrl) {
        toast.error("فشل إنشاء رمز QR");
        return;
      }

      // Create a printable ticket
      const printWindow = window.open('', '_blank');
      if (!printWindow) {
        toast.error("يرجى السماح بالنوافذ المنبثقة");
        return;
      }

      const ticketHTML = `
        <!DOCTYPE html>
        <html dir="rtl">
        <head>
          <meta charset="UTF-8">
          <title>تذكرة ${holder.qr_code}</title>
          <style>
            * { margin: 0; padding: 0; box-sizing: border-box; }
            body {
              font-family: Arial, sans-serif;
              padding: 20px;
              background: white;
            }
            .ticket {
              max-width: 800px;
              margin: 0 auto;
              border: 3px solid #8B5CF6;
              border-radius: 16px;
              padding: 40px;
              background: linear-gradient(135deg, #f8f9fa 0%, #ffffff 100%);
            }
            .header {
              text-align: center;
              margin-bottom: 30px;
              padding-bottom: 20px;
              border-bottom: 2px solid #8B5CF6;
            }
            .header h1 {
              color: #8B5CF6;
              font-size: 32px;
              margin-bottom: 10px;
            }
            .qr-section {
              text-align: center;
              margin: 30px 0;
            }
            .qr-section img {
              width: 300px;
              height: 300px;
              border: 4px solid #8B5CF6;
              border-radius: 12px;
              padding: 20px;
              background: white;
            }
            .qr-code {
              font-family: monospace;
              font-size: 24px;
              font-weight: bold;
              color: #8B5CF6;
              margin-top: 15px;
            }
            .details {
              margin-top: 30px;
            }
            .detail-row {
              display: flex;
              justify-content: space-between;
              padding: 15px;
              margin: 10px 0;
              background: white;
              border-radius: 8px;
              border-right: 4px solid #8B5CF6;
            }
            .detail-label {
              font-weight: bold;
              color: #666;
            }
            .detail-value {
              color: #333;
              font-size: 18px;
            }
            .status {
              text-align: center;
              margin-top: 30px;
              padding: 20px;
              border-radius: 12px;
              font-size: 20px;
              font-weight: bold;
            }
            .status.checked-in {
              background: #dcfce7;
              color: #166534;
              border: 2px solid #22c55e;
            }
            .status.not-checked-in {
              background: #fef3c7;
              color: #92400e;
              border: 2px solid #fbbf24;
            }
            @media print {
              body { padding: 0; }
              .no-print { display: none; }
            }
          </style>
        </head>
        <body>
          <div class="ticket">
            <div class="header">
              <h1>🎫 تذكرة دخول</h1>
              <p style="font-size: 18px; color: #666; margin-top: 10px;">${orderDetails.event_title}</p>
            </div>
            
            <div class="qr-section">
              <img src="${qrDataUrl}" alt="QR Code" />
              <div class="qr-code">${holder.qr_code}</div>
            </div>
            
            <div class="details">
              <div class="detail-row">
                <span class="detail-label">اسم حامل التذكرة:</span>
                <span class="detail-value">${holder.name}</span>
              </div>
              <div class="detail-row">
                <span class="detail-label">رقم الهاتف:</span>
                <span class="detail-value">${holder.phone}</span>
              </div>
              <div class="detail-row">
                <span class="detail-label">الجنسية:</span>
                <span class="detail-value">${holder.nationality}</span>
              </div>
              <div class="detail-row">
                <span class="detail-label">رقم الهوية:</span>
                <span class="detail-value">${holder.id_number}</span>
              </div>
              <div class="detail-row">
                <span class="detail-label">نوع التذكرة:</span>
                <span class="detail-value">${holder.ticket_type.toUpperCase()}</span>
              </div>
              <div class="detail-row">
                <span class="detail-label">موقع الفعالية:</span>
                <span class="detail-value">${orderDetails.event_location}</span>
              </div>
              <div class="detail-row">
                <span class="detail-label">تاريخ الفعالية:</span>
                <span class="detail-value">${new Date(orderDetails.event_date).toLocaleDateString('ar-QA')}</span>
              </div>
            </div>
            
            <div class="status ${holder.is_present ? 'checked-in' : 'not-checked-in'}">
              ${holder.is_present 
                ? `✅ تم تسجيل الحضور في: ${new Date(holder.confirmed_at!).toLocaleString('ar-QA')}`
                : '⏳ لم يتم تسجيل الحضور بعد'
              }
            </div>
            
            <div style="text-align: center; margin-top: 30px; padding-top: 20px; border-top: 2px dashed #8B5CF6;">
              <p style="color: #666; font-size: 14px;">يرجى إحضار هذه التذكرة (مطبوعة أو رقمية) لتسجيل الدخول</p>
              <p style="color: #999; font-size: 12px; margin-top: 10px;">الرقم المرجعي للحجز: ${orderDetails.booking_reference}</p>
            </div>
          </div>
          
          <div class="no-print" style="text-align: center; margin-top: 30px;">
            <button onclick="window.print()" style="
              background: #8B5CF6;
              color: white;
              padding: 15px 40px;
              border: none;
              border-radius: 8px;
              font-size: 18px;
              cursor: pointer;
              font-weight: bold;
            ">طباعة التذكرة 🖨️</button>
          </div>
        </body>
        </html>
      `;

      printWindow.document.write(ticketHTML);
      printWindow.document.close();
      
      toast.success("تم فتح التذكرة في نافذة جديدة");
    } catch (error) {
      console.error("Error generating ticket:", error);
      toast.error("فشل إنشاء التذكرة");
    } finally {
      setGeneratingQR(null);
    }
  };

  const downloadAllTickets = async () => {
    for (const holder of ticketHolders) {
      await downloadTicket(holder);
      // Small delay between opening windows
      await new Promise(resolve => setTimeout(resolve, 500));
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center font-lusail">
        <div className="text-center">
          <Loader2 className="w-12 h-12 animate-spin mx-auto mb-4" />
          <p className="text-xl">جاري تحميل التذاكر...</p>
        </div>
      </div>
    );
  }

  if (!orderDetails || ticketHolders.length === 0) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center font-lusail p-4">
        <Card className="max-w-md w-full">
          <CardHeader>
            <CardTitle className="text-center text-red-600">لم يتم العثور على تذاكر</CardTitle>
          </CardHeader>
          <CardContent className="text-center space-y-4">
            <p>لا توجد تذاكر للرقم المرجعي: {bookingRef}</p>
            <Button onClick={() => navigate("/admin/dashboard")}>
              <ArrowLeft className="w-4 h-4 ml-2" />
              العودة للوحة التحكم
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  const regenerateQRCodes = async () => {
    if (!bookingRef) return;
    
    setLoading(true);
    try {
      const { data, error } = await supabase.functions.invoke('regenerate-booking-qr-codes', {
        body: { booking_reference: bookingRef }
      });

      if (error) throw error;

      toast.success(`تم إعادة إنشاء ${data.updated} رمز QR بنجاح`);
      await fetchTickets(); // Reload the tickets
    } catch (error) {
      console.error('Error regenerating QR codes:', error);
      toast.error('فشل إعادة إنشاء رموز QR');
    } finally {
      setLoading(false);
    }
  };

  const sendTicketToWhatsApp = async (holder: TicketHolder) => {
    setSendingTicket(holder.id);
    try {
      // Fetch webhook URL from settings
      const { data: settings, error: settingsError } = await supabase
        .from("settings")
        .select("webhook_url")
        .maybeSingle();

      if (settingsError) throw settingsError;

      if (!settings?.webhook_url) {
        toast.error("لم يتم تكوين رابط الويب هوك");
        return;
      }

      // Convert QR code data URL to blob and upload to storage
      let qrCodeImageUrl = "";
      const qrDataUrl = qrCodeImages[holder.id];
      
      if (qrDataUrl) {
        try {
          // Convert data URL to blob
          const response = await fetch(qrDataUrl);
          const blob = await response.blob();
          
          // Upload to storage
          const fileName = `${holder.qr_code}.png`;
          const { data: uploadData, error: uploadError } = await supabase.storage
            .from("qr-codes")
            .upload(fileName, blob, {
              contentType: "image/png",
              upsert: true,
            });

          if (uploadError) throw uploadError;

          // Get public URL
          const { data: urlData } = supabase.storage
            .from("qr-codes")
            .getPublicUrl(fileName);

          qrCodeImageUrl = urlData.publicUrl;
        } catch (error) {
          console.error("Error uploading QR code:", error);
          toast.error("فشل رفع رمز QR");
          return;
        }
      }

      // Fetch ticket price
      const { data: tickets } = await supabase
        .from("tickets")
        .select("type, price");

      const ticketPrices = new Map<string, number>(
        tickets?.map((ticket) => [ticket.type as string, ticket.price as number]) || []
      );

      // Prepare ticket data with all details
      const ticketData = {
        booking_reference: orderDetails?.booking_reference,
        event_title: orderDetails?.event_title,
        event_date: orderDetails?.event_date,
        event_location: orderDetails?.event_location,
        holder: {
          name: holder.name,
          phone: holder.phone.replace(/^\+/, ''),
          nationality: holder.nationality,
          id_number: holder.id_number,
          ticket_type: holder.ticket_type,
          ticket_price: ticketPrices.get(holder.ticket_type as string) || 0,
          qr_code: holder.qr_code,
          qr_code_image: qrCodeImageUrl, // Public URL to PNG image
          is_present: holder.is_present
        },
        timestamp: new Date().toISOString()
      };

      // Send to webhook
      const response = await fetch(settings.webhook_url, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(ticketData),
      });

      if (!response.ok) {
        throw new Error("فشل إرسال البيانات إلى الويب هوك");
      }

      toast.success(`تم إرسال التذكرة إلى ${holder.phone}`);
    } catch (error) {
      console.error("Error sending ticket:", error);
      toast.error("فشل إرسال التذكرة");
    } finally {
      setSendingTicket(null);
    }
  };

  return (
    <div className="min-h-screen bg-background font-lusail" dir="rtl">
      {/* Header */}
      <header className="border-b backdrop-blur-sm sticky top-0 z-10" style={{ backgroundColor: headerBgColor }}>
        <div className="container mx-auto px-4 py-4 flex justify-between items-center">
          <button onClick={() => navigate("/admin/dashboard")} className="focus:outline-none hover:opacity-80 transition-opacity">
            {logoUrl ? (
              <img src={logoUrl} alt="Logo" className="h-12 object-contain" />
            ) : (
              <h1 className="text-2xl font-bold">عرض وطباعة التذاكر</h1>
            )}
          </button>
          <div className="flex items-center gap-4">
            <Button
              variant="ghost"
              onClick={() => navigate("/admin/dashboard")}
              className="gap-2"
            >
              <ArrowLeft className="w-4 h-4" />
              رجوع
            </Button>
            <Button
              variant="outline"
              onClick={regenerateQRCodes}
              disabled={loading}
              className="gap-2"
            >
              <QrCodeIcon className="w-4 h-4" />
              إعادة إنشاء جميع رموز QR
            </Button>
          </div>
        </div>
      </header>

      <div className="py-8 px-4">
      <div className="max-w-6xl mx-auto">

        {/* Important Notice */}
        <Card className="mb-6 border-amber-500 bg-amber-50">
          <CardContent className="pt-6">
            <div className="flex items-start gap-4">
              <div className="text-amber-600 text-3xl">⚠️</div>
              <div>
                <h3 className="font-bold text-lg mb-2 text-amber-900">تنبيه هام</h3>
                <p className="text-amber-800 mb-2">
                  إذا كانت التذاكر المطبوعة القديمة تحتوي فقط على الرقم المرجعي للحجز (مثل: QTR-AVB5MGKO)، 
                  يجب <strong>إعادة تحميل وطباعة التذاكر الجديدة</strong> التي تحتوي على رموز QR فردية لكل تذكرة (مثل: QTR-AVB5MGKO-TKT01).
                </p>
                <p className="text-amber-700 text-sm">
                  كل تذكرة يجب أن يكون لها رمز QR فريد خاص بها لتسجيل الحضور بشكل صحيح.
                </p>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Order Summary */}
        <Card className="mb-6">
          <CardHeader>
            <CardTitle>تفاصيل الحجز</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="grid md:grid-cols-2 gap-4">
              <div>
                <p className="text-sm text-muted-foreground">الرقم المرجعي</p>
                <p className="font-mono font-bold text-xl text-primary">{orderDetails.booking_reference}</p>
              </div>
              <div>
                <p className="text-sm text-muted-foreground">اسم العميل</p>
                <p className="font-semibold">{orderDetails.customer_name}</p>
              </div>
              <div>
                <p className="text-sm text-muted-foreground">رقم الهاتف</p>
                <p className="font-semibold">{orderDetails.customer_phone}</p>
              </div>
              <div>
                <p className="text-sm text-muted-foreground">اسم الفعالية</p>
                <p className="font-semibold">{orderDetails.event_title}</p>
              </div>
              <div>
                <p className="text-sm text-muted-foreground">عدد التذاكر</p>
                <p className="font-semibold">{ticketHolders.length} تذكرة</p>
              </div>
            </div>
            <Button onClick={downloadAllTickets} className="w-full mt-4" size="lg">
              <Download className="w-4 h-4 ml-2" />
              طباعة جميع التذاكر ({ticketHolders.length})
            </Button>
          </CardContent>
        </Card>

        {/* Tickets Grid */}
        <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-6">
          {ticketHolders.map((holder) => (
            <Card key={holder.id} className="overflow-hidden">
              <CardHeader className="bg-primary/5">
                <CardTitle className="flex items-center justify-between text-lg">
                  <span className="font-mono">{holder.qr_code}</span>
                  {holder.is_present && (
                    <span className="text-xs bg-green-100 text-green-700 px-2 py-1 rounded">
                      حاضر ✓
                    </span>
                  )}
                </CardTitle>
              </CardHeader>
              <CardContent className="p-6 space-y-4">
                {/* QR Code */}
                <div className="flex justify-center">
                  {qrCodeImages[holder.id] ? (
                    <img 
                      src={qrCodeImages[holder.id]} 
                      alt={`QR Code ${holder.qr_code}`}
                      className="w-48 h-48 border-2 border-primary rounded-lg p-2 cursor-pointer hover:opacity-80 transition-opacity"
                      onClick={() => setSelectedQR({ image: qrCodeImages[holder.id], holder })}
                    />
                  ) : (
                    <div className="w-48 h-48 bg-muted rounded-lg flex items-center justify-center">
                      <Loader2 className="w-8 h-8 animate-spin" />
                    </div>
                  )}
                </div>

                {/* Holder Details */}
                <div className="space-y-2 text-sm">
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">الاسم:</span>
                    <span className="font-semibold">{holder.name}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">الجنسية:</span>
                    <span>{holder.nationality}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">النوع:</span>
                    <span className="uppercase font-semibold">{holder.ticket_type}</span>
                  </div>
                </div>

                {/* Action Buttons */}
                <div className="flex gap-2">
                  <Button 
                    onClick={() => downloadTicket(holder)}
                    disabled={generatingQR === holder.id}
                    className="flex-1"
                    variant="outline"
                  >
                    {generatingQR === holder.id ? (
                      <>
                        <Loader2 className="w-4 h-4 ml-2 animate-spin" />
                        جاري الإنشاء...
                      </>
                    ) : (
                      <>
                        <QrCodeIcon className="w-4 h-4 ml-2" />
                        عرض وطباعة
                      </>
                    )}
                  </Button>
                  <Button 
                    onClick={() => sendTicketToWhatsApp(holder)}
                    disabled={sendingTicket === holder.id}
                    className="flex-1"
                    variant="default"
                  >
                    {sendingTicket === holder.id ? (
                      <>
                        <Loader2 className="w-4 h-4 ml-2 animate-spin" />
                        جاري الإرسال...
                      </>
                    ) : (
                      <>
                        <Send className="w-4 h-4 ml-2" />
                        إرسال للواتساب
                      </>
                    )}
                  </Button>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>

        {/* Maximized QR Code Dialog */}
        <Dialog open={!!selectedQR} onOpenChange={() => setSelectedQR(null)}>
          <DialogContent className="max-w-fit">
            <DialogHeader>
              <DialogTitle className="font-lusail text-2xl text-center">رمز QR</DialogTitle>
            </DialogHeader>
            {selectedQR && (
              <div className="flex flex-col items-center justify-center p-4 gap-4">
                <img 
                  src={selectedQR.image} 
                  alt="Maximized QR Code" 
                  className="w-[500px] h-[500px] object-contain border-4 border-primary rounded-lg p-4 bg-white" 
                />
                <div className="text-center">
                  <p className="text-xl font-bold font-lusail">{selectedQR.holder.name}</p>
                  <p className="text-lg text-muted-foreground font-mono">{selectedQR.holder.qr_code}</p>
                  <p className="text-sm text-muted-foreground capitalize mt-2">{selectedQR.holder.ticket_type}</p>
                </div>
              </div>
            )}
          </DialogContent>
        </Dialog>
      </div>
      </div>
    </div>
  );
};

export default TicketViewer;