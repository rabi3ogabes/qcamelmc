import { useState, useRef, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Camera, FileDown, Trash2, Loader2, X, ArrowRight, ImageIcon } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import * as XLSX from "xlsx";
import { useNavigate } from "react-router-dom";

interface POSReceipt {
  id: string;
  amount_qar: number | null;
  seq_number: string | null;
  card_number_masked: string | null;
  time: string | null;
  auth_number: string | null;
  created_at: string;
}

const POSReceiptPage = () => {
  const navigate = useNavigate();
  const [receipts, setReceipts] = useState<POSReceipt[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isProcessing, setIsProcessing] = useState(false);
  const [capturedImage, setCapturedImage] = useState<string | null>(null);
  const cameraInputRef = useRef<HTMLInputElement>(null);
  const galleryInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    fetchReceipts();
  }, []);

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
      if (cameraInputRef.current) cameraInputRef.current.value = "";
      if (galleryInputRef.current) galleryInputRef.current.value = "";
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
    <div className="min-h-screen bg-background" dir="rtl">
      <div className="container mx-auto px-4 py-6 max-w-4xl">
        {/* Header */}
        <div className="flex items-center justify-between mb-6">
          <h1 className="text-xl sm:text-2xl font-bold font-lusail">قراءة إيصالات POS</h1>
          <Button
            variant="outline"
            size="sm"
            onClick={() => navigate("/admin/dashboard")}
            className="flex items-center gap-2"
          >
            <ArrowRight className="w-4 h-4" />
            رجوع
          </Button>
        </div>

        <div className="space-y-6">
          {/* Camera/Upload Section */}
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base font-medium">التقاط أو رفع صورة إيصال</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              {/* Hidden inputs */}
              <input
                ref={cameraInputRef}
                type="file"
                accept="image/*"
                capture="environment"
                onChange={handleFileChange}
                className="hidden"
              />
              <input
                ref={galleryInputRef}
                type="file"
                accept="image/*"
                onChange={handleFileChange}
                className="hidden"
              />

              {/* Action Buttons */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <Button
                  onClick={() => cameraInputRef.current?.click()}
                  disabled={isProcessing}
                  size="lg"
                  className="h-24 flex flex-col items-center justify-center gap-3 bg-primary hover:bg-primary/90"
                >
                  {isProcessing ? (
                    <Loader2 className="w-10 h-10 animate-spin" />
                  ) : (
                    <Camera className="w-10 h-10" />
                  )}
                  <span className="text-base font-medium">
                    {isProcessing ? "جاري المعالجة..." : "التقاط بالكاميرا"}
                  </span>
                </Button>

                <Button
                  onClick={() => galleryInputRef.current?.click()}
                  disabled={isProcessing}
                  size="lg"
                  variant="secondary"
                  className="h-24 flex flex-col items-center justify-center gap-3"
                >
                  {isProcessing ? (
                    <Loader2 className="w-10 h-10 animate-spin" />
                  ) : (
                    <ImageIcon className="w-10 h-10" />
                  )}
                  <span className="text-base font-medium">
                    {isProcessing ? "جاري المعالجة..." : "اختيار من المعرض"}
                  </span>
                </Button>
              </div>

              {/* Preview */}
              {capturedImage && (
                <div className="relative mt-4">
                  <img
                    src={capturedImage}
                    alt="Captured receipt"
                    className="max-h-64 w-auto mx-auto rounded-lg border shadow-sm"
                  />
                  <Button
                    size="icon"
                    variant="destructive"
                    className="absolute top-2 right-2 w-8 h-8"
                    onClick={() => setCapturedImage(null)}
                  >
                    <X className="w-4 h-4" />
                  </Button>
                  {isProcessing && (
                    <div className="absolute inset-0 bg-background/80 flex items-center justify-center rounded-lg">
                      <div className="flex flex-col items-center gap-2">
                        <Loader2 className="w-8 h-8 animate-spin text-primary" />
                        <span className="text-sm font-medium">جاري قراءة الإيصال...</span>
                      </div>
                    </div>
                  )}
                </div>
              )}
            </CardContent>
          </Card>

          {/* Receipts Table */}
          <Card>
            <CardHeader className="pb-3 flex flex-row items-center justify-between">
              <CardTitle className="text-base font-medium">الإيصالات المحفوظة ({receipts.length})</CardTitle>
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
                <div className="flex justify-center py-12">
                  <Loader2 className="w-8 h-8 animate-spin text-primary" />
                </div>
              ) : receipts.length === 0 ? (
                <div className="text-center py-12 text-muted-foreground">
                  <ImageIcon className="w-12 h-12 mx-auto mb-3 opacity-50" />
                  <p>لا توجد إيصالات محفوظة</p>
                  <p className="text-sm mt-1">التقط صورة أو اختر من المعرض لإضافة إيصال</p>
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
                        <TableHead className="text-right w-12">حذف</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {receipts.map((receipt) => (
                        <TableRow key={receipt.id}>
                          <TableCell className="font-mono font-semibold">
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
                              className="h-8 w-8 text-destructive hover:text-destructive hover:bg-destructive/10"
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
      </div>
    </div>
  );
};

export default POSReceiptPage;
