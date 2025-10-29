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
      
      // Collect all parameters from URL - Sadad sends payment data as query parameters
      const allParams = Object.fromEntries(urlParams.entries());
      console.log('Sadad callback received with params:', allParams);

      // Try to get order ID from various possible parameter names
      const orderId = urlParams.get('ORDERID') || 
                     urlParams.get('ORDER_ID') || 
                     urlParams.get('orderId') ||
                     urlParams.get('websiteRefNo');
      
      if (!orderId) {
        console.error('No order ID in URL params:', allParams);
        throw new Error('لم يتم استلام رقم الطلب من سداد');
      }

      // Forward the payment data to the webhook for processing
      const webhookData = {
        ORDERID: orderId,
        ORDER_ID: orderId,
        websiteRefNo: orderId,
        STATUS: urlParams.get('STATUS') || urlParams.get('status') || urlParams.get('RESPCODE'),
        RESPCODE: urlParams.get('RESPCODE') || urlParams.get('STATUS'),
        transactionStatus: urlParams.get('transactionStatus') || urlParams.get('STATUS'),
        TXNID: urlParams.get('TXNID') || urlParams.get('txnId') || urlParams.get('transactionNumber'),
        transactionNumber: urlParams.get('transactionNumber') || urlParams.get('TXNID'),
        RESPMSG: urlParams.get('RESPMSG') || urlParams.get('message'),
        message: urlParams.get('message') || urlParams.get('RESPMSG'),
        TXNAMOUNT: urlParams.get('TXNAMOUNT') || urlParams.get('txnAmount'),
        txnAmount: urlParams.get('txnAmount') || urlParams.get('TXNAMOUNT'),
        MID: urlParams.get('MID') || urlParams.get('merchantId'),
        merchantId: urlParams.get('merchantId') || urlParams.get('MID'),
        CHECKSUMHASH: urlParams.get('CHECKSUMHASH') || urlParams.get('checksumhash') || urlParams.get('signature'),
        checksumhash: urlParams.get('checksumhash') || urlParams.get('CHECKSUMHASH'),
        isTestMode: urlParams.get('isTestMode') || urlParams.get('TESTMODE'),
        // Include all other parameters
        ...allParams
      };

      console.log('Calling webhook with data:', webhookData);

      // Call the webhook edge function to process the payment
      const { data: webhookResponse, error: webhookError } = await supabase.functions.invoke('sadad-webhook', {
        body: webhookData
      });

      if (webhookError) {
        console.error('Webhook error:', webhookError);
        throw new Error('فشل في معالجة الدفع: ' + webhookError.message);
      }

      console.log('Webhook response:', webhookResponse);

      // Fetch the updated order
      const { data: order, error: orderError } = await supabase
        .from('orders')
        .select('*')
        .eq('booking_reference', orderId)
        .single();

      if (orderError) {
        console.error('Error fetching order:', orderError);
        throw orderError;
      }

      // Check payment status
      const isSuccess = order.payment_status === 'confirmed';

      if (isSuccess) {
        setStatus('success');
        setMessage('تم الدفع بنجاح!');
        
        // Store order info for confirmation page
        localStorage.setItem('orderIds', JSON.stringify([order.id]));
        
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
