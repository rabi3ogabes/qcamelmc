import { Link } from "react-router-dom";
import { ArrowRight, Ticket } from "lucide-react";
import { Button } from "@/components/ui/button";
import { PublicHeader } from "@/components/PublicHeader";
import { Footer } from "@/components/Footer";

const NotFound = () => <div className="public-site min-h-screen font-lusail" dir="rtl">
  <PublicHeader />
  <main className="mx-auto flex min-h-[55vh] max-w-2xl flex-col items-center justify-center px-5 py-16 text-center">
    <Ticket className="mb-6 h-12 w-12 public-gold" aria-hidden="true" />
    <p className="mb-4 text-sm font-semibold text-muted-foreground">404</p>
    <h1 className="text-3xl font-bold sm:text-4xl">هذه الصفحة غير موجودة</h1>
    <p className="mt-5 max-w-md text-base leading-8 text-muted-foreground">قد يكون الرابط قد تغير أو لم يعد متاحًا. يمكنك العودة إلى الفعاليات المتاحة.</p>
    <Button asChild size="lg" className="mt-8"><Link to="/"><ArrowRight className="ml-2 h-5 w-5" />العودة إلى الفعاليات</Link></Button>
  </main>
  <Footer />
</div>;
export default NotFound;
