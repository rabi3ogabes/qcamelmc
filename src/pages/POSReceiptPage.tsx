import { useState, useRef, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Camera, FileDown, Trash2, Loader2, X, ArrowRight, ImageIcon } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import XLSX from "xlsx-js-style";
import { useNavigate } from "react-router-dom";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

interface POSReceipt {
  id: string;
  amount_qar: number | null;
  seq_number: string | null;
  card_number_masked: string | null;
  time: string | null;
  auth_number: string | null;
  created_at: string;
  num_tickets: number | null;
  normal_tickets: number | null;
  vip_tickets: number | null;
  parking_tickets: number | null;
  image_url: string | null;
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

    // Set up real-time subscription
    const channel = supabase
      .channel("pos_receipts_realtime")
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "pos_receipts",
        },
        (payload) => {
          if (payload.eventType === "INSERT") {
            setReceipts((prev) => [payload.new as POSReceipt, ...prev]);
          } else if (payload.eventType === "UPDATE") {
            setReceipts((prev) =>
              prev.map((r) => (r.id === payload.new.id ? (payload.new as POSReceipt) : r))
            );
          } else if (payload.eventType === "DELETE") {
            setReceipts((prev) => prev.filter((r) => r.id !== payload.old.id));
          }
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
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
      toast.error("Failed to load receipts");
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
        await processReceipt(base64, file);
      }
    };
    reader.readAsDataURL(file);
  };

  const processReceipt = async (imageBase64: string, file: File) => {
    setIsProcessing(true);
    try {
      // First, upload the image to storage
      const fileExt = file.name.split('.').pop() || 'jpg';
      const fileName = `${Date.now()}-${Math.random().toString(36).substring(7)}.${fileExt}`;
      const filePath = `receipts/${fileName}`;

      const { error: uploadError } = await supabase.storage
        .from('pos-receipts')
        .upload(filePath, file, {
          cacheControl: '3600',
          upsert: false
        });

      if (uploadError) {
        console.error("Upload error:", uploadError);
        throw new Error("Failed to upload image");
      }

      // Get the public URL
      const { data: { publicUrl } } = supabase.storage
        .from('pos-receipts')
        .getPublicUrl(filePath);

      // Parse the receipt using AI
      const { data, error } = await supabase.functions.invoke("parse-pos-receipt", {
        body: { imageBase64 },
      });

      if (error) throw error;

      if (data.error) {
        toast.error(data.error);
        return;
      }

      const extractedData = data.data;

      // Insert with image URL
      const { error: insertError } = await supabase.from("pos_receipts").insert({
        amount_qar: extractedData.amount_qar,
        seq_number: extractedData.seq_number,
        card_number_masked: extractedData.card_number_masked,
        time: extractedData.time,
        auth_number: extractedData.auth_number,
        image_url: publicUrl,
      });

      if (insertError) throw insertError;

      toast.success("Receipt read and saved successfully");
      setCapturedImage(null);
      // No need to fetchReceipts - realtime will handle it
    } catch (error) {
      console.error("Error processing receipt:", error);
      toast.error("Failed to process receipt");
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
      toast.success("Receipt deleted");
      // No need to fetchReceipts - realtime will handle it
    } catch (error) {
      console.error("Error deleting receipt:", error);
      toast.error("Failed to delete receipt");
    }
  };

  const handleTicketChange = async (
    receiptId: string,
    ticketType: "normal_tickets" | "vip_tickets" | "parking_tickets",
    value: number
  ) => {
    try {
      const { error } = await supabase
        .from("pos_receipts")
        .update({ [ticketType]: value } as Record<string, number>)
        .eq("id", receiptId);

      if (error) throw error;

      setReceipts((prev) =>
        prev.map((r) => (r.id === receiptId ? { ...r, [ticketType]: value } : r))
      );
    } catch (error) {
      console.error("Error updating tickets:", error);
      toast.error("Failed to update tickets");
    }
  };

  // Ticket prices
  const TICKET_PRICES = {
    normal: 200,
    vip: 300,
    parking: 500,
  };

  // Calculate totals
  const totals = receipts.reduce(
    (acc, r) => ({
      normal: acc.normal + (r.normal_tickets ?? 0),
      vip: acc.vip + (r.vip_tickets ?? 0),
      parking: acc.parking + (r.parking_tickets ?? 0),
    }),
    { normal: 0, vip: 0, parking: 0 }
  );

  const totalAmounts = {
    normal: totals.normal * TICKET_PRICES.normal,
    vip: totals.vip * TICKET_PRICES.vip,
    parking: totals.parking * TICKET_PRICES.parking,
  };

  const grandTotalTickets = totals.normal + totals.vip + totals.parking;
  const grandTotalAmount = totalAmounts.normal + totalAmounts.vip + totalAmounts.parking;

  const handleExportToExcel = () => {
    if (receipts.length === 0) {
      toast.error("No data to export");
      return;
    }

    const today = new Date().toLocaleDateString("en-GB", {
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    });

    const headers = ["#", "Amount (QAR)", "Seq Number", "Normal", "VIP", "Parking", "Card Number", "Time", "Auth Number", "Date Added"];

    const exportData = receipts.map((r, index) => [
      index + 1,
      r.amount_qar ?? "",
      r.seq_number ?? "",
      r.normal_tickets ?? 0,
      r.vip_tickets ?? 0,
      r.parking_tickets ?? 0,
      r.card_number_masked ?? "",
      r.time ?? "",
      r.auth_number ?? "",
      new Date(r.created_at).toLocaleString("en-US"),
    ]);

    // Summary data for Excel
    const summaryData = [
      [],
      ["", "pos", "", "", "", "", "", "", "", ""],
      ["", "normal", totals.normal, totalAmounts.normal, "", "", "", "", "", ""],
      ["", "VIP", totals.vip, totalAmounts.vip, "", "", "", "", "", ""],
      ["", "parking", totals.parking, totalAmounts.parking, "", "", "", "", "", ""],
      ["", "المجموع", grandTotalTickets, grandTotalAmount, "", "", "", "", "", ""],
    ];

    // Create worksheet with styled header
    const ws = XLSX.utils.aoa_to_sheet([
      [`كشف تحميل رسوم تذاكر دخول مهرجان قطر للابل- جزيلا العطا - بتاريخ ${today} (POS)`],
      [], // Empty row
      headers,
      ...exportData,
      ...summaryData,
    ]);

    // Merge cells for title header
    ws["!merges"] = [{ s: { r: 0, c: 0 }, e: { r: 0, c: 9 } }];

    // Style the title header (row 1)
    ws["A1"].s = {
      font: { bold: true, sz: 14, color: { rgb: "FFFFFF" } },
      fill: { fgColor: { rgb: "7C3AED" } },
      alignment: { horizontal: "center", vertical: "center" },
    };

    // Style the column headers (row 3)
    const headerStyle = {
      font: { bold: true, sz: 11, color: { rgb: "FFFFFF" } },
      fill: { fgColor: { rgb: "1E3A5F" } },
      alignment: { horizontal: "center", vertical: "center" },
      border: {
        top: { style: "thin", color: { rgb: "000000" } },
        bottom: { style: "thin", color: { rgb: "000000" } },
        left: { style: "thin", color: { rgb: "000000" } },
        right: { style: "thin", color: { rgb: "000000" } },
      },
    };

    const cols = ["A", "B", "C", "D", "E", "F", "G", "H", "I", "J"];
    cols.forEach((col) => {
      const cell = ws[`${col}3`];
      if (cell) cell.s = headerStyle;
    });

    // Style data rows with alternating colors
    const dataStyle = (isEven: boolean) => ({
      font: { sz: 10 },
      fill: { fgColor: { rgb: isEven ? "F3F4F6" : "FFFFFF" } },
      alignment: { horizontal: "center", vertical: "center" },
      border: {
        top: { style: "thin", color: { rgb: "E5E7EB" } },
        bottom: { style: "thin", color: { rgb: "E5E7EB" } },
        left: { style: "thin", color: { rgb: "E5E7EB" } },
        right: { style: "thin", color: { rgb: "E5E7EB" } },
      },
    });

    // Apply styles to data cells
    for (let rowIdx = 0; rowIdx < exportData.length; rowIdx++) {
      const excelRow = rowIdx + 4; // Data starts at row 4
      const isEven = rowIdx % 2 === 0;
      cols.forEach((col) => {
        const cell = ws[`${col}${excelRow}`];
        if (cell) cell.s = dataStyle(isEven);
      });
    }

    // Style summary section
    const summaryStartRow = 4 + exportData.length + 1; // After data + empty row
    const summaryCols = ["B", "C", "D"];
    
    // POS header row style
    const posHeaderStyle = {
      font: { bold: true, sz: 11, color: { rgb: "000000" } },
      fill: { fgColor: { rgb: "D4E6F1" } }, // Light blue
      alignment: { horizontal: "center", vertical: "center" },
      border: {
        top: { style: "thin", color: { rgb: "000000" } },
        bottom: { style: "thin", color: { rgb: "000000" } },
        left: { style: "thin", color: { rgb: "000000" } },
        right: { style: "thin", color: { rgb: "000000" } },
      },
    };
    
    // Normal row style (green)
    const normalStyle = {
      font: { sz: 10 },
      fill: { fgColor: { rgb: "D5F5E3" } }, // Light green
      alignment: { horizontal: "center", vertical: "center" },
      border: {
        top: { style: "thin", color: { rgb: "000000" } },
        bottom: { style: "thin", color: { rgb: "000000" } },
        left: { style: "thin", color: { rgb: "000000" } },
        right: { style: "thin", color: { rgb: "000000" } },
      },
    };
    
    // VIP row style (amber/yellow)
    const vipStyle = {
      font: { sz: 10 },
      fill: { fgColor: { rgb: "FCF3CF" } }, // Light yellow
      alignment: { horizontal: "center", vertical: "center" },
      border: {
        top: { style: "thin", color: { rgb: "000000" } },
        bottom: { style: "thin", color: { rgb: "000000" } },
        left: { style: "thin", color: { rgb: "000000" } },
        right: { style: "thin", color: { rgb: "000000" } },
      },
    };
    
    // Parking row style (light blue)
    const parkingStyle = {
      font: { sz: 10 },
      fill: { fgColor: { rgb: "D6EAF8" } }, // Light blue
      alignment: { horizontal: "center", vertical: "center" },
      border: {
        top: { style: "thin", color: { rgb: "000000" } },
        bottom: { style: "thin", color: { rgb: "000000" } },
        left: { style: "thin", color: { rgb: "000000" } },
        right: { style: "thin", color: { rgb: "000000" } },
      },
    };
    
    // Total row style (beige/tan)
    const totalStyle = {
      font: { bold: true, sz: 10 },
      fill: { fgColor: { rgb: "F5CBA7" } }, // Light orange/tan
      alignment: { horizontal: "center", vertical: "center" },
      border: {
        top: { style: "thin", color: { rgb: "000000" } },
        bottom: { style: "thin", color: { rgb: "000000" } },
        left: { style: "thin", color: { rgb: "000000" } },
        right: { style: "thin", color: { rgb: "000000" } },
      },
    };
    
    // Apply styles to summary rows
    // POS header row
    summaryCols.forEach((col) => {
      const cell = ws[`${col}${summaryStartRow}`];
      if (cell) cell.s = posHeaderStyle;
    });
    
    // Normal row
    summaryCols.forEach((col) => {
      const cell = ws[`${col}${summaryStartRow + 1}`];
      if (cell) cell.s = normalStyle;
    });
    
    // VIP row
    summaryCols.forEach((col) => {
      const cell = ws[`${col}${summaryStartRow + 2}`];
      if (cell) cell.s = vipStyle;
    });
    
    // Parking row
    summaryCols.forEach((col) => {
      const cell = ws[`${col}${summaryStartRow + 3}`];
      if (cell) cell.s = parkingStyle;
    });
    
    // Total row
    summaryCols.forEach((col) => {
      const cell = ws[`${col}${summaryStartRow + 4}`];
      if (cell) cell.s = totalStyle;
    });

    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "POS Receipts");

    ws["!cols"] = [
      { wch: 5 },
      { wch: 15 },
      { wch: 15 },
      { wch: 10 },
      { wch: 10 },
      { wch: 10 },
      { wch: 22 },
      { wch: 12 },
      { wch: 15 },
      { wch: 20 },
    ];

    ws["!rows"] = [{ hpt: 25 }, {}, { hpt: 22 }];

    const fileName = `pos_receipts_${new Date().toISOString().split("T")[0]}.xlsx`;
    XLSX.writeFile(wb, fileName);
    toast.success("Data exported successfully");
  };

  return (
    <div className="min-h-screen bg-background" dir="ltr">
      <div className="container mx-auto px-4 py-6 max-w-4xl">
        {/* Header */}
        <div className="mb-6">
          <h1 className="text-xl sm:text-2xl font-bold font-lusail">POS Receipt Reader</h1>
        </div>

        <div className="space-y-6">
          {/* Camera/Upload Section */}
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base font-medium">Capture or Upload Receipt Image</CardTitle>
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
                    {isProcessing ? "Processing..." : "Capture with Camera"}
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
                    {isProcessing ? "Processing..." : "Choose from Gallery"}
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
                        <span className="text-sm font-medium">Reading receipt...</span>
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
              <CardTitle className="text-base font-medium">Saved Receipts ({receipts.length})</CardTitle>
              <Button
                variant="outline"
                size="sm"
                onClick={handleExportToExcel}
                disabled={receipts.length === 0}
              >
                <FileDown className="w-4 h-4 mr-2" />
                Export Excel
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
                  <p>No saved receipts</p>
                  <p className="text-sm mt-1">Capture or upload an image to add a receipt</p>
                </div>
              ) : (
                <div className="overflow-x-auto -mx-4 sm:mx-0">
                  {/* Mobile Card View */}
                  <div className="block sm:hidden space-y-3 px-4">
                    {receipts.map((receipt, index) => (
                      <div
                        key={receipt.id}
                        className="bg-muted/30 rounded-lg p-4 border space-y-3"
                      >
                        <div className="flex items-center justify-between">
                          <span className="text-xs text-muted-foreground">#{index + 1}</span>
                          <Button
                            size="icon"
                            variant="ghost"
                            className="h-7 w-7 text-destructive hover:text-destructive hover:bg-destructive/10"
                            onClick={() => handleDelete(receipt.id)}
                          >
                            <Trash2 className="w-4 h-4" />
                          </Button>
                        </div>
                        <div className="grid grid-cols-2 gap-3 text-sm">
                          <div>
                            <p className="text-xs text-muted-foreground">Amount</p>
                            <p className="font-mono font-semibold">{receipt.amount_qar?.toLocaleString() ?? "-"} QAR</p>
                          </div>
                          <div>
                            <p className="text-xs text-muted-foreground">Seq #</p>
                            <p className="font-mono text-sm">{receipt.seq_number ?? "-"}</p>
                          </div>
                        </div>
                        <div className="grid grid-cols-3 gap-2 text-sm">
                          <div>
                            <p className="text-xs text-muted-foreground text-center">Normal</p>
                            <input
                              type="number"
                              min="0"
                              value={receipt.normal_tickets ?? 0}
                              onChange={(e) => handleTicketChange(receipt.id, "normal_tickets", parseInt(e.target.value) || 0)}
                              className="w-full h-8 text-center text-sm border rounded bg-background"
                            />
                          </div>
                          <div>
                            <p className="text-xs text-muted-foreground text-center">VIP</p>
                            <input
                              type="number"
                              min="0"
                              value={receipt.vip_tickets ?? 0}
                              onChange={(e) => handleTicketChange(receipt.id, "vip_tickets", parseInt(e.target.value) || 0)}
                              className="w-full h-8 text-center text-sm border rounded bg-background"
                            />
                          </div>
                          <div>
                            <p className="text-xs text-muted-foreground text-center">Parking</p>
                            <input
                              type="number"
                              min="0"
                              value={receipt.parking_tickets ?? 0}
                              onChange={(e) => handleTicketChange(receipt.id, "parking_tickets", parseInt(e.target.value) || 0)}
                              className="w-full h-8 text-center text-sm border rounded bg-background"
                            />
                          </div>
                        </div>
                        <div className="grid grid-cols-2 gap-3 text-sm">
                          <div>
                            <p className="text-xs text-muted-foreground">Auth #</p>
                            <p className="font-mono text-sm">{receipt.auth_number ?? "-"}</p>
                          </div>
                          <div>
                            <p className="text-xs text-muted-foreground">Card</p>
                            <p className="font-mono text-xs">{receipt.card_number_masked ?? "-"}</p>
                          </div>
                          <div>
                            <p className="text-xs text-muted-foreground">Time</p>
                            <p className="font-mono text-sm">{receipt.time ?? "-"}</p>
                          </div>
                        </div>
                        <div className="text-xs text-muted-foreground pt-1 border-t">
                          {new Date(receipt.created_at).toLocaleString("en-US")}
                        </div>
                      </div>
                    ))}
                  </div>

                  {/* Desktop Table View */}
                  <Table className="hidden sm:table">
                    <TableHeader>
                      <TableRow>
                        <TableHead className="text-left w-10">#</TableHead>
                        <TableHead className="text-left">Amount (QAR)</TableHead>
                        <TableHead className="text-left">Seq Number</TableHead>
                        <TableHead className="text-center">Normal</TableHead>
                        <TableHead className="text-center">VIP</TableHead>
                        <TableHead className="text-center">Parking</TableHead>
                        <TableHead className="text-left hidden md:table-cell">Card Number</TableHead>
                        <TableHead className="text-left hidden lg:table-cell">Time</TableHead>
                        <TableHead className="text-left hidden lg:table-cell">Auth Number</TableHead>
                        <TableHead className="text-left">Date</TableHead>
                        <TableHead className="text-left w-12">Delete</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {receipts.map((receipt, index) => (
                        <TableRow key={receipt.id}>
                          <TableCell className="font-mono text-muted-foreground">
                            {index + 1}
                          </TableCell>
                          <TableCell className="font-mono font-semibold">
                            {receipt.amount_qar?.toLocaleString() ?? "-"}
                          </TableCell>
                          <TableCell className="font-mono">
                            {receipt.seq_number ?? "-"}
                          </TableCell>
                          <TableCell>
                            <input
                              type="number"
                              min="0"
                              value={receipt.normal_tickets ?? 0}
                              onChange={(e) => handleTicketChange(receipt.id, "normal_tickets", parseInt(e.target.value) || 0)}
                              className="w-14 h-8 text-center text-sm border rounded bg-background"
                            />
                          </TableCell>
                          <TableCell>
                            <input
                              type="number"
                              min="0"
                              value={receipt.vip_tickets ?? 0}
                              onChange={(e) => handleTicketChange(receipt.id, "vip_tickets", parseInt(e.target.value) || 0)}
                              className="w-14 h-8 text-center text-sm border rounded bg-background"
                            />
                          </TableCell>
                          <TableCell>
                            <input
                              type="number"
                              min="0"
                              value={receipt.parking_tickets ?? 0}
                              onChange={(e) => handleTicketChange(receipt.id, "parking_tickets", parseInt(e.target.value) || 0)}
                              className="w-14 h-8 text-center text-sm border rounded bg-background"
                            />
                          </TableCell>
                          <TableCell className="font-mono text-xs hidden md:table-cell">
                            {receipt.card_number_masked ?? "-"}
                          </TableCell>
                          <TableCell className="font-mono hidden lg:table-cell">
                            {receipt.time ?? "-"}
                          </TableCell>
                          <TableCell className="font-mono hidden lg:table-cell">
                            {receipt.auth_number ?? "-"}
                          </TableCell>
                          <TableCell className="text-xs">
                            {new Date(receipt.created_at).toLocaleDateString("en-US")}
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

              {/* Summary Section */}
              {receipts.length > 0 && (
                <div className="mt-6 border-t pt-4">
                  <div className="overflow-x-auto">
                    <table className="w-full max-w-md mx-auto text-sm border-collapse">
                      <thead>
                        <tr>
                          <th colSpan={3} className="bg-primary/10 text-primary font-bold py-2 px-3 text-center border">
                            POS
                          </th>
                        </tr>
                        <tr className="bg-muted/50">
                          <th className="py-2 px-3 text-right border font-medium">Type</th>
                          <th className="py-2 px-3 text-center border font-medium">Tickets</th>
                          <th className="py-2 px-3 text-center border font-medium">Amount (QAR)</th>
                        </tr>
                      </thead>
                      <tbody>
                        <tr className="bg-green-50 dark:bg-green-900/20">
                          <td className="py-2 px-3 text-right border font-medium text-green-700 dark:text-green-400">normal</td>
                          <td className="py-2 px-3 text-center border font-mono">{totals.normal}</td>
                          <td className="py-2 px-3 text-center border font-mono">{totalAmounts.normal.toLocaleString()}</td>
                        </tr>
                        <tr className="bg-amber-50 dark:bg-amber-900/20">
                          <td className="py-2 px-3 text-right border font-medium text-amber-700 dark:text-amber-400">VIP</td>
                          <td className="py-2 px-3 text-center border font-mono">{totals.vip}</td>
                          <td className="py-2 px-3 text-center border font-mono">{totalAmounts.vip.toLocaleString()}</td>
                        </tr>
                        <tr className="bg-blue-50 dark:bg-blue-900/20">
                          <td className="py-2 px-3 text-right border font-medium text-blue-700 dark:text-blue-400">parking</td>
                          <td className="py-2 px-3 text-center border font-mono">{totals.parking}</td>
                          <td className="py-2 px-3 text-center border font-mono">{totalAmounts.parking.toLocaleString()}</td>
                        </tr>
                        <tr className="bg-primary/10 font-bold">
                          <td className="py-2 px-3 text-right border text-primary">المجموع</td>
                          <td className="py-2 px-3 text-center border font-mono">{grandTotalTickets}</td>
                          <td className="py-2 px-3 text-center border font-mono">{grandTotalAmount.toLocaleString()}</td>
                        </tr>
                      </tbody>
                    </table>
                  </div>
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
