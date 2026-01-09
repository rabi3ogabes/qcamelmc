import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Loader2, CheckCircle2, XCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";

const SadadCallback = () => {
  const [status, setStatus] = useState<'processing' | 'success' | 'failed'>('processing');
  const [message, setMessage] = useState('جاري معالجة الدفع...');
  const navigate = useNavigate();

  useEffect(() => {
    handleCallback();
  }, []);

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
      
      // Use URL parameter if available, otherwise use localStorage
      if (urlOrderId) {
        orderId = urlOrderId;
      }

      console.log('Processing order ID:', orderId);
      
      if (!orderId) {
        console.error('No order ID found in localStorage or URL');
        throw new Error('لم يتم العثور على رقم الطلب');
      }

      // Poll the order status since webhook processes it in background
      let attempts = 0;
      const maxAttempts = 10;
      let order = null;

      while (attempts < maxAttempts) {
        const { data, error } = await supabase
          .from('orders')
          .select('*')
          .eq('booking_reference', orderId)
          .maybeSingle();

        if (error) {
          console.error('Error fetching order:', error);
          throw error;
        }

        if (data && data.payment_status !== 'pending') {
          order = data;
          break;
        }

        // Wait 1 second before retrying
        await new Promise(resolve => setTimeout(resolve, 1000));
        attempts++;
      }

      if (!order) {
        throw new Error('لم يتم العثور على الطلب');
      }

      // Check payment status
      const isSuccess = order.payment_status === 'confirmed';

      if (isSuccess) {
        setStatus('success');
        setMessage('تم الدفع بنجاح!');
        
        // Store order info for confirmation page
        localStorage.setItem('orderIds', JSON.stringify([order.id]));
        sessionStorage.removeItem('pendingOrderId'); // Clean up
        
        // Redirect to confirmation page after a short delay
        setTimeout(() => {
          navigate('/confirmation');
        }, 2000);
      } else {
        setStatus('failed');
        setMessage('لم يتم تأكيد الدفع. يرجى التواصل مع الدعم إذا تم خصم المبلغ.');
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
          </>
        )}

        {status === 'success' && (
          <>
            <CheckCircle2 className="w-16 h-16 mx-auto mb-4 text-green-500" />
            <h2 className="text-2xl font-bold mb-2 text-green-600">نجحت العملية!</h2>
            <p className="text-muted-foreground mb-4">{message}</p>
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
