import { useNavigate } from "react-router-dom";
import { ArrowLeft } from "lucide-react";
import { Button } from "@/components/ui/button";
import { OrdersTab } from "@/components/admin/OrdersTab";

export default function StaffOrders() {
  const navigate = useNavigate();
  return <div className="min-h-screen bg-background font-lusail" dir="rtl">
    <header className="border-b bg-card">
      <div className="mx-auto flex max-w-6xl items-center justify-between px-4 py-4">
        <h1 className="text-xl font-bold">الطلبات</h1>
        <Button variant="outline" size="sm" onClick={() => navigate("/staff")}><ArrowLeft className="ms-2 h-4 w-4" />رجوع</Button>
      </div>
    </header>
    <main className="mx-auto max-w-6xl px-4 py-8"><OrdersTab readOnly /></main>
  </div>;
}