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
      
      // Clear the session storage
      sessionStorage.removeItem('sadadPaymentData');
      
      // Submit form after brief delay
      setTimeout(() => {
        if (formRef.current && !hasSubmitted.current) {
          hasSubmitted.current = true;
          
          // Open in new window/tab to avoid iframe restrictions
          formRef.current.target = '_blank';
          formRef.current.submit();
          
          // Redirect back to checkout after opening payment window
          setTimeout(() => {
            navigate('/checkout');
          }, 1000);
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
      <div className="text-center space-y-4">
        <Loader2 className="w-16 h-16 animate-spin mx-auto mb-4 text-primary" />
        <h2 className="text-2xl font-bold mb-2">جاري تحويلك لبوابة الدفع</h2>
        <p className="text-muted-foreground">سيتم فتح نافذة جديدة للدفع...</p>
        
        <div className="mt-8 p-4 bg-yellow-50 border border-yellow-200 rounded-lg text-right">
          <h3 className="font-bold text-yellow-800 mb-2">ملاحظة مهمة:</h3>
          <p className="text-sm text-yellow-700">
            إذا لم يتم فتح نافذة الدفع، يرجى التأكد من:
          </p>
          <ul className="text-sm text-yellow-700 list-disc list-inside text-right mt-2">
            <li>تفعيل وضع الاختبار (Test Mode) في لوحة التاجر</li>
            <li>صحة بيانات التاجر (Merchant ID والمفتاح السري)</li>
            <li>السماح للنوافذ المنبثقة في المتصفح</li>
          </ul>
        </div>
        
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
