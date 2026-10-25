import { Link } from "react-router-dom";
import { ArrowRight, ShieldCheck, FileText } from "lucide-react";
import { PublicHeader } from "@/components/PublicHeader";
import { Footer } from "@/components/Footer";
import { useSettings } from "@/contexts/SettingsContext";

const privacy = [
  ["البيانات التي يستخدمها الموقع", "نستخدم البيانات التي تقدمها لإتمام الحجز، مثل الاسم ورقم الهاتف والبريد الإلكتروني وبيانات حاملي التذاكر. نحتفظ كذلك بمرجع الحجز وحالة الدفع والحضور وسجلات التشغيل اللازمة لحماية الخدمة."],
  ["الغرض من الاستخدام", "تُستخدم البيانات لإصدار التذاكر والفواتير والتحقق من الدخول، وإرسال رسائل الحجز، والرد على الاستفسارات، ومنع إساءة الاستخدام. تقتصر إدارة بيانات الحجوزات على الأشخاص المخولين بحسب صلاحياتهم."],
  ["الدفع ومقدمو الخدمات", "تتم معالجة الدفع الإلكتروني من خلال سداد. يعتمد الموقع على خدمات استضافة وبريد، وقد تُرسل إشعارات واتساب عبر الخدمات المتصلة. لا تطلب منا إرسال بيانات بطاقتك الكاملة أو رمز الأمان عبر رسائل الدعم."],
  ["التخزين والتحليلات", "يستخدم الموقع التخزين المحلي لتسريع عرض البيانات وتذكر بعض الاختيارات. تُسجل معلومات الزيارة والأخطاء لحماية الخدمة وتحسينها. عند تفعيل Microsoft Clarity، تُستخدم تحليلات التفاعل في صفحات العملاء دون صفحات الإدارة والفريق."],
  ["حقوقك والتواصل", "يمكنك التواصل مع إدارة الفعالية لطلب مراجعة بياناتك أو تصحيحها أو الاستفسار عن حذفها. تُراجع الطلبات وفق الالتزامات التشغيلية والقانونية المتعلقة بالحجز والدفع؛ هذه الصفحة لا تحدد مدة احتفاظ ثابتة."],
];
const terms = [
  ["الحجز وتأكيد الدفع", "راجع اسم الفعالية وتاريخها وموقعها ونوع التذكرة والسعر المعروض قبل الدفع. الحجز المعلق لا يُعد تذكرة مؤكدة؛ يعتمد إصدار التذكرة على تأكيد الدفع وتوفر السعة."],
  ["بيانات الحجز", "يجب تقديم بيانات صحيحة لحاملي التذاكر ومعلومات تواصل يمكن الوصول إليها. يحتفظ النظام بسجلات البيع الإلكتروني والبيع في نقاط البيع، ويُستخدم مرجع الحجز لمتابعة العملية."],
  ["الدخول والتذاكر", "يُتحقق من صلاحية التذكرة للفعالية عند الدخول. التذكرة التي تم تأكيد استخدامها لا تسمح بدخول متكرر. حافظ على خصوصية رمز QR ورابط الفاتورة ومرجع الحجز ولا تشاركها علنًا."],
  ["الإلغاء والتغييرات", "تخضع طلبات الإلغاء أو الاسترداد أو تغيير الحجز للشروط التي تعلنها إدارة الفعالية وللقواعد القانونية المعمول بها. لا تتضمن هذه الصفحة وعدًا بالاسترداد أو موعدًا محددًا له؛ تواصل مع الإدارة قبل الشراء إذا احتجت توضيحًا."],
  ["الاستخدام المقبول", "لا يجوز محاولة الدخول غير المصرح به، أو التلاعب بالتذاكر أو الدفع، أو تعطيل الخدمة، أو استخراج بيانات العملاء. صفحات الإدارة والفريق مقصورة على المستخدمين المخولين."],
  ["التواصل والخدمة", "إذا تعذر إتمام الدفع أو ظهرت مشكلة في التذكرة، تواصل مع الإدارة مع ذكر مرجع الحجز دون إرسال كلمات مرور أو بيانات بطاقة حساسة. قد تخضع الخدمة للصيانة أو لتوقف مقدمي الخدمات المتصلين."],
];

const LegalPage = ({ kind }: { kind: "privacy" | "terms" }) => {
  const { settings } = useSettings();
  const isPrivacy = kind === "privacy";
  const title = isPrivacy ? "سياسة الخصوصية" : "الشروط والأحكام";
  const Icon = isPrivacy ? ShieldCheck : FileText;
  const phone = settings?.admin_phone?.replace(/\D/g, "");
  return <div className="public-site min-h-screen font-lusail" dir="rtl">
    <PublicHeader />
    <main className="mx-auto max-w-3xl px-5 py-12 sm:px-8 sm:py-16">
      <Link to="/" className="inline-flex items-center gap-2 text-sm text-primary hover:underline"><ArrowRight className="h-4 w-4" />العودة إلى الفعاليات</Link>
      <Icon className="mt-10 h-8 w-8 text-primary" aria-hidden="true" />
      <h1 className="mt-4 text-3xl font-bold text-foreground sm:text-4xl">{title}</h1>
      <p className="mt-4 text-base leading-8 text-muted-foreground">مهرجان التحدي للمفاريد — معلومات استخدام موقع التذاكر وخدمات الحجز.</p>
      <div className="mt-10 divide-y divide-border">
        {(isPrivacy ? privacy : terms).map(([heading, body]) => <section key={heading} className="py-7">
          <h2 className="text-xl font-bold text-foreground">{heading}</h2>
          <p className="mt-3 text-base leading-8 text-muted-foreground">{body}</p>
        </section>)}
      </div>
      {phone && <a href={`https://wa.me/${phone}`} target="_blank" rel="noopener noreferrer" className="mt-6 inline-block font-semibold text-primary underline">التواصل مع إدارة الفعالية</a>}
      <Link to={isPrivacy ? "/terms" : "/privacy"} className="mt-8 block text-sm text-primary underline">{isPrivacy ? "الشروط والأحكام" : "سياسة الخصوصية"}</Link>
    </main>
    <Footer />
  </div>;
};
export default LegalPage;