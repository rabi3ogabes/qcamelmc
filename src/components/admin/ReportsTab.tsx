import { useState } from "react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { FileDown, Loader2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import XLSX from "xlsx-js-style";
import { format } from "date-fns";
import { formatInTimeZone } from "date-fns-tz";
import { ar } from "date-fns/locale";

// Qatar timezone
const QATAR_TIMEZONE = "Asia/Qatar";

const formatDateKeyForSheet = (dateKey: string) => {
  const [y, m, d] = dateKey.split("-");
  return `${d}-${m}-${y}`;
};

// Define styles for Excel
const headerStyle = {
  font: { bold: true, color: { rgb: "FFFFFF" }, sz: 12 },
  fill: { fgColor: { rgb: "1E3A5F" } },
  alignment: { horizontal: "center", vertical: "center", wrapText: true },
  border: {
    top: { style: "thin", color: { rgb: "000000" } },
    bottom: { style: "thin", color: { rgb: "000000" } },
    left: { style: "thin", color: { rgb: "000000" } },
    right: { style: "thin", color: { rgb: "000000" } }
  }
};

const cellStyle = {
  alignment: { horizontal: "center", vertical: "center" },
  border: {
    top: { style: "thin", color: { rgb: "D0D0D0" } },
    bottom: { style: "thin", color: { rgb: "D0D0D0" } },
    left: { style: "thin", color: { rgb: "D0D0D0" } },
    right: { style: "thin", color: { rgb: "D0D0D0" } }
  }
};

const confirmedStyle = {
  ...cellStyle,
  fill: { fgColor: { rgb: "D4EDDA" } },
  font: { color: { rgb: "155724" }, bold: true }
};

const pendingStyle = {
  ...cellStyle,
  fill: { fgColor: { rgb: "FFF3CD" } },
  font: { color: { rgb: "856404" }, bold: true }
};

const cancelledStyle = {
  ...cellStyle,
  fill: { fgColor: { rgb: "F8D7DA" } },
  font: { color: { rgb: "721C24" }, bold: true }
};

const totalRowStyle = {
  font: { bold: true, color: { rgb: "FFFFFF" }, sz: 12 },
  fill: { fgColor: { rgb: "2E7D32" } },
  alignment: { horizontal: "center", vertical: "center" },
  border: {
    top: { style: "medium", color: { rgb: "000000" } },
    bottom: { style: "medium", color: { rgb: "000000" } },
    left: { style: "thin", color: { rgb: "000000" } },
    right: { style: "thin", color: { rgb: "000000" } }
  }
};

const amountStyle = {
  ...cellStyle,
  font: { bold: true },
  numFmt: "#,##0.00"
};

export const ReportsTab = () => {
  const [loading, setLoading] = useState(false);
  const [loadingSadad, setLoadingSadad] = useState(false);
  const applyStylesToSheet = (ws: XLSX.WorkSheet, data: any[], colWidths: any[]) => {
    const range = XLSX.utils.decode_range(ws['!ref'] || 'A1');
    const statusColIndex = 4; // حالة الدفع column (0-indexed)
    const amountColIndex = 5; // المبلغ الإجمالي column (0-indexed)
    
    // Apply header styles
    for (let col = range.s.c; col <= range.e.c; col++) {
      const cellAddress = XLSX.utils.encode_cell({ r: 0, c: col });
      if (ws[cellAddress]) {
        ws[cellAddress].s = headerStyle;
      }
    }
    
    // Apply cell styles for data rows
    for (let row = 1; row <= range.e.r; row++) {
      for (let col = range.s.c; col <= range.e.c; col++) {
        const cellAddress = XLSX.utils.encode_cell({ r: row, c: col });
        if (ws[cellAddress]) {
          // Check if this is the status column
          if (col === statusColIndex) {
            const status = ws[cellAddress].v;
            if (status === "confirmed") {
              ws[cellAddress].s = confirmedStyle;
            } else if (status === "pending") {
              ws[cellAddress].s = pendingStyle;
            } else if (status === "cancelled") {
              ws[cellAddress].s = cancelledStyle;
            } else {
              ws[cellAddress].s = cellStyle;
            }
          } else if (col === amountColIndex) {
            ws[cellAddress].s = amountStyle;
          } else {
            ws[cellAddress].s = cellStyle;
          }
        }
      }
    }
    
    ws['!cols'] = colWidths;
    ws['!rows'] = [{ hpt: 25 }]; // Header row height
    
    return ws;
  };

  const addTotalRow = (ws: XLSX.WorkSheet, data: any[], colWidths: any[]) => {
    const range = XLSX.utils.decode_range(ws['!ref'] || 'A1');
    const totalRow = range.e.r + 1;
    const amountColIndex = 5; // المبلغ الإجمالي column
    
    // Calculate total
    const totalAmount = data.reduce((sum, row) => {
      const amount = row["المبلغ الإجمالي"] || 0;
      return sum + (typeof amount === 'number' ? amount : parseFloat(amount) || 0);
    }, 0);
    
    // Add total label
    const labelCell = XLSX.utils.encode_cell({ r: totalRow, c: amountColIndex - 1 });
    ws[labelCell] = { v: "الإجمالي:", s: totalRowStyle };
    
    // Add total value
    const totalCell = XLSX.utils.encode_cell({ r: totalRow, c: amountColIndex });
    ws[totalCell] = { v: totalAmount, s: totalRowStyle, t: 'n' };
    
    // Update range
    ws['!ref'] = XLSX.utils.encode_range({ s: range.s, e: { r: totalRow, c: range.e.c } });
    
    return ws;
  };

  const handleExportReport = async (sadadOnly: boolean = false) => {
    if (sadadOnly) {
      setLoadingSadad(true);
    } else {
      setLoading(true);
    }
    try {
      // Fetch orders with related customer, event, and ticket holders data
      let query = supabase
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

      // Filter for Sadad only if requested
      if (sadadOnly) {
        query = query.eq("payment_method", "sadad");
      }

      const { data: orders, error } = await query;

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
            ? formatInTimeZone(
                new Date(order.confirmed_at),
                QATAR_TIMEZONE,
                "dd/MM/yyyy HH:mm",
                { locale: ar }
              )
            : "-",
          "تاريخ الإنشاء": order.created_at
            ? formatInTimeZone(
                new Date(order.created_at),
                QATAR_TIMEZONE,
                "dd/MM/yyyy HH:mm",
                { locale: ar }
              )
            : "-",
          "رمز الاستجابة السريعة": order.qr_code || "-"
        };
      };

      orders.forEach((order: any) => {
        // Group by event date (using Qatar timezone for consistency)
        // NOTE: Sadad-only export should be based on تاريخ الإنشاء, so we skip event-based sheets.
        if (!sadadOnly && order.events?.event_date) {
          const dateKey = formatInTimeZone(
            new Date(order.events.event_date),
            QATAR_TIMEZONE,
            "yyyy-MM-dd"
          );

          if (!groupedByEventDate[dateKey]) {
            groupedByEventDate[dateKey] = [];
          }
          groupedByEventDate[dateKey].push(formatOrderData(order));
        }

        // Group Sadad orders by creation date (تاريخ الإنشاء) - use Qatar timezone for consistency
        if (order.payment_method === "sadad") {
          const createdDateKey = formatInTimeZone(
            new Date(order.created_at),
            QATAR_TIMEZONE,
            "yyyy-MM-dd"
          );
          
          if (!groupedBySadadPurchaseDate[createdDateKey]) {
            groupedBySadadPurchaseDate[createdDateKey] = [];
          }
          groupedBySadadPurchaseDate[createdDateKey].push(formatOrderData(order));
        }
      });

      // Create a new workbook
      const wb = XLSX.utils.book_new();

      // Define column widths (reusable for all sheets)
      const colWidths = [
        { wch: 25 }, // اسم الفعالية
        { wch: 20 }, // معرف الدفع
        { wch: 15 }, // طريقة الدفع
        { wch: 15 }, // عدد التذاكر
        { wch: 15 }, // حالة الدفع
        { wch: 15 }, // المبلغ الإجمالي
        { wch: 15 }, // رمز الحجز
        { wch: 22 }, // اسم العميل
        { wch: 28 }, // البريد الإلكتروني
        { wch: 18 }, // رقم الهاتف
        { wch: 15 }, // الجنسية
        { wch: 18 }, // رقم الهوية
        { wch: 15 }, // نوع التذكرة
        { wch: 15 }, // تاريخ الفعالية
        { wch: 20 }, // الموقع
        { wch: 12 }, // عدد الحضور
        { wch: 40 }, // أسماء حاملي التذاكر
        { wch: 20 }, // تاريخ التأكيد
        { wch: 20 }, // تاريخ الإنشاء
        { wch: 35 }  // رمز الاستجابة السريعة
      ];

      // Sort function for status ordering: confirmed > pending > cancelled
      const statusOrder = { "confirmed": 1, "pending": 2, "cancelled": 3 };
      const sortByStatus = (a: any, b: any) => {
        const statusA = statusOrder[a["حالة الدفع"] as keyof typeof statusOrder] || 4;
        const statusB = statusOrder[b["حالة الدفع"] as keyof typeof statusOrder] || 4;
        return statusA - statusB;
      };

      if (!sadadOnly) {
        // Create a sheet with ALL records first
        const allRecordsData = Object.keys(groupedByEventDate)
          .sort()
          .flatMap(dateKey => groupedByEventDate[dateKey])
          .sort(sortByStatus);

        if (allRecordsData.length > 0) {
          let allRecordsSheet = XLSX.utils.json_to_sheet(allRecordsData);
          allRecordsSheet = applyStylesToSheet(allRecordsSheet, allRecordsData, colWidths);
          allRecordsSheet = addTotalRow(allRecordsSheet, allRecordsData, colWidths);
          XLSX.utils.book_append_sheet(wb, allRecordsSheet, "جميع السجلات");
        }

        // Sort dates chronologically and create sheets for each event day
        const sortedEventDates = Object.keys(groupedByEventDate).sort((a, b) =>
          a.localeCompare(b)
        );

        sortedEventDates.forEach((dateKey) => {
          const sheetData = groupedByEventDate[dateKey].sort(sortByStatus);
          const formattedDate = formatDateKeyForSheet(dateKey);
          const sheetName = `فعالية ${formattedDate}`.substring(0, 31);

          let ws = XLSX.utils.json_to_sheet(sheetData);
          ws = applyStylesToSheet(ws, sheetData, colWidths);
          ws = addTotalRow(ws, sheetData, colWidths);
          XLSX.utils.book_append_sheet(wb, ws, sheetName);
        });
      }

      // Add Sadad purchases by date sheets - sorted chronologically
      const sortedSadadDates = Object.keys(groupedBySadadPurchaseDate).sort((a, b) =>
        a.localeCompare(b)
      );
      
      if (sortedSadadDates.length > 0) {
        // Add a summary sheet for all Sadad purchases
        const allSadadData = sortedSadadDates
          .flatMap(dateKey => groupedBySadadPurchaseDate[dateKey])
          .sort(sortByStatus);
        let sadadSummarySheet = XLSX.utils.json_to_sheet(allSadadData);
        sadadSummarySheet = applyStylesToSheet(sadadSummarySheet, allSadadData, colWidths);
        sadadSummarySheet = addTotalRow(sadadSummarySheet, allSadadData, colWidths);
        XLSX.utils.book_append_sheet(wb, sadadSummarySheet, "جميع مشتريات سداد");

        // Add individual sheets for each Sadad creation date - sorted chronologically
        sortedSadadDates.forEach((dateKey) => {
          const sheetData = groupedBySadadPurchaseDate[dateKey].sort(sortByStatus);
          const formattedDate = formatDateKeyForSheet(dateKey);
          const sheetName = `سداد ${formattedDate}`.substring(0, 31);
          
          let ws = XLSX.utils.json_to_sheet(sheetData);
          ws = applyStylesToSheet(ws, sheetData, colWidths);
          ws = addTotalRow(ws, sheetData, colWidths);
          XLSX.utils.book_append_sheet(wb, ws, sheetName);
        });
      }

      // Generate file name with current date
      const filePrefix = sadadOnly ? "تقرير-سداد" : "تقرير-التذاكر";
      const fileName = `${filePrefix}-${format(new Date(), "yyyy-MM-dd-HHmmss")}.xlsx`;
      
      // Write file
      XLSX.writeFile(wb, fileName);
      
      toast.success("تم تصدير التقرير بنجاح");
    } catch (error) {
      console.error("Error exporting report:", error);
      toast.error("فشل في تصدير التقرير");
    } finally {
      setLoading(false);
      setLoadingSadad(false);
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

          <div className="flex flex-col sm:flex-row gap-3">
            <Button
              onClick={() => handleExportReport(false)}
              disabled={loading || loadingSadad}
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
                  تصدير التقرير الكامل
                </>
              )}
            </Button>
            
            <Button
              onClick={() => handleExportReport(true)}
              disabled={loading || loadingSadad}
              variant="secondary"
              className="w-full sm:w-auto"
              size="lg"
            >
              {loadingSadad ? (
                <>
                  <Loader2 className="w-4 h-4 ml-2 animate-spin" />
                  جاري التصدير...
                </>
              ) : (
                <>
                  <FileDown className="w-4 h-4 ml-2" />
                  تصدير سداد فقط
                </>
              )}
            </Button>
          </div>
        </div>
      </Card>
    </div>
  );
};