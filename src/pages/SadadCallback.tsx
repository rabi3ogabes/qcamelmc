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
      const urlParams = new URLSearchParams(window.location.search);
      const status = urlParams.get('status');
      const orderId = urlParams.get('orderId');

      console.log('Callback received:', { status, orderId });

      if (!orderId) {
        throw new Error('No order ID received');
      }

      // Check order status from database
      const { data: orderData, error: orderError } = await supabase
        .from('orders')
        .select('id, payment_status, payment_id')
        .eq('booking_reference', orderId)
        .single();

      if (orderError) throw orderError;

      if (orderData.payment_status === 'confirmed') {
        setStatus('success');
        setMessage('تم الدفع بنجاح!');
        
        // Store order ID and redirect to confirmation after 2 seconds
        setTimeout(() => {
          localStorage.setItem("orderIds", JSON.stringify([orderData.id]));
          navigate("/confirmation");
        }, 2000);
      } else {
        setStatus('failed');
        setMessage('فشلت عملية الدفع');
      }
    } catch (error) {
      console.error('Error processing callback:', error);
      setStatus('failed');
      setMessage('حدث خطأ أثناء معالجة الدفع');
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
