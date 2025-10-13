import { useEffect, useRef } from "react";
import { useNavigate } from "react-router-dom";
import { Loader2 } from "lucide-react";

const SadadRedirect = () => {
  const navigate = useNavigate();
  const formRef = useRef<HTMLFormElement>(null);
  const hasSubmitted = useRef(false);

  useEffect(() => {
    if (hasSubmitted.current) return;
    
    const paymentDataStr = sessionStorage.getItem('sadadPaymentData');
    
    if (!paymentDataStr) {
      navigate('/checkout');
      return;
    }

    try {
      const { paymentData, sadadUrl } = JSON.parse(paymentDataStr);
      
      // Clear the session storage
      sessionStorage.removeItem('sadadPaymentData');
      
      // Try to break out of any iframe and submit at top level
      setTimeout(() => {
        if (formRef.current && !hasSubmitted.current) {
          hasSubmitted.current = true;
          
          // If we're in an iframe, try to submit from parent
          if (window.top !== window.self) {
            // Open in new window to avoid iframe issues
            const form = formRef.current;
            const formData = new FormData(form);
            const params = new URLSearchParams();
            
            // Convert FormData to URLSearchParams for the new window
            formData.forEach((value, key) => {
              params.append(key, value.toString());
            });
            
            // Open payment in new window
            window.open('about:blank', '_blank');
            form.target = '_blank';
            form.submit();
          } else {
            // Submit normally
            formRef.current.submit();
          }
        }
      }, 500);
    } catch (error) {
      console.error('Error processing payment data:', error);
      navigate('/checkout');
    }
  }, [navigate]);

  // Get payment data for rendering form
  const paymentDataStr = sessionStorage.getItem('sadadPaymentData');
  if (!paymentDataStr) {
    return null;
  }

  const { paymentData, sadadUrl } = JSON.parse(paymentDataStr);

  return (
    <div className="min-h-screen bg-background flex items-center justify-center p-4 font-lusail">
      <div className="text-center">
        <Loader2 className="w-16 h-16 animate-spin mx-auto mb-4 text-primary" />
        <h2 className="text-2xl font-bold mb-2">جاري تحويلك لبوابة الدفع</h2>
        <p className="text-muted-foreground">يرجى الانتظار...</p>
        
        {/* Hidden form that will auto-submit */}
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
