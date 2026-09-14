# تتبّع أخطاء الدفع (سداد) في لوحة التحكم

هدف: عندما يفشل الدفع لزائر في صفحة الدفع أو عند العودة من سداد، يُسجَّل الحدث كاملاً ويظهر للأدمن في صفحة جديدة داخل لوحة التحكم.

## ماذا سيرى الأدمن

صفحة جديدة **"أخطاء الدفع"** في قائمة لوحة التحكم، تعرض جدولاً/بطاقات بكل محاولة دفع فاشلة:

- اسم العميل ورقم هاتفه
- التاريخ والوقت (توقيت قطر)
- عدد التذاكر والمبلغ
- رقم الحجز ورقم عملية سداد إن وُجد
- نص رسالة الخطأ كما ظهر للزائر
- مصدر الخطأ: سداد / البنك أو البطاقة / الموقع — مع شارة ملوّنة
- الفعالية المرتبطة

مع: فلتر حسب المصدر، فلتر الحالية/الأرشيف مثل باقي الصفحات، بحث بالاسم أو الهاتف أو رقم الحجز، تحديث لحظي، وفتح تفاصيل الطلب المرتبط.

## ما سيتم بناؤه

### قاعدة البيانات
جدول جديد `payment_errors`:
`id, created_at, order_id, booking_reference, event_id, customer_name, customer_phone, quantity, amount, payment_id, error_source ('sadad' | 'bank' | 'site'), error_code, error_message, raw jsonb`

- `GRANT INSERT TO anon, authenticated` (التسجيل يحدث من المتصفح للزائر) و`GRANT SELECT TO authenticated` + `GRANT ALL TO service_role`.
- RLS: إدراج مسموح للجميع، والقراءة/الحذف للأدمن فقط عبر `is_admin(auth.uid())`.

### نقاط التسجيل
1. `src/pages/Checkout.tsx` — كل حالات الفشل قبل التحويل إلى سداد (فشل إنشاء الحجز، رفض السعة، حد التذاكر، فشل استدعاء `sadad-payment`) → المصدر `site`.
2. `supabase/functions/sadad-payment/index.ts` — عند رفض سداد لطلب إنشاء الدفع → المصدر `sadad` مع رمز ورسالة سداد.
3. `supabase/functions/sadad-webhook/index.ts` — عند تحديث الطلب إلى `cancelled` مع `payment_error_reason` → تسجيل صف بالمصدر المستنتج: رسائل رفض البطاقة/الرصيد تُصنَّف `bank`، والباقي `sadad`.
4. `src/pages/SadadCallback.tsx` — فشل المعالجة أو انتهاء الانتظار دون تأكيد → المصدر `site`.

التسجيل لا يُفشِل أي مسار: أي خطأ في الكتابة يُبتلع ويُسجَّل في console فقط.

### الواجهة
- `src/components/admin/PaymentErrorsTab.tsx` + `src/pages/admin/PaymentErrorsPage.tsx`
- مسار `/admin/dashboard/payment-errors` في `src/App.tsx` وعنصر قائمة في `src/pages/AdminDashboard.tsx` (أيقونة `AlertTriangle`).
- نفس النمط المتّبع: RTL، عنوان يمين، أزرار الحالية/الأرشيف، صفحات من الخادم، اشتراك لحظي.

## ملاحظات تقنية
- تصنيف المصدر عبر دالة مساعدة واحدة `classifyPaymentError(message, code)` في `src/lib/paymentErrors.ts` تُستخدم في الواجهة، ونسخة مطابقة داخل دوال الحافة.
- المبلغ وعدد التذاكر يُؤخذان من السلة وقت الفشل، لا من الطلب (قد لا يكون الطلب قد أُنشئ).
