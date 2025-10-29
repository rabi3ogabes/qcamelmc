import { useState } from "react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { supabase } from "@/integrations/supabase/client";
import { CheckCircle2, XCircle, AlertTriangle, ExternalLink, Loader2 } from "lucide-react";
import { toast } from "sonner";

export const SadadDiagnostic = () => {
  const [testing, setTesting] = useState(false);
  const [results, setResults] = useState<any>(null);

  const runDiagnostic = async () => {
    setTesting(true);
    setResults(null);

    try {
      // Fetch current settings
      const { data: settings, error: settingsError } = await supabase
        .from('settings')
        .select('sadad_merchant_id, sadad_secret, sadad_website_domain')
        .maybeSingle();

      if (settingsError) throw settingsError;

      const diagnosticResults = {
        timestamp: new Date().toISOString(),
        checks: [] as any[],
        summary: { passed: 0, warnings: 0, failed: 0 }
      };

      // Check 1: Merchant ID
      if (!settings?.sadad_merchant_id) {
        diagnosticResults.checks.push({
          name: "معرف التاجر (Merchant ID)",
          status: "failed",
          message: "❌ معرف التاجر غير محدد",
          solution: "أدخل معرف التاجر من لوحة سداد"
        });
        diagnosticResults.summary.failed++;
      } else if (settings.sadad_merchant_id !== "1664851") {
        diagnosticResults.checks.push({
          name: "معرف التاجر (Merchant ID)",
          status: "warning",
          message: `⚠️ معرف التاجر: ${settings.sadad_merchant_id}`,
          solution: "تأكد أن هذا المعرف صحيح من لوحة سداد"
        });
        diagnosticResults.summary.warnings++;
      } else {
        diagnosticResults.checks.push({
          name: "معرف التاجر (Merchant ID)",
          status: "passed",
          message: `✓ معرف التاجر صحيح: ${settings.sadad_merchant_id}`
        });
        diagnosticResults.summary.passed++;
      }

      // Check 2: Secret Key
      if (!settings?.sadad_secret) {
        diagnosticResults.checks.push({
          name: "المفتاح السري (Secret Key)",
          status: "failed",
          message: "❌ المفتاح السري غير محدد",
          solution: "أدخل المفتاح السري من لوحة سداد → API"
        });
        diagnosticResults.summary.failed++;
      } else {
        const secretLength = settings.sadad_secret.length;
        const hasSpaces = settings.sadad_secret.includes(' ');
        
        if (hasSpaces) {
          diagnosticResults.checks.push({
            name: "المفتاح السري (Secret Key)",
            status: "failed",
            message: "❌ المفتاح السري يحتوي على مسافات!",
            solution: "احذف جميع المسافات من المفتاح السري"
          });
          diagnosticResults.summary.failed++;
        } else if (secretLength < 10) {
          diagnosticResults.checks.push({
            name: "المفتاح السري (Secret Key)",
            status: "warning",
            message: `⚠️ المفتاح السري قصير جداً (${secretLength} حرف)`,
            solution: "تحقق من نسخ المفتاح السري كاملاً"
          });
          diagnosticResults.summary.warnings++;
        } else {
          diagnosticResults.checks.push({
            name: "المفتاح السري (Secret Key)",
            status: "passed",
            message: `✓ المفتاح السري محدد (${secretLength} حرف)`
          });
          diagnosticResults.summary.passed++;
        }
      }

      // Check 3: Website Domain
      if (!settings?.sadad_website_domain) {
        diagnosticResults.checks.push({
          name: "النطاق (Website Domain)",
          status: "failed",
          message: "❌ النطاق غير محدد",
          solution: "أدخل النطاق المسجل في لوحة سداد (مثل: qcamelmc.org)"
        });
        diagnosticResults.summary.failed++;
      } else {
        const domain = settings.sadad_website_domain;
        const hasProtocol = domain.includes('http://') || domain.includes('https://');
        const hasWww = domain.startsWith('www.');
        
        if (hasProtocol) {
          diagnosticResults.checks.push({
            name: "النطاق (Website Domain)",
            status: "warning",
            message: `⚠️ النطاق يحتوي على بروتوكول: ${domain}`,
            solution: "احذف http:// أو https:// من النطاق"
          });
          diagnosticResults.summary.warnings++;
        } else {
          diagnosticResults.checks.push({
            name: "النطاق (Website Domain)",
            status: "passed",
            message: `✓ النطاق: ${domain}`,
            note: hasWww ? "⚠️ تأكد أن النطاق في لوحة سداد يحتوي على www أيضاً" : "✓ تأكد أن النطاق في لوحة سداد لا يحتوي على www"
          });
          diagnosticResults.summary.passed++;
        }
      }

      // Check 4: Test Payment Request
      try {
        const testOrderData = {
          total_amount: 3.0,
          customer_email: "test@example.com",
          customer_phone: "66793776",
          items: [{
            name: "تذكرة اختبار",
            price: 3.0,
            quantity: 1
          }]
        };

        const { data: paymentData, error: paymentError } = await supabase.functions.invoke('sadad-payment', {
          body: {
            orderId: 'TEST-' + Date.now(),
            orderData: testOrderData
          }
        });

        if (paymentError) {
          diagnosticResults.checks.push({
            name: "اتصال Edge Function",
            status: "failed",
            message: `❌ خطأ في الاتصال: ${paymentError.message}`,
            solution: "تحقق من سجلات Edge Function"
          });
          diagnosticResults.summary.failed++;
        } else if (paymentData?.success) {
          diagnosticResults.checks.push({
            name: "اتصال Edge Function",
            status: "passed",
            message: "✓ Edge Function يعمل بشكل صحيح (SHA-256 Signature Method)",
            details: {
              signatureLength: paymentData.paymentData?.signature?.length || 0,
              signatureMethod: "SHA-256 (New Method)",
              sadadUrl: paymentData.sadadUrl,
              merchantId: paymentData.paymentData?.merchant_id,
              website: paymentData.paymentData?.WEBSITE
            }
          });
          diagnosticResults.summary.passed++;
        }
      } catch (error) {
        diagnosticResults.checks.push({
          name: "اتصال Edge Function",
          status: "failed",
          message: `❌ خطأ في الاختبار: ${error}`,
          solution: "تحقق من إعدادات Supabase"
        });
        diagnosticResults.summary.failed++;
      }

      setResults(diagnosticResults);

      if (diagnosticResults.summary.failed > 0) {
        toast.error(`فشل ${diagnosticResults.summary.failed} من الفحوصات`);
      } else if (diagnosticResults.summary.warnings > 0) {
        toast.warning(`${diagnosticResults.summary.warnings} تحذيرات`);
      } else {
        toast.success("جميع الفحوصات نجحت! ✓");
      }

    } catch (error) {
      console.error('Diagnostic error:', error);
      toast.error("حدث خطأ أثناء التشخيص");
    } finally {
      setTesting(false);
    }
  };

  return (
    <Card className="p-6 bg-blue-50/50 border-blue-200">
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-lg font-semibold font-lusail text-blue-900">
          🔬 أداة تشخيص إعدادات سداد
        </h3>
        <Button 
          onClick={runDiagnostic} 
          disabled={testing}
          className="font-lusail"
          variant="outline"
        >
          {testing ? (
            <>
              <Loader2 className="w-4 h-4 ml-2 animate-spin" />
              جاري الفحص...
            </>
          ) : (
            "▶️ تشغيل التشخيص"
          )}
        </Button>
      </div>

      <Alert className="mb-4 bg-white">
        <AlertTriangle className="h-4 w-4" />
        <AlertDescription className="text-sm font-lusail">
          <strong>ملاحظة:</strong> هذه الأداة تفحص الإعدادات المحلية فقط. 
          للتحقق من إعدادات لوحة سداد، يجب زيارة لوحة التحكم.
        </AlertDescription>
      </Alert>

      {results && (
        <div className="space-y-4">
          {/* Summary */}
          <div className="grid grid-cols-3 gap-3">
            <Card className="p-3 bg-green-50 border-green-200">
              <div className="text-center">
                <CheckCircle2 className="w-8 h-8 mx-auto text-green-600 mb-1" />
                <div className="text-2xl font-bold text-green-700">{results.summary.passed}</div>
                <div className="text-xs text-green-600">نجح</div>
              </div>
            </Card>
            <Card className="p-3 bg-yellow-50 border-yellow-200">
              <div className="text-center">
                <AlertTriangle className="w-8 h-8 mx-auto text-yellow-600 mb-1" />
                <div className="text-2xl font-bold text-yellow-700">{results.summary.warnings}</div>
                <div className="text-xs text-yellow-600">تحذير</div>
              </div>
            </Card>
            <Card className="p-3 bg-red-50 border-red-200">
              <div className="text-center">
                <XCircle className="w-8 h-8 mx-auto text-red-600 mb-1" />
                <div className="text-2xl font-bold text-red-700">{results.summary.failed}</div>
                <div className="text-xs text-red-600">فشل</div>
              </div>
            </Card>
          </div>

          {/* Detailed Results */}
          <div className="space-y-2">
            {results.checks.map((check: any, index: number) => (
              <Card 
                key={index}
                className={`p-4 ${
                  check.status === 'passed' ? 'bg-green-50 border-green-200' :
                  check.status === 'warning' ? 'bg-yellow-50 border-yellow-200' :
                  'bg-red-50 border-red-200'
                }`}
              >
                <div className="flex items-start gap-3">
                  {check.status === 'passed' && <CheckCircle2 className="w-5 h-5 text-green-600 flex-shrink-0 mt-0.5" />}
                  {check.status === 'warning' && <AlertTriangle className="w-5 h-5 text-yellow-600 flex-shrink-0 mt-0.5" />}
                  {check.status === 'failed' && <XCircle className="w-5 h-5 text-red-600 flex-shrink-0 mt-0.5" />}
                  
                  <div className="flex-1">
                    <div className="font-semibold text-sm mb-1">{check.name}</div>
                    <div className="text-sm mb-2">{check.message}</div>
                    {check.note && (
                      <div className="text-xs text-gray-600 mb-2">{check.note}</div>
                    )}
                    {check.solution && (
                      <div className="text-xs bg-white p-2 rounded border">
                        <strong>الحل:</strong> {check.solution}
                      </div>
                    )}
                    {check.details && (
                      <div className="text-xs text-gray-600 mt-2 font-mono">
                        {JSON.stringify(check.details, null, 2)}
                      </div>
                    )}
                  </div>
                </div>
              </Card>
            ))}
          </div>

          {/* Critical Action Required */}
          {results.summary.failed > 0 || results.summary.warnings > 0 ? (
            <Alert className="bg-red-50 border-red-200">
              <AlertTriangle className="h-4 w-4 text-red-600" />
              <AlertDescription className="font-lusail">
                <div className="font-bold text-red-800 mb-2">⚠️ إجراء مطلوب</div>
                <div className="text-sm text-red-700 space-y-2">
                  <p>أهم خطوة يجب القيام بها الآن:</p>
                  <ol className="list-decimal list-inside space-y-1 text-xs">
                    <li>افتح <a href="https://webpanel.sadad.qa/authentication/login" target="_blank" rel="noopener noreferrer" className="underline font-bold">لوحة تاجر سداد</a></li>
                    <li>اذهب إلى قسم "API"</li>
                    <li><strong className="text-red-900 bg-red-100 px-1">فعّل "Test Mode" (الزر يجب أن يكون أخضر)</strong></li>
                    <li>انسخ المفتاح السري والصقه في الإعدادات أعلاه</li>
                    <li>تحقق من النطاق المسجل</li>
                    <li>احفظ وجرب مرة أخرى</li>
                  </ol>
                </div>
              </AlertDescription>
            </Alert>
          ) : (
            <Alert className="bg-green-50 border-green-200">
              <CheckCircle2 className="h-4 w-4 text-green-600" />
              <AlertDescription className="font-lusail">
                <div className="font-bold text-green-800 mb-2">✅ الإعدادات تبدو صحيحة</div>
                <div className="text-sm text-green-700">
                  إذا استمرت المشكلة (خطأ 404)، السبب الأكثر احتمالاً:
                  <ul className="list-disc list-inside mt-2 space-y-1 text-xs">
                    <li><strong className="text-red-700">Test Mode غير مفعّل</strong> - الزر يجب أن يكون أخضر في لوحة سداد → API</li>
                    <li><strong>المفتاح السري قديم</strong> - تم توليده قبل إضافة النطاق (يجب إعادة توليده)</li>
                    <li><strong>النطاق غير متطابق</strong> - تأكد أن النطاق في الإعدادات يطابق تماماً أحد النطاقات المسجلة في لوحة سداد</li>
                    <li>Web Checkout 2.2 غير مفعّل (نادراً - اتصل بدعم سداد إذا استمرت المشكلة)</li>
                  </ul>
                </div>
              </AlertDescription>
            </Alert>
          )}

          {/* Quick Links */}
          <div className="flex gap-2 pt-2">
            <Button 
              variant="outline" 
              size="sm"
              className="font-lusail text-xs"
              onClick={() => window.open('https://webpanel.sadad.qa/authentication/login', '_blank')}
            >
              <ExternalLink className="w-3 h-3 ml-1" />
              فتح لوحة سداد
            </Button>
            <Button 
              variant="outline" 
              size="sm"
              className="font-lusail text-xs"
              onClick={() => window.open('https://developer.sadad.qa/', '_blank')}
            >
              <ExternalLink className="w-3 h-3 ml-1" />
              وثائق Sadad API
            </Button>
          </div>
        </div>
      )}

      {!results && (
        <div className="text-center text-gray-500 py-8">
          <p className="font-lusail text-sm">
            اضغط على "تشغيل التشخيص" للبدء في فحص الإعدادات
          </p>
        </div>
      )}
    </Card>
  );
};
