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
      // Get callback data from URL parameters (POST data will be in the form)
      const urlParams = new URLSearchParams(window.location.search);
      
      // In production, you would get POST data from the form submission
      // For now, we'll check URL parameters
      const orderId = urlParams.get('ORDERID');
      const respCode = urlParams.get('RESPCODE');
      const respMsg = urlParams.get('RESPMSG');
      const txnAmount = urlParams.get('TXNAMOUNT');
      const transactionNumber = urlParams.get('transaction_number');

      if (!orderId) {
        throw new Error('No order ID received');
      }

      // Update order status based on response code
      if (respCode === '1') {
        // Success
        const { error } = await supabase
          .from('orders')
          .update({ 
            payment_status: 'confirmed',
            payment_id: transactionNumber || undefined
          })
          .eq('booking_reference', orderId);

        if (error) throw error;

        setStatus('success');
        setMessage('تم الدفع بنجاح!');
        
        // Store order ID and redirect to confirmation after 2 seconds
        setTimeout(() => {
          supabase
            .from('orders')
            .select('id')
            .eq('booking_reference', orderId)
            .single()
            .then(({ data }) => {
              if (data) {
                localStorage.setItem("orderIds", JSON.stringify([data.id]));
                navigate("/confirmation");
              }
            });
        }, 2000);
      } else {
        // Failed or pending
        setStatus('failed');
        setMessage(respMsg || 'فشلت عملية الدفع');
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
