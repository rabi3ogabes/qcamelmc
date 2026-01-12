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
      // Fetch all orders with related customer, event, and ticket holders data
      const { data: orders, error } = await supabase
        .from("orders")
        .select(`
          *,
          customers (
            name,
            email,
            phone,
            nationality,
            id_number,
            country_code
          ),
          events (
            title,
            event_date,
            location
          ),
          ticket_holders (
            name,
            phone,
            nationality,
            id_number,
            ticket_type,
            is_present,
            qr_code,
            country_code
          )
        `)
        .order("created_at", { ascending: false });

      if (error) throw error;

      if (!orders || orders.length === 0) {
        toast.error("لا توجد بيانات للتصدير");
        return;
      }

      // Group orders by event date
      const groupedByEventDate: { [key: string]: any[] } = {};
      // Group Sadad orders by purchase date
      const groupedBySadadPurchaseDate: { [key: string]: any[] } = {};

      const formatOrderData = (order: any) => {
        // Count present ticket holders
        const presentCount = order.ticket_holders?.filter((th: any) => th.is_present).length || 0;
        const totalTickets = order.ticket_holders?.length || order.quantity || 0;
        
        // Calculate detailed quantity breakdown by ticket type
        const ticketTypeBreakdown: { [key: string]: number } = {};
        order.ticket_holders?.forEach((th: any) => {
          const type = th.ticket_type;
          ticketTypeBreakdown[type] = (ticketTypeBreakdown[type] || 0) + 1;
        });
        const detailedQuantity = Object.entries(ticketTypeBreakdown)
          .map(([type, count]) => `${count} ${type}`)
          .join(" + ") || `${totalTickets} ${order.ticket_type}`;
        
        // Get all ticket holder names
        const ticketHolderNames = order.ticket_holders?.map((th: any) => th.name).join(", ") || "-";
        
        return {
          "اسم الفعالية": order.events?.title || "-",
          "معرف الدفع": order.payment_id || "-",
          "طريقة الدفع": order.payment_method || "-",
          "عدد التذاكر": detailedQuantity,
          "حالة الدفع": order.payment_status || "-",
          "المبلغ الإجمالي": order.total_amount || 0,
          "رمز الحجز": order.booking_reference,
          "اسم العميل": order.customers?.name || "-",
          "البريد الإلكتروني": order.customers?.email || "-",
          "رقم الهاتف": order.customers?.phone || "-",
          "الجنسية": order.customers?.nationality || "-",
          "رقم الهوية": order.customers?.id_number || "-",
          "نوع التذكرة": order.ticket_type,
          "تاريخ الفعالية": order.events?.event_date 
            ? format(new Date(order.events.event_date), "dd/MM/yyyy", { locale: ar })
            : "-",
          "الموقع": order.events?.location || "-",
          "عدد الحضور": presentCount,
          "أسماء حاملي التذاكر": ticketHolderNames,
          "تاريخ التأكيد": order.confirmed_at 
            ? format(new Date(order.confirmed_at), "dd/MM/yyyy HH:mm", { locale: ar })
            : "-",
          "تاريخ الإنشاء": format(new Date(order.created_at), "dd/MM/yyyy HH:mm", { locale: ar }),
          "رمز الاستجابة السريعة": order.qr_code || "-"
        };
      };

      orders.forEach((order: any) => {
        // Group by event date
        if (order.events?.event_date) {
          const eventDate = order.events.event_date;
          const dateKey = format(new Date(eventDate), "yyyy-MM-dd");
          
          if (!groupedByEventDate[dateKey]) {
            groupedByEventDate[dateKey] = [];
          }
          groupedByEventDate[dateKey].push(formatOrderData(order));
        }

        // Group Sadad orders by purchase date (created_at)
        if (order.payment_method === "sadad" && order.payment_status === "confirmed") {
          const purchaseDate = format(new Date(order.created_at), "yyyy-MM-dd");
          
          if (!groupedBySadadPurchaseDate[purchaseDate]) {
            groupedBySadadPurchaseDate[purchaseDate] = [];
          }
          groupedBySadadPurchaseDate[purchaseDate].push(formatOrderData(order));
        }
      });

      // Create a new workbook
      const wb = XLSX.utils.book_new();

      // Define column widths (reusable for all sheets)
      const colWidths = [
        { wch: 25 }, // اسم الفعالية
        { wch: 20 }, // معرف الدفع
        { wch: 15 }, // طريقة الدفع
        { wch: 12 }, // عدد التذاكر
        { wch: 15 }, // حالة الدفع
        { wch: 12 }, // المبلغ الإجمالي
        { wch: 15 }, // رمز الحجز
        { wch: 20 }, // اسم العميل
        { wch: 25 }, // البريد الإلكتروني
        { wch: 15 }, // رقم الهاتف
        { wch: 15 }, // الجنسية
        { wch: 15 }, // رقم الهوية
        { wch: 15 }, // نوع التذكرة
        { wch: 15 }, // تاريخ الفعالية
        { wch: 20 }, // الموقع
        { wch: 12 }, // عدد الحضور
        { wch: 40 }, // أسماء حاملي التذاكر
        { wch: 18 }, // تاريخ التأكيد
        { wch: 18 }, // تاريخ الإنشاء
        { wch: 30 }  // رمز الاستجابة السريعة
      ];

      // Create a sheet with ALL records first
      const allRecordsData = Object.keys(groupedByEventDate)
        .sort()
        .flatMap(dateKey => groupedByEventDate[dateKey]);
      
      console.log("All records count:", allRecordsData.length);
      
      if (allRecordsData.length > 0) {
        const allRecordsSheet = XLSX.utils.json_to_sheet(allRecordsData);
        allRecordsSheet['!cols'] = colWidths;
        
        // Add all records sheet as first sheet
        XLSX.utils.book_append_sheet(wb, allRecordsSheet, "جميع السجلات");
        console.log("All records sheet added successfully");
      } else {
        console.log("No records to add to all records sheet");
      }

      // Sort dates and create sheets for each day
      const sortedDates = Object.keys(groupedByEventDate).sort();
      
      sortedDates.forEach((dateKey, index) => {
        const sheetData = groupedByEventDate[dateKey];
        const formattedDate = format(new Date(dateKey), "dd MMMM yyyy", { locale: ar });
        const sheetName = `اليوم ${index + 1} - ${formattedDate}`.substring(0, 31); // Excel sheet name limit
        
        // Create worksheet from data
        const ws = XLSX.utils.json_to_sheet(sheetData);
        ws['!cols'] = colWidths;
        
        // Add worksheet to workbook
        XLSX.utils.book_append_sheet(wb, ws, sheetName);
      });

      // Add Sadad purchases by date sheets
      const sortedSadadDates = Object.keys(groupedBySadadPurchaseDate).sort();
      
      if (sortedSadadDates.length > 0) {
        // Add a summary sheet for all Sadad purchases
        const allSadadData = sortedSadadDates.flatMap(dateKey => groupedBySadadPurchaseDate[dateKey]);
        const sadadSummarySheet = XLSX.utils.json_to_sheet(allSadadData);
        sadadSummarySheet['!cols'] = colWidths;
        XLSX.utils.book_append_sheet(wb, sadadSummarySheet, "جميع مشتريات سداد");

        // Add individual sheets for each Sadad purchase date
        sortedSadadDates.forEach((dateKey, index) => {
          const sheetData = groupedBySadadPurchaseDate[dateKey];
          const formattedDate = format(new Date(dateKey), "dd MMMM yyyy", { locale: ar });
          const sheetName = `سداد ${index + 1} - ${formattedDate}`.substring(0, 31);
          
          const ws = XLSX.utils.json_to_sheet(sheetData);
          ws['!cols'] = colWidths;
          XLSX.utils.book_append_sheet(wb, ws, sheetName);
        });
      }

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
            <h3 className="text-xl font-bold mb-2">تصدير تقرير الطلبات</h3>
            <p className="text-muted-foreground mb-4">
              سيتم تصدير جميع بيانات الطلبات في ملف Excel واحد، حيث يمثل كل ورقة عمل يومًا من أيام الفعاليات
            </p>
          </div>

          <div className="bg-muted/50 p-4 rounded-lg space-y-2">
            <p className="text-sm font-semibold">البيانات المصدرة تشمل:</p>
            <ul className="text-sm space-y-1 mr-4">
              <li>• رمز الحجز</li>
              <li>• بيانات العميل (الاسم، البريد، الهاتف، الجنسية، رقم الهوية)</li>
              <li>• نوع التذكرة وعدد التذاكر</li>
              <li>• حالة الدفع وطريقة الدفع</li>
              <li>• المبلغ الإجمالي</li>
              <li>• تفاصيل الفعالية (الاسم، التاريخ، الموقع)</li>
              <li>• عدد الحضور</li>
              <li>• أسماء حاملي التذاكر</li>
              <li>• التواريخ (الإنشاء، التأكيد)</li>
              <li>• معرف الدفع ورمز الاستجابة السريعة</li>
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
