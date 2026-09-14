import { useEffect, useState, useRef } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Loader2, CheckCircle2, XCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";

const SadadCallback = () => {
  const [status, setStatus] = useState<'processing' | 'success' | 'failed'>('processing');
  const [message, setMessage] = useState('جاري معالجة الدفع...');
  const [attempts, setAttempts] = useState(0);
  const [eventInfo, setEventInfo] = useState('');
  const navigate = useNavigate();
  const subscriptionRef = useRef<ReturnType<typeof supabase.channel> | null>(null);
  const hasConfirmedRef = useRef(false);

  useEffect(() => {
    handleCallback();
    
    return () => {
      // Cleanup subscription on unmount
      if (subscriptionRef.current) {
        supabase.removeChannel(subscriptionRef.current);
      }
    };
  }, []);

  const handleSuccess = async (orderId: string) => {
    if (hasConfirmedRef.current) return;
    hasConfirmedRef.current = true;
    
    // Fetch event info for the success message
    try {
      const { data: orderData } = await supabase.rpc('get_public_order', { p_order_id: orderId }) as { data: any };
      
      if (orderData?.events) {
        const evt = orderData.events as any;
        const d = new Date(evt.event_date + 'T00:00:00');
        const dateStr = d.toLocaleDateString('ar-u-nu-latn', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' });
        setEventInfo(`${evt.title} - ${dateStr}`);
      }
    } catch (e) {
      console.error('Error fetching event info:', e);
    }
    
    setStatus('success');
    setMessage('تم الدفع بنجاح!');
    
    // Clean up subscription
    if (subscriptionRef.current) {
      supabase.removeChannel(subscriptionRef.current);
    }
    
    // Store order info for confirmation page
    localStorage.setItem('orderIds', JSON.stringify([orderId]));
    sessionStorage.removeItem('pendingOrderId');
    
    // Move to the invoice page quickly so the customer can download it
    setTimeout(() => {
      navigate('/confirmation');
    }, 2000);
  };

  const handleCallback = async () => {
    try {
      // Try to get order ID from sessionStorage first (set during checkout, tab-isolated)
      const orderIdsString = sessionStorage.getItem('pendingOrderId');
      let orderId = orderIdsString;

      // Also check URL parameters as fallback
      const urlParams = new URLSearchParams(window.location.search);
      const urlOrderId = urlParams.get('ORDERID') || 
                        urlParams.get('ORDER_ID') || 
                        urlParams.get('orderId') ||
                        urlParams.get('websiteRefNo');
      
      // Use URL parameter if available, otherwise use sessionStorage
      if (urlOrderId) {
        orderId = urlOrderId;
      }

      console.log('Processing order ID:', orderId);
      
      if (!orderId) {
        console.error('No order ID found in sessionStorage or URL');
        throw new Error('لم يتم العثور على رقم الطلب');
      }

      // CRITICAL FIX: Immediately call the webhook with URL params
      // Since Sadad's server-to-server webhook is unreliable, we process payment client-side first
      if (urlParams.toString()) {
        console.log('URL params detected - immediately calling webhook to process payment');
        try {
          const webhookPayload: Record<string, string> = {};
          for (const [key, value] of urlParams.entries()) {
            webhookPayload[key] = value;
          }
          if (!webhookPayload.ORDERID && !webhookPayload.ORDER_ID && !webhookPayload.websiteRefNo) {
            webhookPayload.websiteRefNo = orderId;
          }

          const { data: funcData, error: funcError } = await supabase.functions.invoke('sadad-webhook', {
            body: webhookPayload,
          });
          
          console.log('Immediate webhook response:', funcData, funcError);
          
          // Check if webhook confirmed the payment
          if (funcData?.payment_status === 'confirmed') {
            // Fetch order ID (not booking_reference) for handleSuccess
            const { data: confirmedOrder } = await supabase.rpc('get_public_order', { p_booking_reference: orderId }) as { data: any };
            
            if (confirmedOrder) {
              handleSuccess(confirmedOrder.id);
              return;
            }
          }
        } catch (immediateError) {
          console.error('Immediate webhook call failed, will fall back to polling:', immediateError);
        }
      }

      // Set up real-time subscription for instant updates
      subscriptionRef.current = supabase
        .channel(`order-${orderId}`)
        .on(
          'postgres_changes',
          {
            event: 'UPDATE',
            schema: 'public',
            table: 'orders',
            filter: `booking_reference=eq.${orderId}`
          },
          (payload) => {
            console.log('Real-time update received:', payload);
            const newStatus = payload.new?.payment_status;
            if (newStatus === 'confirmed' && !hasConfirmedRef.current) {
              handleSuccess(payload.new.id);
            } else if (newStatus === 'cancelled' && !hasConfirmedRef.current) {
              hasConfirmedRef.current = true;
              setStatus('failed');
              setMessage('لم يتم تأكيد الدفع. يرجى التواصل مع الدعم إذا تم خصم المبلغ.');
            }
          }
        )
        .subscribe();

      // Poll the order status (15 attempts = 15 seconds, reduced since we already called webhook)
      const maxAttempts = 15;
      let currentAttempt = 0;

      while (currentAttempt < maxAttempts && !hasConfirmedRef.current) {
        currentAttempt++;
        setAttempts(currentAttempt);
        
        const { data, error } = await supabase.rpc('get_public_order', { p_booking_reference: orderId }) as { data: any; error: any };

        if (error) {
          console.error('Error fetching order:', error);
          throw error;
        }

        if (data && data.payment_status === 'confirmed') {
          handleSuccess(data.id);
          return;
        }

        if (data && data.payment_status === 'cancelled') {
          setStatus('failed');
          setMessage(data.payment_error_reason || 'لم يتم تأكيد الدفع. يرجى التواصل مع الدعم إذا تم خصم المبلغ.');
          void logOrderFailure(data, data.payment_error_reason, 'PAYMENT_CANCELLED');
          return;
        }

        if (currentAttempt > 5) {
          setMessage(`جاري التحقق من حالة الدفع... (${currentAttempt}/${maxAttempts})`);
        }

        await new Promise(resolve => setTimeout(resolve, 1000));
      }

      // Final check
      if (!hasConfirmedRef.current) {
        const { data: finalCheck } = await supabase.rpc('get_public_order', { p_booking_reference: orderId }) as { data: any };

        if (finalCheck?.payment_status === 'confirmed') {
          handleSuccess(finalCheck.id);
          return;
        }

        if (finalCheck?.payment_status === 'pending') {
          setStatus('failed');
          setMessage('الدفع قيد المعالجة. إذا تم خصم المبلغ، سيتم تأكيد الطلب تلقائياً. يرجى التحقق من بريدك الإلكتروني أو التواصل مع الدعم.');
        } else if (finalCheck?.payment_status === 'cancelled') {
          setStatus('failed');
          setMessage(finalCheck.payment_error_reason || 'لم يتم تأكيد الدفع. يرجى التواصل مع الدعم إذا تم خصم المبلغ.');
        } else {
          setStatus('failed');
          setMessage('لم يتم العثور على الطلب. يرجى التواصل مع الدعم.');
        }
      }
    } catch (error) {
      console.error('Error processing callback:', error);
      setStatus('failed');
      setMessage(error instanceof Error ? error.message : 'حدث خطأ أثناء معالجة الدفع');
    }
  };

  return (
    <div className="min-h-screen bg-background flex items-center justify-center p-4 font-lusail">
      <Card className="w-full max-w-md p-8 text-center">
        {status === 'processing' && (
          <>
            <Loader2 className="w-16 h-16 animate-spin mx-auto mb-4 text-primary" />
            <h2 className="text-2xl font-bold mb-2">جاري المعالجة</h2>
            <p className="text-muted-foreground">{message}</p>
            {attempts > 0 && (
              <p className="text-xs text-muted-foreground mt-2">
                محاولة {attempts} من 30
              </p>
            )}
          </>
        )}

        {status === 'success' && (
          <>
            <CheckCircle2 className="w-16 h-16 mx-auto mb-4 text-green-500" />
            <h2 className="text-2xl font-bold mb-2 text-green-600">نجحت العملية!</h2>
            <p className="text-muted-foreground mb-2">{message}</p>
            {eventInfo && (
              <p className="text-sm font-semibold text-primary mb-4">{eventInfo}</p>
            )}
            <p className="text-sm text-muted-foreground">سيتم تحويلك إلى صفحة التأكيد...</p>
          </>
        )}

        {status === 'failed' && (
          <>
            <XCircle className="w-16 h-16 mx-auto mb-4 text-red-500" />
            <h2 className="text-2xl font-bold mb-2 text-red-600">فشلت العملية</h2>
            <p className="text-muted-foreground mb-6">{message}</p>
            <div className="space-y-2">
              <Button onClick={() => navigate("/checkout")} className="w-full">
                إعادة المحاولة
              </Button>
              <Button onClick={() => navigate("/")} variant="outline" className="w-full">
                العودة للرئيسية
              </Button>
            </div>
          </>
        )}
      </Card>
    </div>
  );
};

export default SadadCallback;
