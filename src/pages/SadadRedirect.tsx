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
      
      // Create form HTML and open in new window via blob URL
      setTimeout(() => {
        if (!hasSubmitted.current) {
          hasSubmitted.current = true;
          
          console.log('Submitting form to Sadad...');
          
          // Build form HTML
          let formHtml = `<!DOCTYPE html>
<html dir="rtl">
<head>
  <meta charset="UTF-8">
  <title>جاري تحويلك لبوابة الدفع...</title>
  <style>
    body { font-family: Arial, sans-serif; text-align: center; padding: 50px; }
    .loader { border: 5px solid #f3f3f3; border-top: 5px solid #9c1638; 
              border-radius: 50%; width: 50px; height: 50px; 
              animation: spin 1s linear infinite; margin: 20px auto; }
    @keyframes spin { 0% { transform: rotate(0deg); } 100% { transform: rotate(360deg); } }
  </style>
</head>
<body>
  <div class="loader"></div>
  <h2>جاري تحويلك لبوابة الدفع سداد...</h2>
  <p>يرجى الانتظار...</p>
  <form id="paymentForm" method="POST" action="${data.sadadUrl}">`;
          
          // Add all form fields
          Object.entries(data.paymentData).forEach(([key, value]) => {
            if (key === 'productdetail' && Array.isArray(value)) {
              value.forEach((product: any, index: number) => {
                Object.entries(product).forEach(([pKey, pValue]) => {
                  formHtml += `<input type="hidden" name="productdetail[${index}][${pKey}]" value="${String(pValue)}" />`;
                });
              });
            } else {
              formHtml += `<input type="hidden" name="${key}" value="${String(value)}" />`;
            }
          });
          
          formHtml += `</form>
  <script>
    document.getElementById('paymentForm').submit();
  </script>
</body>
</html>`;
          
          // Create blob URL and open in new window
          const blob = new Blob([formHtml], { type: 'text/html' });
          const url = URL.createObjectURL(blob);
          const newWindow = window.open(url, '_blank');
          
          if (!newWindow) {
            alert('يرجى السماح بالنوافذ المنبثقة لإتمام الدفع');
            window.location.href = '/checkout';
          } else {
            // Clean up blob URL after a delay
            setTimeout(() => URL.revokeObjectURL(url), 1000);
            // Redirect back to home after opening payment
            setTimeout(() => window.location.href = '/', 2000);
          }
        }
      }, 500);
    } catch (error) {
      console.error('Error processing payment data:', error);
      navigate('/checkout');
    }
  }, [navigate]);

  if (!paymentInfo) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center px-4 md:px-8 font-lusail">
        <div className="text-center">
          <Loader2 className="w-12 h-12 md:w-16 md:h-16 animate-spin mx-auto mb-4 text-primary" />
          <h2 className="text-xl md:text-2xl font-bold mb-2">جاري التحميل...</h2>
        </div>
      </div>
    );
  }

  const { paymentData, sadadUrl } = paymentInfo;

  return (
    <div className="min-h-screen bg-background flex items-center justify-center px-4 md:px-8 font-lusail">
      <div className="text-center space-y-4 w-full max-w-4xl">
        <Loader2 className="w-12 h-12 md:w-16 md:h-16 animate-spin mx-auto mb-4 text-primary" />
        <h2 className="text-xl md:text-2xl font-bold mb-2">جاري تحويلك لبوابة الدفع</h2>
        <p className="text-sm md:text-base text-muted-foreground">سيتم فتح نافذة جديدة للدفع...</p>
        
        <div className="mt-8 p-3 md:p-4 bg-red-50 border border-red-200 rounded-lg text-right">
          <h3 className="font-bold text-red-800 mb-2 text-sm md:text-base">إذا ظهرت رسالة 404:</h3>
          <div className="text-xs md:text-sm text-red-700 space-y-2">
            <p className="font-semibold">السبب الأساسي: وضع الاختبار غير مفعّل في لوحة سداد</p>
            
            <div className="bg-white p-2 md:p-3 rounded border border-red-300 mt-2">
              <p className="font-bold mb-2">خطوات الحل:</p>
              <ol className="list-decimal list-inside space-y-1 text-right">
                <li className="leading-relaxed">افتح لوحة التاجر: <a href="https://webpanel.sadad.qa/authentication/login" target="_blank" className="text-blue-600 underline break-all">webpanel.sadad.qa</a></li>
                <li className="leading-relaxed">اذهب إلى قسم "API" من القائمة اليسرى</li>
                <li className="leading-relaxed">فعّل زر "Test Mode" (وضع الاختبار)</li>
                <li className="leading-relaxed">تأكد من صحة معرف التاجر والمفتاح السري</li>
                <li className="leading-relaxed">حاول الدفع مرة أخرى</li>
              </ol>
            </div>
            
            <p className="text-xs mt-2 leading-relaxed">ملاحظة: بدون تفعيل وضع الاختبار، لن تعمل بوابة الدفع حتى لو كانت جميع الإعدادات صحيحة</p>
          </div>
        </div>

        {/* Debug info - EXPANDED by default for troubleshooting */}
        <details className="mt-4 text-left bg-gray-50 p-3 md:p-4 rounded border" open>
          <summary className="cursor-pointer font-semibold text-base md:text-lg mb-2">معلومات التصحيح (Debug Info)</summary>
          <div className="mt-2 text-xs md:text-sm space-y-2 font-mono">
            <div className="p-2 bg-white rounded border break-all">
              <strong>Merchant ID:</strong> {paymentData.merchant_id}
            </div>
            <div className="p-2 bg-white rounded border break-all">
              <strong>Order ID:</strong> {paymentData.ORDER_ID}
            </div>
            <div className="p-2 bg-white rounded border break-all">
              <strong>Amount:</strong> {paymentData.TXN_AMOUNT} QAR
            </div>
            <div className="p-2 bg-white rounded border break-all">
              <strong>Website:</strong> {paymentData.WEBSITE}
            </div>
            <div className="p-2 bg-white rounded border break-all">
              <strong>Mobile:</strong> {paymentData.MOBILE_NO}
            </div>
            <div className="p-2 bg-white rounded border break-all">
              <strong>Callback URL:</strong> {paymentData.CALLBACK_URL}
            </div>
            <div className="p-2 bg-white rounded border break-all">
              <strong>Target URL:</strong> {sadadUrl}
            </div>
            <div className="p-2 bg-white rounded border">
              <strong>Checksum (first 50 chars):</strong> 
              <div className="break-all text-xs mt-1">{paymentData.checksumhash?.substring(0, 50)}...</div>
            </div>
            <div className="p-2 bg-red-50 rounded border border-red-300 mt-3">
              <strong className="text-red-700">⚠️ إذا كنت تحصل على خطأ 404:</strong>
              <ol className="list-decimal list-inside mt-2 text-xs space-y-1">
                <li className="leading-relaxed">تحقق من أن <code className="bg-white px-1">merchant_id</code> يطابق "Sadad ID" في لوحة التحكم</li>
                <li className="leading-relaxed">تحقق من تفعيل "Test Mode" في قسم API</li>
                <li className="leading-relaxed">تأكد أن <code className="bg-white px-1">WEBSITE</code> يطابق النطاق المسجل في المفتاح السري</li>
                <li className="leading-relaxed">جرب إعادة توليد المفتاح السري من لوحة التحكم</li>
              </ol>
            </div>
          </div>
        </details>
        
        {/* Hidden form that will auto-submit */}
        <form 
          ref={formRef}
          method="POST" 
          action={sadadUrl}
          target="_top"
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
