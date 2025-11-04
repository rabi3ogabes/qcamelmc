import { useState } from "react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { FileDown, Loader2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import * as XLSX from "xlsx";
import { format } from "date-fns";
import { ar } from "date-fns/locale";

export const ReportsTab = () => {
  const [loading, setLoading] = useState(false);

  const handleExportReport = async () => {
    setLoading(true);
    try {
      // Fetch all ticket holders with related order and event data
      const { data: ticketHolders, error } = await supabase
        .from("ticket_holders")
        .select(`
          *,
          orders (
            booking_reference,
            payment_method,
            payment_status,
            total_amount,
            created_at,
            events (
              title,
              event_date,
              location
            )
          )
        `)
        .order("created_at", { ascending: false });

      if (error) throw error;

      if (!ticketHolders || ticketHolders.length === 0) {
        toast.error("لا توجد بيانات للتصدير");
        return;
      }

      // Group ticket holders by event date
      const groupedByEventDate: { [key: string]: any[] } = {};

      ticketHolders.forEach((holder: any) => {
        if (holder.orders?.events?.event_date) {
          const eventDate = holder.orders.events.event_date;
          const dateKey = format(new Date(eventDate), "yyyy-MM-dd");
          
          if (!groupedByEventDate[dateKey]) {
            groupedByEventDate[dateKey] = [];
          }
          
          groupedByEventDate[dateKey].push({
            "اسم حامل التذكرة": holder.name,
            "رقم الهاتف": holder.phone,
            "الجنسية": holder.nationality,
            "رقم الهوية": holder.id_number || "-",
            "نوع التذكرة": holder.ticket_type,
            "رمز الحجز": holder.orders?.booking_reference || "-",
            "حالة الدفع": holder.orders?.payment_status || "-",
            "طريقة الدفع": holder.orders?.payment_method || "-",
            "المبلغ الإجمالي": holder.orders?.total_amount || 0,
            "اسم الفعالية": holder.orders?.events?.title || "-",
            "تاريخ الفعالية": holder.orders?.events?.event_date 
              ? format(new Date(holder.orders.events.event_date), "dd/MM/yyyy", { locale: ar })
              : "-",
            "الموقع": holder.orders?.events?.location || "-",
            "الحضور": holder.is_present ? "نعم" : "لا",
            "تاريخ التأكيد": holder.confirmed_at 
              ? format(new Date(holder.confirmed_at), "dd/MM/yyyy HH:mm", { locale: ar })
              : "-",
            "تاريخ الإنشاء": format(new Date(holder.created_at), "dd/MM/yyyy HH:mm", { locale: ar }),
            "رمز الاستجابة السريعة": holder.qr_code || "-"
          });
        }
      });

      // Create a new workbook
      const wb = XLSX.utils.book_new();

      // Sort dates and create sheets
      const sortedDates = Object.keys(groupedByEventDate).sort();
      
      sortedDates.forEach((dateKey, index) => {
        const sheetData = groupedByEventDate[dateKey];
        const formattedDate = format(new Date(dateKey), "dd MMMM yyyy", { locale: ar });
        const sheetName = `اليوم ${index + 1} - ${formattedDate}`.substring(0, 31); // Excel sheet name limit
        
        // Create worksheet from data
        const ws = XLSX.utils.json_to_sheet(sheetData);
        
        // Set column widths
        const colWidths = [
          { wch: 20 }, // اسم حامل التذكرة
          { wch: 15 }, // رقم الهاتف
          { wch: 15 }, // الجنسية
          { wch: 15 }, // رقم الهوية
          { wch: 15 }, // نوع التذكرة
          { wch: 15 }, // رمز الحجز
          { wch: 15 }, // حالة الدفع
          { wch: 15 }, // طريقة الدفع
          { wch: 12 }, // المبلغ الإجمالي
          { wch: 25 }, // اسم الفعالية
          { wch: 15 }, // تاريخ الفعالية
          { wch: 20 }, // الموقع
          { wch: 10 }, // الحضور
          { wch: 18 }, // تاريخ التأكيد
          { wch: 18 }, // تاريخ الإنشاء
          { wch: 30 }  // رمز الاستجابة السريعة
        ];
        ws['!cols'] = colWidths;
        
        // Add worksheet to workbook
        XLSX.utils.book_append_sheet(wb, ws, sheetName);
      });

      // Generate file name with current date
      const fileName = `تقرير-التذاكر-${format(new Date(), "yyyy-MM-dd-HHmmss")}.xlsx`;
      
      // Write file
      XLSX.writeFile(wb, fileName);
      
      toast.success("تم تصدير التقرير بنجاح");
    } catch (error) {
      console.error("Error exporting report:", error);
      toast.error("فشل في تصدير التقرير");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="space-y-6 font-lusail">
      <Card className="p-6">
        <div className="space-y-4">
          <div>
            <h3 className="text-xl font-bold mb-2">تصدير تقرير التذاكر</h3>
            <p className="text-muted-foreground mb-4">
              سيتم تصدير جميع بيانات التذاكر في ملف Excel واحد، حيث يمثل كل ورقة عمل يومًا من أيام الفعاليات
            </p>
          </div>

          <div className="bg-muted/50 p-4 rounded-lg space-y-2">
            <p className="text-sm font-semibold">البيانات المصدرة تشمل:</p>
            <ul className="text-sm space-y-1 mr-4">
              <li>• اسم حامل التذكرة</li>
              <li>• رقم الهاتف</li>
              <li>• الجنسية</li>
              <li>• رقم الهوية</li>
              <li>• نوع التذكرة</li>
              <li>• رمز الحجز</li>
              <li>• حالة الدفع وطريقة الدفع</li>
              <li>• تفاصيل الفعالية (الاسم، التاريخ، الموقع)</li>
              <li>• حالة الحضور</li>
              <li>• التواريخ (الإنشاء، التأكيد)</li>
              <li>• رمز الاستجابة السريعة (QR Code)</li>
            </ul>
          </div>

          <Button
            onClick={handleExportReport}
            disabled={loading}
            className="w-full sm:w-auto"
            size="lg"
          >
            {loading ? (
              <>
                <Loader2 className="w-4 h-4 ml-2 animate-spin" />
                جاري التصدير...
              </>
            ) : (
              <>
                <FileDown className="w-4 h-4 ml-2" />
                تصدير التقرير
              </>
            )}
          </Button>
        </div>
      </Card>
    </div>
  );
};
