import { useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Loader2 } from "lucide-react";

const SadadRedirect = () => {
  const navigate = useNavigate();
  const formRef = useRef<HTMLFormElement>(null);
  const hasSubmitted = useRef(false);
  const [paymentInfo, setPaymentInfo] = useState<{ paymentData: any; sadadUrl: string } | null>(null);

  useEffect(() => {
    if (hasSubmitted.current) return;
    
    const paymentDataStr = sessionStorage.getItem('sadadPaymentData');
    
    if (!paymentDataStr) {
      console.log('No payment data found, redirecting to checkout');
      navigate('/checkout');
      return;
    }

    try {
      const data = JSON.parse(paymentDataStr);
      setPaymentInfo(data);
      
      console.log('Payment data received:', {
        sadadUrl: data.sadadUrl,
        merchant_id: data.paymentData.merchant_id,
        order_id: data.paymentData.ORDER_ID,
        amount: data.paymentData.TXN_AMOUNT,
        checksumhash: data.paymentData.checksumhash?.substring(0, 20) + '...'
      });
      
      // Clear the session storage
      sessionStorage.removeItem('sadadPaymentData');
      
      // Submit form after brief delay
      setTimeout(() => {
        if (formRef.current && !hasSubmitted.current) {
          hasSubmitted.current = true;
          
          console.log('Submitting form to Sadad...');
          
          // Submit in same window (don't use _blank to avoid popup blockers)
          formRef.current.submit();
        }
      }, 500);
    } catch (error) {
      console.error('Error processing payment data:', error);
      navigate('/checkout');
    }
  }, [navigate]);

  if (!paymentInfo) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center p-4 font-lusail">
        <div className="text-center">
          <Loader2 className="w-16 h-16 animate-spin mx-auto mb-4 text-primary" />
          <h2 className="text-2xl font-bold mb-2">جاري التحميل...</h2>
        </div>
      </div>
    );
  }

  const { paymentData, sadadUrl } = paymentInfo;

  return (
    <div className="min-h-screen bg-background flex items-center justify-center p-4 font-lusail">
      <div className="text-center space-y-4 max-w-2xl">
        <Loader2 className="w-16 h-16 animate-spin mx-auto mb-4 text-primary" />
        <h2 className="text-2xl font-bold mb-2">جاري تحويلك لبوابة الدفع</h2>
        <p className="text-muted-foreground">سيتم فتح نافذة جديدة للدفع...</p>
        
        <div className="mt-8 p-4 bg-red-50 border border-red-200 rounded-lg text-right">
          <h3 className="font-bold text-red-800 mb-2">إذا ظهرت رسالة 404:</h3>
          <div className="text-sm text-red-700 space-y-2">
            <p className="font-semibold">السبب الأساسي: وضع الاختبار غير مفعّل في لوحة سداد</p>
            
            <div className="bg-white p-3 rounded border border-red-300 mt-2">
              <p className="font-bold mb-2">خطوات الحل:</p>
              <ol className="list-decimal list-inside space-y-1 text-right">
                <li>افتح لوحة التاجر: <a href="https://webpanel.sadad.qa/authentication/login" target="_blank" className="text-blue-600 underline">webpanel.sadad.qa</a></li>
                <li>اذهب إلى قسم "API" من القائمة اليسرى</li>
                <li>فعّل زر "Test Mode" (وضع الاختبار)</li>
                <li>تأكد من صحة معرف التاجر والمفتاح السري</li>
                <li>حاول الدفع مرة أخرى</li>
              </ol>
            </div>
            
            <p className="text-xs mt-2">ملاحظة: بدون تفعيل وضع الاختبار، لن تعمل بوابة الدفع حتى لو كانت جميع الإعدادات صحيحة</p>
          </div>
        </div>

        {/* Debug info */}
        <details className="mt-4 text-left bg-gray-50 p-4 rounded border">
          <summary className="cursor-pointer font-semibold">معلومات التصحيح (للدعم الفني)</summary>
          <div className="mt-2 text-xs font-mono space-y-1">
            <div>Merchant ID: {paymentData.merchant_id}</div>
            <div>Order ID: {paymentData.ORDER_ID}</div>
            <div>Amount: {paymentData.TXN_AMOUNT} QAR</div>
            <div>URL: {sadadUrl}</div>
            <div>Checksum: {paymentData.checksumhash?.substring(0, 30)}...</div>
          </div>
        </details>
        
        {/* Hidden form that will auto-submit in new window */}
        <form 
          ref={formRef}
          method="POST" 
          action={sadadUrl}
          style={{ display: 'none' }}
        >
          {Object.entries(paymentData).map(([key, value]) => {
            if (key === 'productdetail' && Array.isArray(value)) {
              return value.map((product: any, index: number) => 
                Object.entries(product).map(([pKey, pValue]) => (
                  <input
                    key={`${key}-${index}-${pKey}`}
                    type="hidden"
                    name={`productdetail[${index}][${pKey}]`}
                    value={String(pValue)}
                  />
                ))
              );
            }
            return (
              <input
                key={key}
                type="hidden"
                name={key}
                value={String(value)}
              />
            );
          })}
        </form>
      </div>
    </div>
  );
};

export default SadadRedirect;
