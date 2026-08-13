import { useState, useEffect, useRef } from "react";
import { useNavigate } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "sonner";
import { CreditCard, Banknote, Loader2, Plus, Minus, X, AlertTriangle } from "lucide-react";
import { Checkbox } from "@/components/ui/checkbox";
import { Footer } from "@/components/Footer";
import { useSettings } from "@/contexts/SettingsContext";
import { useReserveTickets } from "@/hooks/useReserveTickets";

// Convert Arabic numerals to English numerals
const convertArabicToEnglishNumbers = (str: string): string => {
  const arabicNumerals = ['٠', '١', '٢', '٣', '٤', '٥', '٦', '٧', '٨', '٩'];
  return str.replace(/[٠-٩]/g, (match) => arabicNumerals.indexOf(match).toString());
};

const ARABIC_COUNTRIES = ["السعودية", "الإمارات", "قطر", "الكويت", "البحرين", "عمان", "مصر", "الأردن", "لبنان", "العراق", "سوريا", "اليمن", "ليبيا", "السودان", "الجزائر", "المغرب", "تونس", "موريتانيا", "الصومال", "جيبوتي", "فلسطين"];
const COUNTRY_FLAGS: Record<string, string> = {
  "السعودية": "🇸🇦",
  "الإمارات": "🇦🇪",
  "قطر": "🇶🇦",
  "الكويت": "🇰🇼",
  "البحرين": "🇧🇭",
  "عمان": "🇴🇲",
  "مصر": "🇪🇬",
  "الأردن": "🇯🇴",
  "لبنان": "🇱🇧",
  "العراق": "🇮🇶",
  "سوريا": "🇸🇾",
  "اليمن": "🇾🇪",
  "ليبيا": "🇱🇾",
  "السودان": "🇸🇩",
  "الجزائر": "🇩🇿",
  "المغرب": "🇲🇦",
  "تونس": "🇹🇳",
  "موريتانيا": "🇲🇷",
  "الصومال": "🇸🇴",
  "جيبوتي": "🇩🇯",
  "فلسطين": "🇵🇸"
};
const COUNTRY_CODES: Record<string, string> = {
  "السعودية": "+966",
  "الإمارات": "+971",
  "قطر": "+974",
  "الكويت": "+965",
  "البحرين": "+973",
  "عمان": "+968",
  "مصر": "+20",
  "الأردن": "+962",
  "لبنان": "+961",
  "العراق": "+964",
  "سوريا": "+963",
  "اليمن": "+967",
  "ليبيا": "+218",
  "السودان": "+249",
  "الجزائر": "+213",
  "المغرب": "+212",
  "تونس": "+216",
  "موريتانيا": "+222",
  "الصومال": "+252",
  "جيبوتي": "+253",
  "فلسطين": "+970"
};
interface TicketSelection {
  ticketId: string;
  type: string;
  quantity: number;
  price: number;
}
interface TicketHolder {
  name: string;
  phone: string;
  nationality: string;
  ticketType: string;
  idNumber: string;
}

const getTicketTypeName = (type: string): string => {
  switch(type) {
    case "vip": return "تذكرة دخول VIP";
    case "normal": return "تذكرة دخول عادية";
    case "parking": return "تذكرة موقف السيارات";
    default: return type;
  }
};
interface TicketAvailability {
  ticketId: string;
  type: string;
  available: number;
  sold: number;
  remaining: number;
}

const Checkout = () => {
  const {
    t
  } = useTranslation();
  const { settings } = useSettings();
  const { reserveMultipleTickets } = useReserveTickets();
  const [selections, setSelections] = useState<TicketSelection[]>([]);
  const [paymentMethod, setPaymentMethod] = useState<"sadad" | "cash_pos">("sadad");
  const [customerInfo, setCustomerInfo] = useState({
    name: "",
    email: "",
    phone: "",
    nationality: "قطر",
    countryCode: "+974",
    idNumber: ""
  });
  const [ticketHolders, setTicketHolders] = useState<TicketHolder[]>([]);
  const [loading, setLoading] = useState(false);
  const [termsAccepted, setTermsAccepted] = useState(false);
  const [logoUrl, setLogoUrl] = useState<string | null>(null);
  const [headerBgColor, setHeaderBgColor] = useState<string>("hsl(var(--card) / 0.5)");
  const [ticketAvailability, setTicketAvailability] = useState<TicketAvailability[]>([]);
  const [availabilityLoading, setAvailabilityLoading] = useState(true);
  const navigate = useNavigate();
  useEffect(() => {
    const stored = localStorage.getItem("ticketSelection");
    if (!stored) {
      navigate("/tickets");
      return;
    }
    const parsedSelections = JSON.parse(stored);
    setSelections(parsedSelections);

    // Initialize ticket holders array based on total quantity
    const totalTickets = parsedSelections.reduce((total: number, item: TicketSelection) => total + item.quantity, 0);
    const holders: TicketHolder[] = [];
    parsedSelections.forEach((selection: TicketSelection) => {
      for (let i = 0; i < selection.quantity; i++) {
        holders.push({
          name: "",
          phone: "",
          nationality: "قطر",
          ticketType: selection.type,
          idNumber: ""
        });
      }
    });
    setTicketHolders(holders);

    // Fetch logo and availability
    fetchSettings();
    fetchTicketAvailability();
  }, [navigate]);

  const fetchTicketAvailability = async () => {
    setAvailabilityLoading(true);
    const selectedEventId = localStorage.getItem("selectedEventId");
    if (!selectedEventId) {
      setAvailabilityLoading(false);
      return;
    }

    try {
      // 1) Fetch tickets for the event
      const { data: tickets, error } = await supabase
        .from("tickets")
        .select("id, type, available_quantity")
        .eq("event_id", selectedEventId);

      if (error) {
        console.error("Error fetching ticket availability:", error);
        setAvailabilityLoading(false);
        return;
      }

      // 2) Count CONFIRMED ticket holders per type (pending orders should not reduce availability)
      const { data: confirmedHolders, error: holdersError } = await supabase
        .from("ticket_holders")
        .select("ticket_type, orders!inner(event_id, payment_status)")
        .eq("orders.event_id", selectedEventId)
        .eq("orders.payment_status", "confirmed");

      if (holdersError) {
        console.error("Error fetching confirmed holders:", holdersError);
        setAvailabilityLoading(false);
        return;
      }

      const holderCounts: Record<string, number> = {};
      (confirmedHolders || []).forEach(holder => {
        const type = holder.ticket_type;
        holderCounts[type] = (holderCounts[type] || 0) + 1;
      });

      const availability: TicketAvailability[] = (tickets || []).map(ticket => {
        const soldCount = holderCounts[ticket.type] || 0;
        return {
          ticketId: ticket.id,
          type: ticket.type,
          available: ticket.available_quantity,
          sold: soldCount,
          remaining: ticket.available_quantity - soldCount
        };
      });

      setTicketAvailability(availability);
    } finally {
      setAvailabilityLoading(false);
    }
  };

  const fetchSettings = async () => {
    const {
      data,
      error
    } = await supabase.from("public_settings").select("logo_url, header_bg_color").maybeSingle();
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
  const calculateTotal = () => {
    return selections.reduce((total, item) => {
      return total + item.price * item.quantity;
    }, 0);
  };

  // Auto-fill first ticket holder from customer info and apply nationality to all holders
  useEffect(() => {
    if (ticketHolders.length > 0 && customerInfo.name && customerInfo.phone && customerInfo.nationality) {
      const updated = [...ticketHolders];
      const fullPhone = `${customerInfo.countryCode} ${customerInfo.phone}`;
      // Update first ticket holder with all customer info
      updated[0] = {
        ...updated[0],
        name: customerInfo.name,
        phone: fullPhone,
        nationality: customerInfo.nationality,
        idNumber: customerInfo.idNumber
      };
      // Apply main user's nationality and country code to all other ticket holders
      const countryCode = customerInfo.countryCode;
      for (let i = 1; i < updated.length; i++) {
        // Only update nationality and phone prefix if not already set
        if (!updated[i].nationality) {
          updated[i] = {
            ...updated[i],
            nationality: customerInfo.nationality,
            phone: countryCode // Set initial phone with country code
          };
        } else if (!updated[i].phone) {
          // If nationality is set but phone is empty, use appropriate country code
          const holderCountryCode = COUNTRY_CODES[updated[i].nationality] || "+974";
          updated[i] = {
            ...updated[i],
            phone: holderCountryCode
          };
        }
      }
      setTicketHolders(updated);
    }
  }, [customerInfo.name, customerInfo.phone, customerInfo.nationality, customerInfo.countryCode, customerInfo.idNumber]);
  const updateTicketHolder = (index: number, field: keyof TicketHolder, value: string) => {
    const updated = [...ticketHolders];
    updated[index] = {
      ...updated[index],
      [field]: value
    };
    setTicketHolders(updated);
  };
  const handleIncreaseQuantity = (index: number) => {
    const currentSelection = selections[index];
    
    // Check if this is a normal or VIP ticket - enforce 5 ticket max for normal + VIP combined
    if (currentSelection.type === "normal" || currentSelection.type === "vip") {
      const currentNormalVipTotal = selections
        .filter(s => s.type === "normal" || s.type === "vip")
        .reduce((sum, s) => sum + s.quantity, 0);
      
      if (currentNormalVipTotal >= 5) {
        toast.error("الحد الأقصى هو 5 تذاكر (عادي + VIP) لكل شخص");
        return;
      }
    }

    const updated = [...selections];
    updated[index] = {
      ...updated[index],
      quantity: updated[index].quantity + 1
    };
    setSelections(updated);
    localStorage.setItem("ticketSelection", JSON.stringify(updated));

    // Rebuild ticket holders array
    const holders: TicketHolder[] = [];
    updated.forEach((selection: TicketSelection) => {
      for (let i = 0; i < selection.quantity; i++) {
        holders.push({
          name: "",
          phone: "",
          nationality: "قطر",
          ticketType: selection.type,
          idNumber: ""
        });
      }
    });
    setTicketHolders(holders);
    toast.success("تم زيادة الكمية");
  };
  const handleDecreaseQuantity = (index: number) => {
    const item = selections[index];
    if (item.quantity === 1) {
      // If quantity is 1, remove the item entirely
      const confirmed = confirm(`هل تريد حذف ${item.type} من الطلب؟`);
      if (confirmed) {
        const updated = selections.filter((_, i) => i !== index);
        if (updated.length === 0) {
          localStorage.removeItem("ticketSelection");
          toast.info("تم حذف جميع التذاكر، سيتم إعادتك إلى صفحة التذاكر");
          navigate("/tickets");
          return;
        }
        setSelections(updated);
        localStorage.setItem("ticketSelection", JSON.stringify(updated));

        // Rebuild ticket holders array
        const holders: TicketHolder[] = [];
        updated.forEach((selection: TicketSelection) => {
          for (let i = 0; i < selection.quantity; i++) {
            holders.push({
              name: "",
              phone: "",
              nationality: "قطر",
              ticketType: selection.type,
              idNumber: ""
            });
          }
        });
        setTicketHolders(holders);
        toast.success("تم حذف التذكرة");
      }
    } else {
      const updated = [...selections];
      updated[index] = {
        ...updated[index],
        quantity: updated[index].quantity - 1
      };
      setSelections(updated);
      localStorage.setItem("ticketSelection", JSON.stringify(updated));

      // Rebuild ticket holders array
      const holders: TicketHolder[] = [];
      updated.forEach((selection: TicketSelection) => {
        for (let i = 0; i < selection.quantity; i++) {
          holders.push({
            name: "",
            phone: "",
            nationality: "قطر",
            ticketType: selection.type,
            idNumber: ""
          });
        }
      });
      setTicketHolders(holders);
      toast.success("تم تقليل الكمية");
    }
  };
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    // Validate minimum amount for Sadad payment (3 QAR minimum)
    const totalAmount = calculateTotal();
    if (paymentMethod === "sadad" && totalAmount < 3) {
      toast.error("الحد الأدنى للدفع عبر سداد هو 3 ريال قطري");
      return;
    }
    if (!customerInfo.name || !customerInfo.phone || !customerInfo.nationality || !customerInfo.idNumber) {
      toast.error("Please fill in all customer information");
      return;
    }

    // Validate ticket availability before processing using atomic database function
    const selectedEventId = localStorage.getItem("selectedEventId");
    if (!selectedEventId) {
      toast.error("لم يتم العثور على الفعالية المحددة");
      navigate("/");
      return;
    }

    // Use atomic reservation check to prevent race conditions
    const ticketSelections = selections.map(s => ({
      type: s.type,
      quantity: s.quantity
    }));

    const reservationResult = await reserveMultipleTickets(selectedEventId, ticketSelections);
    
    if (!reservationResult.success) {
      const result = reservationResult.result;
      const failedType = reservationResult.failedType;
      
      toast.error(
        <div className="text-right" dir="rtl">
          <div className="font-bold mb-2 flex items-center gap-2">
            <AlertTriangle className="h-5 w-5" />
            عدد التذاكر المطلوبة غير متاح
          </div>
          <div className="text-sm">
            {getTicketTypeName(failedType || '')}: {result?.message || 'غير متوفر'}
          </div>
          <div className="text-xs mt-2 text-muted-foreground">يرجى تعديل الكمية والمحاولة مرة أخرى</div>
        </div>,
        { duration: 6000 }
      );
      
      // Refresh availability display
      await fetchTicketAvailability();
      return;
    }


    // Validate all ticket holders - all must have complete information
    const allHoldersFilled = ticketHolders.every((holder, index) => {
      return holder.name && holder.phone && holder.nationality && holder.idNumber;
    });
    if (!allHoldersFilled) {
      toast.error("Please fill in information for all ticket holders");
      return;
    }
    setLoading(true);
    try {
      // Create customer - clean phone number first
      let cleanPhone = customerInfo.phone.replace(/[\s+]/g, '');
      const cleanCountryCode = customerInfo.countryCode.replace('+', '');
      if (cleanPhone.startsWith(cleanCountryCode)) {
        cleanPhone = cleanPhone.substring(cleanCountryCode.length);
      }
      
      const {
        data: customer,
        error: customerError
      } = await supabase.from("customers").insert({
        name: customerInfo.name,
        email: customerInfo.email,
        phone: cleanPhone,
        country_code: customerInfo.countryCode,
        nationality: customerInfo.nationality,
        id_number: customerInfo.idNumber
      }).select().single();
      if (customerError) throw customerError;

      // Get event ID from localStorage (stored during ticket selection)
      const selectedEventId = localStorage.getItem("selectedEventId");
      if (!selectedEventId) {
        throw new Error("No event selected");
      }

      // Create order
      const bookingRef = `QTR-${Math.random().toString(36).substring(2, 10).toUpperCase()}`;
      const totalQuantity = selections.reduce((sum, s) => sum + s.quantity, 0);
      const orderData = {
        customer_id: customer.id,
        event_id: selectedEventId,
        ticket_type: selections[0].type as "vip" | "normal" | "parking",
        quantity: totalQuantity,
        total_amount: calculateTotal(),
        payment_method: paymentMethod,
        booking_reference: bookingRef
      };
      const {
        data: order,
        error: orderError
      } = await supabase.from("orders").insert(orderData).select().single();
      if (orderError) throw orderError;

      // Create ticket holders first without QR codes for faster processing
      const holdersToInsert = ticketHolders.map((holder, index) => {
        const ticketRef = `${bookingRef}-TKT${(index + 1).toString().padStart(2, '0')}`;
        
        // Extract country code and clean phone number
        let holderPhone = holder.phone;
        let holderCountryCode = '+974';
        
        // Check if phone contains country code pattern (e.g., "+974 123", "974123", etc.)
        const phoneMatch = holderPhone.match(/^(\+?\d{2,4})[\s-]?(.+)$/);
        if (phoneMatch) {
          holderCountryCode = phoneMatch[1].startsWith('+') ? phoneMatch[1] : `+${phoneMatch[1]}`;
          holderPhone = phoneMatch[2].replace(/[\s-]/g, '');
        } else {
          // Clean any spaces/special chars
          holderPhone = holderPhone.replace(/[\s+]/g, '');
        }
        
        return {
          order_id: order.id,
          name: holder.name,
          phone: holderPhone,
          country_code: holderCountryCode,
          nationality: holder.nationality,
          ticket_type: holder.ticketType,
          qr_code: ticketRef,
          // Temporary placeholder
          id_number: holder.idNumber
        };
      });
      const {
        data: insertedHolders,
        error: holdersError
      } = await supabase.from("ticket_holders").insert(holdersToInsert).select();
      if (holdersError) throw holdersError;

      // Generate QR codes asynchronously in the background (non-blocking)
      if (insertedHolders) {
        Promise.all(insertedHolders.map(async (holder, index) => {
          try {
            const ticketRef = `${bookingRef}-TKT${(index + 1).toString().padStart(2, '0')}`;
            const {
              data: qrData
            } = await supabase.functions.invoke('generate-qr-code', {
              body: {
                text: ticketRef,
                filename: ticketRef
              }
            });
            if (qrData?.url) {
              await supabase.from("ticket_holders").update({
                qr_code: qrData.url
              }).eq('id', holder.id);
            }
          } catch (error) {
            console.error('Background QR generation failed for ticket:', error);
          }
        })).catch(err => console.error('QR batch generation error:', err));
      }

      // Handle Sadad payment - redirect to Sadad payment page
      if (paymentMethod === "sadad") {
        const orderItems = selections.map(s => ({
          name: getTicketTypeName(s.type),
          price: s.price,
          quantity: s.quantity
        }));
        const {
          data: paymentResponse,
          error: paymentError
        } = await supabase.functions.invoke('sadad-payment', {
          body: {
            orderId: order.booking_reference,
            orderData: {
              ...orderData,
              customer_email: customerInfo.email,
              customer_phone: customerInfo.phone,
              items: orderItems
            }
          }
        });
        if (paymentError) throw paymentError;
        if (!paymentResponse?.success) {
          throw new Error(paymentResponse?.error || 'Failed to initiate Sadad payment');
        }

        // Store payment data for form submission
        sessionStorage.setItem('sadadPaymentData', JSON.stringify({
          paymentData: paymentResponse.paymentData,
          sadadUrl: paymentResponse.sadadUrl
        }));

        // Store pending order ID for callback page (sessionStorage for tab isolation)
        sessionStorage.setItem('pendingOrderId', order.booking_reference);

        // Redirect to payment submission page
        navigate('/sadad-redirect');
        return;
      }

      // For cash/POS, proceed directly
      localStorage.setItem("orderIds", JSON.stringify([order.id]));
      localStorage.removeItem("ticketSelection");
      localStorage.removeItem("selectedEventId");

      // Call webhook asynchronously (non-blocking)
      (async () => {
        try {
          const {
            data: settings
          } = await supabase.from("settings").select("webhook_url, admin_phone").maybeSingle();
          if (settings?.webhook_url) {
            const formatPhoneNumber = (phone: string | null | undefined) => {
              if (!phone) return null;
              const cleanPhone = phone.replace(/[\+\s]/g, '');
              return cleanPhone.startsWith('974') ? cleanPhone : `974${cleanPhone}`;
            };
            await fetch(settings.webhook_url, {
              method: "POST",
              headers: {
                "Content-Type": "application/json"
              },
              body: JSON.stringify({
                customer: {
                  ...customer,
                  phone: formatPhoneNumber(customer.phone)
                },
                order,
                ticketHolders: holdersToInsert.map(h => ({
                  ...h,
                  phone: formatPhoneNumber(h.phone)
                })),
                bookingReference: bookingRef,
                adminPhone: formatPhoneNumber(settings.admin_phone),
                timestamp: new Date().toISOString()
              })
            });
          }
        } catch (error) {
          console.error("Webhook call failed:", error);
        }
      })();
      toast.success(t('bookingCreated'));
      navigate("/confirmation");
    } catch (error) {
      console.error("Error creating booking:", error);
      toast.error("Failed to create booking. Please try again.");
    } finally {
      setLoading(false);
    }
  };
  if (selections.length === 0) {
    return <div className="min-h-screen flex items-center justify-center font-lusail">
        <div className="animate-pulse text-lg">{t('loading')}</div>
      </div>;
  }
  return <div className="min-h-screen font-lusail" style={{ backgroundColor: '#F5EFE7' }}>
      {/* Header */}
      <header className="border-b backdrop-blur-sm sticky top-0 z-10 mb-4 sm:mb-6 md:mb-8" style={{
      backgroundColor: headerBgColor
    }}>
        <div className="container mx-auto px-3 sm:px-4 py-3 sm:py-4 flex justify-between items-center gap-2">
          {logoUrl ? <img src={logoUrl} alt="Logo" className="h-8 sm:h-10 md:h-12 object-contain cursor-pointer" onClick={() => navigate("/")} /> : <h1 className="text-lg sm:text-xl md:text-2xl font-bold cursor-pointer" onClick={() => navigate("/")}>
              فعاليات قطر
            </h1>}
          <Button variant="ghost" onClick={() => navigate("/")} className="text-xs sm:text-sm text-white hover:text-white">
            {t('backToHome') || 'العودة للرئيسية'}
          </Button>
        </div>
      </header>

      <div className="w-full py-4 sm:py-6 md:py-12 px-3 sm:px-4 md:px-8 lg:px-12 xl:px-16">
        <h1 className="text-2xl sm:text-3xl md:text-4xl font-bold mb-4 sm:mb-6 md:mb-8 text-center">{t('checkoutTitle')}</h1>

        {/* Order Summary - Top */}
        <Card className="p-4 sm:p-5 md:p-6 mb-4 sm:mb-6 md:mb-8">
          <h2 className="text-xl sm:text-2xl font-semibold mb-4 sm:mb-6">{t('orderSummary')}</h2>
          <div className="space-y-3 sm:space-y-4">
            {selections.map((item, index) => {
              const availability = ticketAvailability.find(a => a.ticketId === item.ticketId);
              const isLow = availability && availability.remaining <= 10;
              const isExceeding = availability && item.quantity > availability.remaining;
              
              return (
                <div key={index} className="py-2 sm:py-3 border-b">
                  <div className="flex justify-between items-center gap-4">
                    <div className="flex-1 min-w-0">
                      <div className="font-medium capitalize text-sm sm:text-base truncate">{getTicketTypeName(item.type)}</div>
                      <div className="text-xs sm:text-sm text-muted-foreground">{t('quantity')}: {item.quantity}</div>
                    </div>
                    <div className="flex items-center gap-2">
                      <div className="font-semibold text-sm sm:text-base flex-shrink-0">
                        {(item.price * item.quantity).toFixed(2)} {t('qar')}
                      </div>
                      <div className="flex items-center gap-1 border rounded-md">
                        <Button variant="ghost" size="icon" className="h-8 w-8 hover:bg-accent" onClick={() => handleDecreaseQuantity(index)}>
                          <Minus className="h-4 w-4" />
                        </Button>
                        <span className="px-2 text-sm font-medium min-w-[20px] text-center">{item.quantity}</span>
                        <Button variant="ghost" size="icon" className="h-8 w-8 hover:bg-accent" onClick={() => handleIncreaseQuantity(index)}>
                          <Plus className="h-4 w-4" />
                        </Button>
                      </div>
                    </div>
                  </div>
                  {/* Show remaining tickets */}
                  {availability && (
                    <div className={`text-xs mt-2 ${isExceeding ? 'text-destructive font-medium' : isLow ? 'text-amber-600' : 'text-muted-foreground'}`}>
                      {isExceeding ? (
                        <span className="flex items-center gap-1">
                          <AlertTriangle className="h-3 w-3" />
                          متاح {availability.remaining} فقط! يرجى تقليل الكمية
                        </span>
                      ) : (
                        `متبقي: ${availability.remaining} تذكرة`
                      )}
                    </div>
                  )}
                </div>
              );
            })}
            
            <div className="pt-3 sm:pt-4 border-t">
              <div className="flex justify-between items-center text-lg sm:text-xl font-bold gap-4">
                <span className="truncate">{t('totalAmount')}</span>
                <span className="text-primary flex-shrink-0">{calculateTotal().toFixed(2)} {t('qar')}</span>
              </div>
            </div>

            <div className="pt-3 sm:pt-4 text-xs sm:text-sm text-muted-foreground">
              <p>* {t('receiveEmail')}</p>
              <p className="mt-2">* {t('presentQR')}</p>
            </div>
          </div>
        </Card>

        <div className="grid lg:grid-cols-3 gap-4 sm:gap-6 md:gap-8">
          {/* Customer Information */}
          <div className="lg:col-span-2 space-y-4 sm:space-y-6">
            <Card className="p-4 sm:p-5 md:p-6">
              <div className="mb-4 sm:mb-6">
                <h2 className="text-xl sm:text-2xl font-semibold mb-2 flex items-center gap-2">
                  <span className="w-8 h-8 rounded-full bg-primary text-primary-foreground flex items-center justify-center text-sm">1</span>
                  {t('customerInfo')} - التذكرة الرئيسية
                  {ticketHolders.length > 0 && (
                    <span className="text-sm font-normal bg-primary/10 text-primary px-2 py-1 rounded">
                      {getTicketTypeName(ticketHolders[0]?.ticketType)}
                    </span>
                  )}
                </h2>
                <p className="text-sm text-muted-foreground">
                  هذه المعلومات للتذكرة الرئيسية وستحصل على QR Code خاص بها
                </p>
              </div>
              <form onSubmit={handleSubmit} className="space-y-4">
                <div>
                  <Label htmlFor="name">{t('fullName')} *</Label>
                  <Input 
                    id="name" 
                    name="name"
                    autoComplete="name"
                    value={customerInfo.name} 
                    onChange={e => setCustomerInfo({
                      ...customerInfo,
                      name: e.target.value.trim().substring(0, 100)
                    })} 
                    required 
                    minLength={3}
                    pattern=".{3,}"
                    title="اكتب اسمك الكامل الحقيقي"
                  />
                  {customerInfo.name.length > 0 && customerInfo.name.length < 3 && (
                    <p className="text-xs text-destructive mt-1">اكتب اسمك الكامل الحقيقي</p>
                  )}
                </div>
                <div>
                  <Label htmlFor="email">{t('email')}</Label>
                  <Input 
                    id="email" 
                    name="email"
                    type="email" 
                    autoComplete="email"
                    value={customerInfo.email} 
                    onChange={e => {
                      // Extract only valid email - strip any non-email text
                      const raw = e.target.value;
                      const emailMatch = raw.match(/[^\s]+@[^\s]+/);
                      const cleanEmail = emailMatch ? emailMatch[0] : raw.trim();
                      setCustomerInfo({
                        ...customerInfo,
                        email: cleanEmail
                      });
                    }} 
                  />
                </div>
                <div>
                  <Label htmlFor="nationality">{t('nationality')} *</Label>
                  <Select value={customerInfo.nationality} onValueChange={value => {
                  const countryCode = COUNTRY_CODES[value] || "+974";
                  setCustomerInfo({
                    ...customerInfo,
                    nationality: value,
                    countryCode: countryCode
                  });
                }} required dir="rtl">
                    <SelectTrigger id="nationality">
                      <SelectValue placeholder={t('nationality')} />
                    </SelectTrigger>
                    <SelectContent align="end">
                      {ARABIC_COUNTRIES.map(country => <SelectItem key={country} value={country}>
                          <span className="flex items-center gap-2">
                            <span>{COUNTRY_FLAGS[country]}</span>
                            <span>{country}</span>
                          </span>
                        </SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label htmlFor="phone">{t('phoneNumber')} *</Label>
                  <div className="flex gap-2">
                    <Select value={customerInfo.countryCode} onValueChange={value => setCustomerInfo({
                    ...customerInfo,
                    countryCode: value
                  })} dir="rtl">
                      <SelectTrigger className="w-[90px] sm:w-[110px] md:w-[120px]">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent align="end">
                        {ARABIC_COUNTRIES.map(country => <SelectItem key={country} value={COUNTRY_CODES[country]}>
                            <span className="flex items-center gap-2">
                              <span>{COUNTRY_FLAGS[country]}</span>
                              <span>{COUNTRY_CODES[country]}</span>
                            </span>
                          </SelectItem>)}
                      </SelectContent>
                    </Select>
                    <Input 
                      id="phone" 
                      type="tel" 
                      dir="rtl"
                      value={customerInfo.phone} 
                      onChange={e => {
                        // Convert Arabic numerals to English and remove any + or country code
                        let value = convertArabicToEnglishNumbers(e.target.value).replace(/[+\s]/g, '');
                        // For Qatar (+974), remove it if user tries to add it
                        if (customerInfo.countryCode === '+974' && value.startsWith('974')) {
                          value = value.substring(3);
                        }
                        // For Saudi Arabia (+966), remove it if user tries to add it
                        if (customerInfo.countryCode === '+966' && value.startsWith('966')) {
                          value = value.substring(3);
                        }
                        // For Saudi Arabia, remove leading 0 if present (local format)
                        if (customerInfo.countryCode === '+966' && value.startsWith('0')) {
                          value = value.substring(1);
                        }
                        // For UAE (+971), remove it if user tries to add it
                        if (customerInfo.countryCode === '+971' && value.startsWith('971')) {
                          value = value.substring(3);
                        }
                        // For UAE, remove leading 0 if present (local format)
                        if (customerInfo.countryCode === '+971' && value.startsWith('0')) {
                          value = value.substring(1);
                        }
                        // For Kuwait (+965), remove it if user tries to add it
                        if (customerInfo.countryCode === '+965' && value.startsWith('965')) {
                          value = value.substring(3);
                        }
                        // For Bahrain (+973), remove it if user tries to add it
                        if (customerInfo.countryCode === '+973' && value.startsWith('973')) {
                          value = value.substring(3);
                        }
                        setCustomerInfo({
                          ...customerInfo,
                          phone: value
                        });
                      }}
                      required 
                      className="flex-1"
                      placeholder={
                        customerInfo.countryCode === '+974' ? '8 أرقام' : 
                        customerInfo.countryCode === '+966' ? 'يبدأ بـ 5 (9 أرقام)' : 
                        customerInfo.countryCode === '+971' ? 'يبدأ بـ 5 (9 أرقام)' : 
                        customerInfo.countryCode === '+965' ? 'يبدأ بـ 5، 6، أو 9 (8 أرقام)' : 
                        customerInfo.countryCode === '+973' ? 'يبدأ بـ 3 (8 أرقام)' : 
                        t('phoneNumber')
                      }
                      maxLength={
                        customerInfo.countryCode === '+974' ? 8 : 
                        customerInfo.countryCode === '+966' ? 9 : 
                        customerInfo.countryCode === '+971' ? 9 : 
                        customerInfo.countryCode === '+965' ? 8 : 
                        customerInfo.countryCode === '+973' ? 8 : 
                        undefined
                      }
                    />
                  </div>
                  <p className="text-xs text-muted-foreground mt-1">بدون رمز الدولة</p>
                </div>
                <div>
                  <Label htmlFor="idNumber">رقم الهوية *</Label>
                  <Input id="idNumber" value={customerInfo.idNumber} onChange={e => setCustomerInfo({
                  ...customerInfo,
                  idNumber: e.target.value
                })} required placeholder="رقم الهوية" />
                </div>
              </form>
            </Card>

            {/* Ticket Holders Information - Only show if more than 1 ticket */}
            {ticketHolders.length > 1 && <Card className="p-4 sm:p-5 md:p-6">
                <div className="mb-4 sm:mb-6">
                  <h2 className="text-xl sm:text-2xl font-semibold mb-2">التذاكر الإضافية</h2>
                  <p className="text-sm text-muted-foreground">
                    كل تذكرة ستحصل على QR Code فريد خاص بها. يرجى إدخال معلومات كاملة لكل حامل تذكرة.
                  </p>
                </div>
                <div className="space-y-4 sm:space-y-6">
                  {ticketHolders.map((holder, index) => {
                // Skip rendering the first ticket holder since info is from customer
                if (index === 0) return null;
                return <div key={index} className="p-3 sm:p-4 border-2 border-primary/20 rounded-lg space-y-3 sm:space-y-4 bg-primary/5">
                        <div className="flex items-center justify-between mb-2">
                          <h3 className="font-semibold text-base sm:text-lg flex items-center gap-2">
                            <span className="w-8 h-8 rounded-full bg-primary text-primary-foreground flex items-center justify-center text-sm">
                              {index + 1}
                            </span>
                            تذكرة #{index + 1} - {getTicketTypeName(holder.ticketType)}
                          </h3>
                          <span className="text-xs bg-primary/10 text-primary px-2 py-1 rounded">QR Code مستقل</span>
                        </div>
                        <div className="grid sm:grid-cols-2 gap-3 sm:gap-4">
                          <div>
                            <Label htmlFor={`holder-name-${index}`}>{t('fullName')} *</Label>
                            <Input id={`holder-name-${index}`} value={holder.name} onChange={e => updateTicketHolder(index, 'name', e.target.value)} required placeholder={t('fullName')} />
                          </div>
                          <div>
                            <Label htmlFor={`holder-nationality-${index}`}>{t('nationality')} *</Label>
                            <Select value={holder.nationality} onValueChange={value => {
                        const countryCode = COUNTRY_CODES[value] || "";
                        const currentPhone = holder.phone;
                        // Remove any existing country code from phone
                        const phoneWithoutCode = currentPhone.replace(/^\+\d+\s*/, "");
                        const updated = [...ticketHolders];
                        updated[index] = {
                          ...updated[index],
                          nationality: value,
                          phone: countryCode ? `${countryCode} ${phoneWithoutCode}` : phoneWithoutCode
                        };
                        setTicketHolders(updated);
                      }} required dir="rtl">
                              <SelectTrigger id={`holder-nationality-${index}`}>
                                <SelectValue placeholder={t('nationality')} />
                              </SelectTrigger>
                              <SelectContent align="end">
                                {ARABIC_COUNTRIES.map(country => <SelectItem key={country} value={country}>
                                    <span className="flex items-center gap-2">
                                      <span>{COUNTRY_FLAGS[country]}</span>
                                      <span>{country}</span>
                                    </span>
                                  </SelectItem>)}
                              </SelectContent>
                            </Select>
                          </div>
                          <div>
                            <Label htmlFor={`holder-idNumber-${index}`}>رقم الهوية *</Label>
                            <Input id={`holder-idNumber-${index}`} value={holder.idNumber} onChange={e => updateTicketHolder(index, 'idNumber', e.target.value)} required placeholder="رقم الهوية" />
                          </div>
                          <div>
                            <Label htmlFor={`holder-phone-${index}`}>{t('phone')} *</Label>
                            <Input 
                              id={`holder-phone-${index}`} 
                              type="tel" 
                              dir="rtl"
                              value={holder.phone.replace(/^\+\d+\s*/, "")}
                              onChange={e => {
                                const countryCode = COUNTRY_CODES[holder.nationality] || "+974";
                                // Convert Arabic numerals to English and remove any + or country code
                                let value = convertArabicToEnglishNumbers(e.target.value).replace(/[+\s]/g, '');
                                // For Qatar (+974), remove it if user tries to add it
                                if (countryCode === '+974' && value.startsWith('974')) {
                                  value = value.substring(3);
                                }
                                // For Saudi Arabia (+966), remove it if user tries to add it
                                if (countryCode === '+966' && value.startsWith('966')) {
                                  value = value.substring(3);
                                }
                                // For Saudi Arabia, remove leading 0 if present (local format)
                                if (countryCode === '+966' && value.startsWith('0')) {
                                  value = value.substring(1);
                                }
                                // For UAE (+971), remove it if user tries to add it
                                if (countryCode === '+971' && value.startsWith('971')) {
                                  value = value.substring(3);
                                }
                                // For UAE, remove leading 0 if present (local format)
                                if (countryCode === '+971' && value.startsWith('0')) {
                                  value = value.substring(1);
                                }
                                // For Kuwait (+965), remove it if user tries to add it
                                if (countryCode === '+965' && value.startsWith('965')) {
                                  value = value.substring(3);
                                }
                                // For Bahrain (+973), remove it if user tries to add it
                                if (countryCode === '+973' && value.startsWith('973')) {
                                  value = value.substring(3);
                                }
                                updateTicketHolder(index, 'phone', `${countryCode} ${value}`);
                              }}
                              required 
                              placeholder={
                                COUNTRY_CODES[holder.nationality] === '+974' ? '8 أرقام' : 
                                COUNTRY_CODES[holder.nationality] === '+966' ? 'يبدأ بـ 5 (9 أرقام)' : 
                                COUNTRY_CODES[holder.nationality] === '+971' ? 'يبدأ بـ 5 (9 أرقام)' : 
                                COUNTRY_CODES[holder.nationality] === '+965' ? 'يبدأ بـ 5، 6، أو 9 (8 أرقام)' : 
                                COUNTRY_CODES[holder.nationality] === '+973' ? 'يبدأ بـ 3 (8 أرقام)' : 
                                t('phone')
                              }
                              maxLength={
                                COUNTRY_CODES[holder.nationality] === '+974' ? 8 : 
                                COUNTRY_CODES[holder.nationality] === '+966' ? 9 : 
                                COUNTRY_CODES[holder.nationality] === '+971' ? 9 : 
                                COUNTRY_CODES[holder.nationality] === '+965' ? 8 : 
                                COUNTRY_CODES[holder.nationality] === '+973' ? 8 : 
                                undefined
                              }
                            />
                            <p className="text-xs text-muted-foreground mt-1">بدون رمز الدولة</p>
                          </div>
                        </div>
                      </div>;
              })}
                </div>
              </Card>}

            {/* Terms and Conditions */}
            <Card className="p-4 sm:p-5 md:p-6 border-red-500 border-2 bg-red-50">
              <div className="flex items-start gap-3 mb-4">
                <AlertTriangle className="w-6 h-6 text-red-600 flex-shrink-0 mt-0.5" />
                <h3 className="text-lg font-semibold text-red-600">التعليمات</h3>
              </div>
              <ul className="space-y-2 text-red-600 text-sm sm:text-base mb-4 pr-4" dir="rtl">
                <li>1- التذكرة المباعة غير قابلة للتعديل او الإستبدال او إسترجاع قيمتها</li>
                <li>2- ممنوع دخول الأطفال دون 10 سنوات</li>
                <li>3- يكون إستخدام التذاكر للدخول مرة واحدة فقط</li>
              </ul>
              <Button
                type="button"
                variant="outline"
                onClick={() => setTermsAccepted(!termsAccepted)}
                className={`w-full mt-2 py-6 text-base font-bold transition-all ${
                  termsAccepted 
                    ? "bg-green-600 hover:bg-green-700 text-white border-green-600" 
                    : "bg-red-600 hover:bg-red-700 text-white border-red-600 animate-pulse"
                }`}
              >
                {termsAccepted ? "✓ تم الموافقة على التعليمات" : "اضغط هنا للموافقة وإتمام عملية الدفع"}
              </Button>
            </Card>

            {/* Payment Method */}
            <Card className="p-4 sm:p-5 md:p-6">
              <h3 className="text-base sm:text-lg font-semibold mb-3 sm:mb-4">{t('selectPaymentMethod')}</h3>
              <RadioGroup value={paymentMethod} onValueChange={(value: any) => setPaymentMethod(value)} className="space-y-3" dir="rtl">
                <div className="flex items-center gap-3 p-3 sm:p-4 border rounded-lg hover:bg-accent cursor-pointer">
                  <RadioGroupItem value="sadad" id="sadad" />
                  <Label htmlFor="sadad" className="flex items-center gap-2 cursor-pointer flex-1">
                    <CreditCard className="w-4 h-4 sm:w-5 sm:h-5 text-primary flex-shrink-0" />
                    <div className="text-right">
                      <div className="font-medium text-sm sm:text-base">{t('sadadOnline')}</div>
                      <div className="text-xs sm:text-sm text-muted-foreground">{t('sadadOnline')}</div>
                    </div>
                  </Label>
                </div>
                <div className="hidden flex items-center gap-3 p-3 sm:p-4 border rounded-lg hover:bg-accent cursor-pointer">
                  <RadioGroupItem value="cash_pos" id="cash_pos" />
                  <Label htmlFor="cash_pos" className="flex items-center gap-2 cursor-pointer flex-1">
                    <Banknote className="w-4 h-4 sm:w-5 sm:h-5 text-secondary flex-shrink-0" />
                    <div className="text-right">
                      <div className="font-medium text-sm sm:text-base">{t('cashAtVenue')}</div>
                      <div className="text-xs sm:text-sm text-muted-foreground">{t('cashAtVenue')}</div>
                    </div>
                  </Label>
                </div>
              </RadioGroup>
            </Card>

            <Button 
              onClick={(e) => {
                if (!termsAccepted) {
                  toast.error("يرجى الموافقة على التعليمات أولاً قبل إتمام الحجز");
                  return;
                }
                handleSubmit(e);
              }} 
              className="w-full" 
              size="lg" 
              disabled={loading || !termsAccepted}
            >
              {loading ? <>
                  <Loader2 className="w-4 h-4 ml-2 animate-spin" />
                  {t('loading')}
                </> : t('completeBooking')}
            </Button>
          </div>

          {/* Back to Tickets */}
          <div className="lg:col-span-1">
            <div className="text-center lg:sticky lg:top-20">
              <Button variant="ghost" onClick={() => navigate(`/tickets/${localStorage.getItem("selectedEventId") || ""}`)} className="w-full text-sm sm:text-base bg-yellow-500 hover:bg-yellow-600 text-black">
                {t('backToTickets')}
              </Button>
            </div>
          </div>
        </div>
      </div>

      {/* Before Footer Image */}
      {settings?.before_footer_image_url && (
        <div className="relative w-full">
          <div 
            className="absolute inset-0 pointer-events-none"
            style={{ background: 'linear-gradient(to bottom, rgba(245, 239, 231, 0.8), rgba(245, 239, 231, 0.4))' }}
          />
          <img
            src={settings.before_footer_image_url}
            alt="Before Footer"
            className="w-full h-auto object-contain"
            loading="lazy"
          />
        </div>
      )}

      <Footer />
    </div>;
};
export default Checkout;