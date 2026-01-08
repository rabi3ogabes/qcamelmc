import { useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Loader2 } from "lucide-react";
import { useSettings } from "@/contexts/SettingsContext";

const SadadRedirect = () => {
  const navigate = useNavigate();
  const formRef = useRef<HTMLFormElement>(null);
  const hasSubmitted = useRef(false);
  const [paymentInfo, setPaymentInfo] = useState<{ paymentData: any; sadadUrl: string } | null>(null);
  const { settings } = useSettings();

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
      
      // Auto-submit the form to redirect to Sadad payment page
      setTimeout(() => {
        if (!hasSubmitted.current && formRef.current) {
          hasSubmitted.current = true;
          console.log('Submitting form to Sadad...');
          formRef.current.submit();
        }
      }, 1000);
    } catch (error) {
      console.error('Error processing payment data:', error);
      navigate('/checkout');
    }
  }, [navigate]);

  if (!paymentInfo) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center px-4 md:px-8 font-lusail">
        <div className="text-center">
          {settings?.logo_url && (
            <img 
              src={settings.logo_url} 
              alt="Logo" 
              className="h-16 md:h-20 mx-auto mb-6 object-contain"
            />
          )}
          <Loader2 className="w-12 h-12 md:w-16 md:h-16 animate-spin mx-auto mb-4 text-primary" />
          <h2 className="text-xl md:text-2xl font-bold mb-2">جاري التحميل...</h2>
        </div>
      </div>
    );
  }

  const { paymentData, sadadUrl } = paymentInfo;

  return (
    <div className="min-h-screen bg-background flex items-center justify-center px-4 md:px-8 font-lusail">
      <div className="text-center space-y-4 w-full max-w-md">
        {settings?.logo_url && (
          <img 
            src={settings.logo_url} 
            alt="Logo" 
            className="h-20 md:h-24 mx-auto mb-6 object-contain"
          />
        )}
        
        <Loader2 className="w-12 h-12 md:w-16 md:h-16 animate-spin mx-auto mb-4 text-primary" />
        <h2 className="text-xl md:text-2xl font-bold mb-2">جاري تحويلك لبوابة الدفع سداد...</h2>
        <p className="text-sm md:text-base text-muted-foreground">يرجى الانتظار...</p>
        
        {/* Hidden form that will auto-submit and redirect to Sadad */}
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
