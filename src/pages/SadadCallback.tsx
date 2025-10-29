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
      
      // Sadad sends parameters with specific field names
      // Try different possible parameter names that Sadad might use
      const orderId = urlParams.get('ORDERID') || 
                     urlParams.get('ORDER_ID') || 
                     urlParams.get('orderId');
      const txnStatus = urlParams.get('STATUS') || 
                       urlParams.get('RESPCODE') || 
                       urlParams.get('status');
      const txnId = urlParams.get('TXNID') || 
                   urlParams.get('transactionNumber') ||
                   urlParams.get('txnId');

      console.log('Sadad callback received:', { orderId, txnStatus, txnId, allParams: Object.fromEntries(urlParams) });

      if (!orderId) {
        throw new Error('No order ID received from Sadad');
      }

      // Determine if payment was successful
      // Sadad typically uses: '1' or 'TXN_SUCCESS' for success, '0' or other codes for failure
      const isSuccess = txnStatus === '1' || 
                       txnStatus === 'TXN_SUCCESS' || 
                       txnStatus === '3' ||
                       txnStatus === 'success';

      // Update order status in database
      const { error: updateError } = await supabase
        .from('orders')
        .update({
          payment_status: isSuccess ? 'confirmed' : 'cancelled',
          payment_id: txnId || null,
          confirmed_at: isSuccess ? new Date().toISOString() : null
        })
        .eq('booking_reference', orderId);

      if (updateError) {
        console.error('Error updating order:', updateError);
        throw updateError;
      }

      // Fetch updated order data
      const { data: orderData, error: orderError } = await supabase
        .from('orders')
        .select('id, payment_status, payment_id')
        .eq('booking_reference', orderId)
        .single();

      if (orderError) throw orderError;

      if (isSuccess && orderData.payment_status === 'confirmed') {
        setStatus('success');
        setMessage('تم الدفع بنجاح!');
        
        // Store order ID and redirect to confirmation after 2 seconds
        setTimeout(() => {
          localStorage.setItem("orderIds", JSON.stringify([orderData.id]));
          navigate("/confirmation");
        }, 2000);
      } else {
        setStatus('failed');
        setMessage('فشلت عملية الدفع. حالة المعاملة: ' + (txnStatus || 'غير معروف'));
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
