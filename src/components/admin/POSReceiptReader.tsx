import { useState, useRef, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Camera, FileDown, Trash2, Receipt, Loader2, X } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import * as XLSX from "xlsx";

interface POSReceipt {
  id: string;
  amount_qar: number | null;
  seq_number: string | null;
  card_number_masked: string | null;
  time: string | null;
  auth_number: string | null;
  created_at: string;
}

export const POSReceiptReader = () => {
  const [isOpen, setIsOpen] = useState(false);
  const [receipts, setReceipts] = useState<POSReceipt[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);
  const [capturedImage, setCapturedImage] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (isOpen) {
      fetchReceipts();
    }
  }, [isOpen]);

  const fetchReceipts = async () => {
    setIsLoading(true);
    try {
      const { data, error } = await supabase
        .from("pos_receipts")
        .select("*")
        .order("created_at", { ascending: false });

      if (error) throw error;
      setReceipts(data || []);
    } catch (error) {
      console.error("Error fetching receipts:", error);
      toast.error("فشل في تحميل الإيصالات");
    } finally {
      setIsLoading(false);
    }
  };

  const handleFileChange = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    // Convert to base64
    const reader = new FileReader();
    reader.onload = async (e) => {
      const base64 = (e.target?.result as string)?.split(",")[1];
      if (base64) {
        setCapturedImage(e.target?.result as string);
        await processReceipt(base64);
      }
    };
    reader.readAsDataURL(file);
  };

  const processReceipt = async (imageBase64: string) => {
    setIsProcessing(true);
    try {
      const { data, error } = await supabase.functions.invoke("parse-pos-receipt", {
        body: { imageBase64 },
      });

      if (error) throw error;

      if (data.error) {
        toast.error(data.error);
        return;
      }

      const extractedData = data.data;
      
      // Save to database
      const { error: insertError } = await supabase.from("pos_receipts").insert({
        amount_qar: extractedData.amount_qar,
        seq_number: extractedData.seq_number,
        card_number_masked: extractedData.card_number_masked,
        time: extractedData.time,
        auth_number: extractedData.auth_number,
      });

      if (insertError) throw insertError;

      toast.success("تم قراءة الإيصال وحفظه بنجاح");
      setCapturedImage(null);
      fetchReceipts();
    } catch (error) {
      console.error("Error processing receipt:", error);
      toast.error("فشل في معالجة الإيصال");
    } finally {
      setIsProcessing(false);
      // Reset file input
      if (fileInputRef.current) {
        fileInputRef.current.value = "";
      }
    }
  };

  const handleDelete = async (id: string) => {
    try {
      const { error } = await supabase.from("pos_receipts").delete().eq("id", id);
      if (error) throw error;
      toast.success("تم حذف الإيصال");
      fetchReceipts();
    } catch (error) {
      console.error("Error deleting receipt:", error);
      toast.error("فشل في حذف الإيصال");
    }
  };

  const handleExportToExcel = () => {
    if (receipts.length === 0) {
      toast.error("لا توجد بيانات للتصدير");
      return;
    }

    const exportData = receipts.map((r) => ({
      "المبلغ (ريال)": r.amount_qar ?? "",
      "رقم التسلسل": r.seq_number ?? "",
      "رقم البطاقة": r.card_number_masked ?? "",
      "الوقت": r.time ?? "",
      "رقم التفويض": r.auth_number ?? "",
      "تاريخ الإضافة": new Date(r.created_at).toLocaleString("ar-QA"),
    }));

    const ws = XLSX.utils.json_to_sheet(exportData);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "إيصالات POS");

    // Set column widths
    ws["!cols"] = [
      { wch: 15 },
      { wch: 15 },
      { wch: 20 },
      { wch: 12 },
      { wch: 15 },
      { wch: 20 },
    ];

    const fileName = `pos_receipts_${new Date().toISOString().split("T")[0]}.xlsx`;
    XLSX.writeFile(wb, fileName);
    toast.success("تم تصدير البيانات بنجاح");
  };

  return (
    <Dialog open={isOpen} onOpenChange={setIsOpen}>
      <DialogTrigger asChild>
        <Button
          variant="outline"
          className="font-lusail flex items-center justify-center gap-2 bg-orange-500/10 hover:bg-orange-500/20 border-orange-500 text-orange-600 dark:text-orange-400 text-xs sm:text-sm w-full sm:w-auto"
        >
          <Receipt className="w-4 h-4" />
          قراءة إيصال POS
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto" dir="rtl">
        <DialogHeader>
          <DialogTitle className="font-lusail text-lg">قراءة إيصالات POS</DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          {/* Camera/File Input Section */}
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-sm font-medium">التقاط صورة إيصال</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <input
                ref={fileInputRef}
                type="file"
                accept="image/*"
                capture="environment"
                onChange={handleFileChange}
                className="hidden"
              />
              <div className="flex gap-2">
                <Button
                  onClick={() => fileInputRef.current?.click()}
                  disabled={isProcessing}
                  className="flex-1"
                >
                  {isProcessing ? (
                    <Loader2 className="w-4 h-4 ml-2 animate-spin" />
                  ) : (
                    <Camera className="w-4 h-4 ml-2" />
                  )}
                  {isProcessing ? "جاري المعالجة..." : "التقاط صورة"}
                </Button>
              </div>

              {capturedImage && (
                <div className="relative">
                  <img
                    src={capturedImage}
                    alt="Captured receipt"
                    className="max-h-48 w-auto mx-auto rounded-lg border"
                  />
                  <Button
                    size="icon"
                    variant="destructive"
                    className="absolute top-2 right-2 w-6 h-6"
                    onClick={() => setCapturedImage(null)}
                  >
                    <X className="w-4 h-4" />
                  </Button>
                </div>
              )}
            </CardContent>
          </Card>

          {/* Receipts Table */}
          <Card>
            <CardHeader className="pb-3 flex flex-row items-center justify-between">
              <CardTitle className="text-sm font-medium">الإيصالات المحفوظة</CardTitle>
              <Button
                variant="outline"
                size="sm"
                onClick={handleExportToExcel}
                disabled={receipts.length === 0}
              >
                <FileDown className="w-4 h-4 ml-2" />
                تصدير Excel
              </Button>
            </CardHeader>
            <CardContent>
              {isLoading ? (
                <div className="flex justify-center py-8">
                  <Loader2 className="w-6 h-6 animate-spin" />
                </div>
              ) : receipts.length === 0 ? (
                <div className="text-center py-8 text-muted-foreground">
                  لا توجد إيصالات محفوظة
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead className="text-right">المبلغ (ريال)</TableHead>
                        <TableHead className="text-right">رقم التسلسل</TableHead>
                        <TableHead className="text-right">رقم البطاقة</TableHead>
                        <TableHead className="text-right">الوقت</TableHead>
                        <TableHead className="text-right">رقم التفويض</TableHead>
                        <TableHead className="text-right">التاريخ</TableHead>
                        <TableHead className="text-right">إجراء</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {receipts.map((receipt) => (
                        <TableRow key={receipt.id}>
                          <TableCell className="font-mono">
                            {receipt.amount_qar?.toLocaleString() ?? "-"}
                          </TableCell>
                          <TableCell className="font-mono">
                            {receipt.seq_number ?? "-"}
                          </TableCell>
                          <TableCell className="font-mono text-xs">
                            {receipt.card_number_masked ?? "-"}
                          </TableCell>
                          <TableCell className="font-mono">
                            {receipt.time ?? "-"}
                          </TableCell>
                          <TableCell className="font-mono">
                            {receipt.auth_number ?? "-"}
                          </TableCell>
                          <TableCell className="text-xs">
                            {new Date(receipt.created_at).toLocaleDateString("ar-QA")}
                          </TableCell>
                          <TableCell>
                            <Button
                              size="icon"
                              variant="ghost"
                              className="h-7 w-7 text-destructive hover:text-destructive"
                              onClick={() => handleDelete(receipt.id)}
                            >
                              <Trash2 className="w-4 h-4" />
                            </Button>
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      </DialogContent>
    </Dialog>
  );
};
