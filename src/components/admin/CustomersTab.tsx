import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { useTranslation } from "react-i18next";
import { User, Phone, Mail, Ticket, Calendar, Send, MessageCircle, Edit, QrCode, Trash2 } from "lucide-react";
import { toast } from "sonner";
import QRCode from "qrcode";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

interface Customer {
  id: string;
  name: string;
  email: string;
  phone: string;
  created_at: string;
  orders: Array<{
    id: string;
    booking_reference: string;
    ticket_type: string;
    quantity: number;
    total_amount: number;
    payment_status: string;
    created_at: string;
    qr_code?: string;
    ticket_holders: Array<{
      name: string;
      phone: string;
      nationality: string;
      ticket_type: string;
      qr_code?: string;
    }>;
  }>;
}

export const CustomersTab = () => {
  const { t } = useTranslation();
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState("");
  const [selectedCustomer, setSelectedCustomer] = useState<Customer | null>(null);
  const [sendingInvoice, setSendingInvoice] = useState<string | null>(null);
  const [sendingTicket, setSendingTicket] = useState<string | null>(null);
  const [editingCustomer, setEditingCustomer] = useState<Customer | null>(null);
  const [editForm, setEditForm] = useState({ name: "", email: "", phone: "" });
  const [saving, setSaving] = useState(false);
  const [qrCodes, setQrCodes] = useState<Record<string, string>>({});
  const [viewingQrCode, setViewingQrCode] = useState<{ code: string; name: string; reference: string } | null>(null);

  useEffect(() => {
    fetchCustomers();
  }, []);

  // Generate QR codes for selected customer's ticket holders and orders
  useEffect(() => {
    const generateQRCodes = async () => {
      if (!selectedCustomer) {
        setQrCodes({});
        return;
      }

      const codes: Record<string, string> = {};
      for (const order of selectedCustomer.orders) {
        // Generate QR code for order
        if (order.qr_code) {
          try {
            const qrDataUrl = await QRCode.toDataURL(order.qr_code, {
              width: 200,
              margin: 2,
            });
            codes[order.qr_code] = qrDataUrl;
          } catch (error) {
            console.error("Error generating QR code:", error);
          }
        }
        
        // Generate QR codes for ticket holders
        if (order.ticket_holders) {
          for (const holder of order.ticket_holders) {
            if (holder.qr_code) {
              try {
                const qrDataUrl = await QRCode.toDataURL(holder.qr_code, {
                  width: 500,
                  margin: 2,
                });
                codes[holder.qr_code] = qrDataUrl;
              } catch (error) {
                console.error("Error generating QR code:", error);
              }
            }
          }
        }
      }
      setQrCodes(codes);
    };

    generateQRCodes();
  }, [selectedCustomer]);

  const fetchCustomers = async () => {
    try {
      const { data, error } = await supabase
        .from("customers")
        .select(`
          *,
          orders (
            id,
            booking_reference,
            ticket_type,
            quantity,
            total_amount,
            payment_status,
            created_at,
            qr_code,
            ticket_holders (
              name,
              phone,
              nationality,
              ticket_type,
              qr_code
            )
          )
        `)
        .order("created_at", { ascending: false });

      if (error) throw error;

      // Filter out customers with no orders
      const customersWithOrders = (data || []).filter(
        (customer) => customer.orders && customer.orders.length > 0
      );

      setCustomers(customersWithOrders);
    } catch (error) {
      console.error("Error fetching customers:", error);
    } finally {
      setLoading(false);
    }
  };

  const filteredCustomers = customers.filter(
    (customer) =>
      customer.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
      customer.email.toLowerCase().includes(searchTerm.toLowerCase()) ||
      customer.phone.includes(searchTerm)
  );

  const sendInvoiceToWhatsApp = async (customer: Customer, orderId: string, e: React.MouseEvent) => {
    e.stopPropagation(); // Prevent opening the customer dialog
    
    setSendingInvoice(orderId);
    
    try {
      // Fetch webhook URL from settings
      const { data: settings, error: settingsError } = await supabase
        .from("settings")
        .select("webhook_url, admin_phone")
        .maybeSingle();

      if (settingsError) throw settingsError;

      if (!settings?.webhook_url) {
        toast.error("لم يتم تكوين رابط n8n webhook في الإعدادات");
        return;
      }

      // Find the order
      const order = customer.orders.find(o => o.id === orderId);
      if (!order) {
        toast.error("لم يتم العثور على الطلب");
        return;
      }

      // Send to n8n webhook
      console.log("Sending invoice via n8n webhook:", settings.webhook_url);
      // Format phone number: ensure 974 country code without +
      let formattedAdminPhone = null;
      if (settings.admin_phone) {
        const cleanPhone = settings.admin_phone.replace(/[\+\s]/g, '');
        formattedAdminPhone = cleanPhone.startsWith('974') ? cleanPhone : `974${cleanPhone}`;
      }

      // Format customer and ticket holder phones
      const formatPhoneNumber = (phone: string | null | undefined) => {
        if (!phone) return null;
        const cleanPhone = phone.replace(/[\+\s]/g, '');
        return cleanPhone.startsWith('974') ? cleanPhone : `974${cleanPhone}`;
      };

      const formattedCustomer = {
        name: customer.name,
        email: customer.email,
        phone: formatPhoneNumber(customer.phone)
      };

      const formattedHolders = order.ticket_holders?.map((holder: any) => ({
        ...holder,
        phone: formatPhoneNumber(holder.phone)
      })) || [];
      
      const response = await fetch(settings.webhook_url, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          customer: formattedCustomer,
          order: {
            id: order.id,
            booking_reference: order.booking_reference,
            ticket_type: order.ticket_type,
            quantity: order.quantity,
            total_amount: order.total_amount,
            payment_status: order.payment_status,
          },
          ticketHolders: formattedHolders,
          bookingReference: order.booking_reference,
          adminPhone: formattedAdminPhone,
          timestamp: new Date().toISOString(),
          action: "send_invoice", // To differentiate from booking confirmation
        }),
      });

      if (!response.ok) {
        throw new Error("فشل إرسال الفاتورة");
      }

      toast.success("تم إرسال الفاتورة إلى واتساب بنجاح");
    } catch (error) {
      console.error("Error sending invoice:", error);
      toast.error("فشل إرسال الفاتورة. يرجى المحاولة مرة أخرى");
    } finally {
      setSendingInvoice(null);
    }
  };

  const sendTicketToWhatsApp = async (customer: Customer, e: React.MouseEvent) => {
    e.stopPropagation(); // Prevent opening the customer dialog
    
    // Get the latest order
    const latestOrder = customer.orders[0];
    if (!latestOrder) {
      toast.error("لا توجد حجوزات لهذا العميل");
      return;
    }

    setSendingTicket(customer.id);
    
    try {
      // Fetch webhook URL from settings
      const { data: settings, error: settingsError } = await supabase
        .from("settings")
        .select("webhook_url, admin_phone")
        .maybeSingle();

      if (settingsError) throw settingsError;

      if (!settings?.webhook_url) {
        toast.error("لم يتم تكوين رابط n8n webhook في الإعدادات");
        return;
      }

      // Generate QR codes for ticket holders with 500x500 size and upload to storage
      const holdersWithQrImages = await Promise.all(
        (latestOrder.ticket_holders || []).map(async (holder: any) => {
          let qrCodeImageUrl = null;
          if (holder.qr_code) {
            try {
              // Generate QR code as canvas
              const canvas = document.createElement('canvas');
              await QRCode.toCanvas(canvas, holder.qr_code, {
                width: 500,
                margin: 2,
              });
              
              // Convert canvas to blob (JPEG format)
              const blob = await new Promise<Blob>((resolve) => {
                canvas.toBlob((blob) => resolve(blob!), 'image/jpeg', 0.95);
              });
              
              // Upload to storage
              const fileName = `${holder.id || Date.now()}-${Math.random().toString(36).substring(7)}.jpg`;
              const { data: uploadData, error: uploadError } = await supabase.storage
                .from('qr-codes')
                .upload(fileName, blob, {
                  contentType: 'image/jpeg',
                  cacheControl: '3600',
                  upsert: false
                });
              
              if (uploadError) {
                console.error("Error uploading QR code:", uploadError);
              } else {
                // Get public URL
                const { data: { publicUrl } } = supabase.storage
                  .from('qr-codes')
                  .getPublicUrl(fileName);
                qrCodeImageUrl = publicUrl;
              }
            } catch (error) {
              console.error("Error generating QR code:", error);
            }
          }
          return {
            ...holder,
            qr_code_image: qrCodeImageUrl
          };
        })
      );

      // Send to n8n webhook
      console.log("Sending ticket via n8n webhook:", settings.webhook_url);
      // Format phone number: ensure 974 country code without +
      let formattedAdminPhone = null;
      if (settings.admin_phone) {
        const cleanPhone = settings.admin_phone.replace(/[\+\s]/g, '');
        formattedAdminPhone = cleanPhone.startsWith('974') ? cleanPhone : `974${cleanPhone}`;
      }

      // Format customer and ticket holder phones
      const formatPhoneNumber = (phone: string | null | undefined) => {
        if (!phone) return null;
        const cleanPhone = phone.replace(/[\+\s]/g, '');
        return cleanPhone.startsWith('974') ? cleanPhone : `974${cleanPhone}`;
      };

      const formattedCustomer = {
        name: customer.name,
        email: customer.email,
        phone: formatPhoneNumber(customer.phone)
      };

      const formattedHolders = holdersWithQrImages.map((holder: any) => ({
        name: holder.name,
        phone: formatPhoneNumber(holder.phone),
        nationality: holder.nationality,
        ticket_type: holder.ticket_type,
        qr_code: holder.qr_code,
        qr_code_image: holder.qr_code_image // Public URL to .jpg image
      }));
      
      const response = await fetch(settings.webhook_url, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          customer: formattedCustomer,
          order: {
            id: latestOrder.id,
            booking_reference: latestOrder.booking_reference,
            ticket_type: latestOrder.ticket_type,
            quantity: latestOrder.quantity,
            total_amount: latestOrder.total_amount,
            payment_status: latestOrder.payment_status,
          },
          ticketHolders: formattedHolders,
          bookingReference: latestOrder.booking_reference,
          adminPhone: formattedAdminPhone,
          timestamp: new Date().toISOString(),
          action: "send_ticket", // To differentiate action type
        }),
      });

      if (!response.ok) {
        throw new Error("فشل إرسال التذكرة");
      }

      toast.success("تم إرسال التذكرة إلى واتساب بنجاح");
    } catch (error) {
      console.error("Error sending ticket:", error);
      toast.error("فشل إرسال التذكرة. يرجى المحاولة مرة أخرى");
    } finally {
      setSendingTicket(null);
    }
  };

  const handleEditCustomer = (customer: Customer) => {
    setEditingCustomer(customer);
    setEditForm({
      name: customer.name,
      email: customer.email,
      phone: customer.phone,
    });
  };

  const handleSaveCustomer = async () => {
    if (!editingCustomer) return;

    setSaving(true);
    try {
      const { error } = await supabase
        .from("customers")
        .update({
          name: editForm.name,
          email: editForm.email,
          phone: editForm.phone,
        })
        .eq("id", editingCustomer.id);

      if (error) throw error;

      toast.success("تم تحديث بيانات العميل بنجاح");
      setEditingCustomer(null);
      fetchCustomers();
      
      // Update selected customer if it's the same one
      if (selectedCustomer?.id === editingCustomer.id) {
        setSelectedCustomer({
          ...selectedCustomer,
          name: editForm.name,
          email: editForm.email,
          phone: editForm.phone,
        });
      }
    } catch (error) {
      console.error("Error updating customer:", error);
      toast.error("فشل تحديث بيانات العميل");
    } finally {
      setSaving(false);
    }
  };

  const handleDeleteCustomer = async (customerId: string, e: React.MouseEvent) => {
    e.stopPropagation();
    
    if (!confirm("هل أنت متأكد من حذف هذا العميل وجميع حجوزاته وتذاكره؟ لا يمكن التراجع عن هذا الإجراء.")) {
      return;
    }

    try {
      // First, delete all ticket holders for all orders of this customer
      const { data: orders } = await supabase
        .from("orders")
        .select("id")
        .eq("customer_id", customerId);

      if (orders && orders.length > 0) {
        const orderIds = orders.map(o => o.id);
        
        // Delete ticket holders
        const { error: ticketHoldersError } = await supabase
          .from("ticket_holders")
          .delete()
          .in("order_id", orderIds);

        if (ticketHoldersError) throw ticketHoldersError;
      }

      // Delete all orders for this customer
      const { error: ordersError } = await supabase
        .from("orders")
        .delete()
        .eq("customer_id", customerId);

      if (ordersError) throw ordersError;

      // Finally, delete the customer
      const { error: customerError } = await supabase
        .from("customers")
        .delete()
        .eq("id", customerId);

      if (customerError) throw customerError;

      toast.success("تم حذف العميل وجميع حجوزاته بنجاح");
      fetchCustomers();
      
      // Close dialog if this customer was selected
      if (selectedCustomer?.id === customerId) {
        setSelectedCustomer(null);
      }
    } catch (error) {
      console.error("Error deleting customer:", error);
      toast.error("فشل حذف العميل. يرجى المحاولة مرة أخرى");
    }
  };

  if (loading) {
    return <div className="text-center py-12 font-lusail">{t("loading")}</div>;
  }

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <h2 className="text-2xl font-bold font-lusail">العملاء والحجوزات</h2>
        <Input
          placeholder="بحث بالاسم أو الهاتف..."
          value={searchTerm}
          onChange={(e) => setSearchTerm(e.target.value)}
          className="max-w-sm font-lusail"
        />
      </div>

      {filteredCustomers.length === 0 ? (
        <Card className="p-8 text-center">
          <p className="text-muted-foreground font-lusail">لا يوجد عملاء مع حجوزات</p>
        </Card>
      ) : (
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-4">
          {filteredCustomers.map((customer) => (
            <Card
              key={customer.id}
              className="p-4 hover:shadow-lg transition-shadow cursor-pointer"
              onClick={() => setSelectedCustomer(customer)}
            >
              <div className="flex flex-col items-center text-center space-y-3 relative">
                <Button
                  size="icon"
                  variant="ghost"
                  onClick={(e) => handleDeleteCustomer(customer.id, e)}
                  className="absolute top-0 right-0 h-7 w-7 text-destructive hover:text-destructive hover:bg-destructive/10"
                  title="حذف العميل وجميع حجوزاته"
                >
                  <Trash2 className="w-4 h-4" />
                </Button>
                <div className="w-16 h-16 rounded-full bg-primary/10 flex items-center justify-center">
                  <User className="w-8 h-8 text-primary" />
                </div>
                <div>
                  <h3 className="font-bold font-lusail text-sm">{customer.name}</h3>
                  <p className="text-xs text-muted-foreground font-lusail mt-1">
                    {customer.phone}
                  </p>
                </div>
                <Badge variant="secondary" className="font-lusail text-xs">
                  {customer.orders.length} {customer.orders.length === 1 ? "حجز" : "حجوزات"}
                </Badge>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={(e) => sendTicketToWhatsApp(customer, e)}
                  disabled={sendingTicket === customer.id}
                  className="w-full"
                  title="إرسال التذكرة عبر n8n"
                >
                  {sendingTicket === customer.id ? (
                    <span className="animate-spin">⏳</span>
                  ) : (
                    <>
                      <Ticket className="w-3.5 h-3.5 ml-1" />
                      <span className="text-xs">إرسال التذكرة</span>
                    </>
                  )}
                </Button>
              </div>
            </Card>
          ))}
        </div>
      )}

      {/* Customer Details Dialog */}
      <Dialog open={!!selectedCustomer} onOpenChange={() => setSelectedCustomer(null)}>
        <DialogContent className="max-w-3xl max-h-[80vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="font-lusail text-2xl">تفاصيل العميل</DialogTitle>
          </DialogHeader>

          {selectedCustomer && (
            <div className="space-y-6">
              {/* Customer Info */}
              <Card className="p-4 bg-muted/30">
                <div className="flex items-start justify-between">
                  <div className="space-y-2 flex-1">
                    <div className="flex items-center gap-2">
                      <User className="w-4 h-4 text-primary" />
                      <span className="font-bold text-lg font-lusail">{selectedCustomer.name}</span>
                    </div>
                    <div className="flex items-center gap-2 text-muted-foreground">
                      <Mail className="w-4 h-4" />
                      <span className="font-lusail">{selectedCustomer.email}</span>
                    </div>
                    <div className="flex items-center gap-2 text-muted-foreground">
                      <Phone className="w-4 h-4" />
                      <span className="font-lusail">{selectedCustomer.phone}</span>
                    </div>
                  </div>
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => handleEditCustomer(selectedCustomer)}
                  >
                    <Edit className="w-4 h-4 ml-1" />
                    <span className="font-lusail">تعديل</span>
                  </Button>
                </div>
              </Card>

              {/* Orders */}
              <div className="space-y-4">
                <h3 className="font-bold text-lg font-lusail">الحجوزات</h3>
                {selectedCustomer.orders.map((order) => (
                  <Card key={order.id} className="p-4">
                    <div className="space-y-3">
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-3">
                          <Calendar className="w-4 h-4 text-primary" />
                          <span className="font-semibold font-lusail">
                            {order.booking_reference}
                          </span>
                          <Badge
                            variant={
                              order.payment_status === "confirmed"
                                ? "default"
                                : order.payment_status === "pending"
                                ? "secondary"
                                : "destructive"
                            }
                            className="font-lusail"
                          >
                            {order.payment_status === "confirmed"
                              ? "مؤكد"
                              : order.payment_status === "pending"
                              ? "قيد الانتظار"
                              : "ملغي"}
                          </Badge>
                        </div>
                        <div className="flex items-center gap-3">
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={(e) => sendInvoiceToWhatsApp(selectedCustomer, order.id, e)}
                            disabled={sendingInvoice === order.id}
                            title="إرسال الفاتورة عبر واتساب"
                          >
                            {sendingInvoice === order.id ? (
                              <span className="animate-spin">⏳</span>
                            ) : (
                              <MessageCircle className="w-4 h-4 text-green-600" />
                            )}
                          </Button>
                          {order.qr_code && qrCodes[order.qr_code] && (
                            <div className="flex-shrink-0 bg-white p-2 rounded">
                              <img
                                src={qrCodes[order.qr_code]}
                                alt={`QR Code for ${order.booking_reference}`}
                                className="w-[200px] h-[200px]"
                                style={{ display: 'block' }}
                              />
                            </div>
                          )}
                          <div className="text-left">
                            <div className="font-bold text-primary font-lusail">
                              {parseFloat(order.total_amount.toString()).toFixed(2)} {t("qar")}
                            </div>
                            <div className="text-sm text-muted-foreground font-lusail">
                              {order.quantity} تذكرة
                            </div>
                          </div>
                        </div>
                      </div>

                      {/* Ticket Holders */}
                      {order.ticket_holders && order.ticket_holders.length > 0 && (
                        <div className="mt-3 pt-3 border-t border-border/50">
                          <div className="flex items-center gap-2 mb-2">
                            <Ticket className="w-4 h-4 text-muted-foreground" />
                            <span className="text-sm font-semibold font-lusail">
                              حاملو التذاكر:
                            </span>
                          </div>
                          <div className="grid gap-4">
                            {order.ticket_holders.map((holder, idx) => (
                              <div
                                key={idx}
                                className="bg-muted/30 rounded p-4 text-sm font-lusail"
                              >
                                <div className="flex justify-between items-start gap-4">
                                  <div className="flex-1">
                                    <div className="flex justify-between items-center mb-2">
                                      <span className="font-medium">{holder.name}</span>
                                      <Badge variant="outline" className="text-xs">
                                        {holder.ticket_type.toUpperCase()}
                                      </Badge>
                                    </div>
                                    <div className="text-xs text-muted-foreground">
                                      {holder.phone} • {holder.nationality}
                                    </div>
                                    {holder.qr_code && (
                                      <div className="text-xs text-muted-foreground mt-1 font-mono">
                                        {holder.qr_code}
                                      </div>
                                    )}
                                  </div>
                                  {holder.qr_code && qrCodes[holder.qr_code] && (
                                    <Button
                                      size="sm"
                                      variant="outline"
                                      onClick={() => setViewingQrCode({ code: qrCodes[holder.qr_code], name: holder.name, reference: holder.qr_code })}
                                      className="flex-shrink-0"
                                    >
                                      <QrCode className="w-4 h-4" />
                                    </Button>
                                  )}
                                </div>
                              </div>
                            ))}
                          </div>
                        </div>
                      )}

                      <div className="text-xs text-muted-foreground font-lusail">
                        {new Date(order.created_at).toLocaleDateString("en-US", {
                          year: "numeric",
                          month: "long",
                          day: "numeric",
                          hour: "2-digit",
                          minute: "2-digit",
                        })}
                      </div>
                    </div>
                  </Card>
                ))}
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* QR Code Viewer Dialog */}
      <Dialog open={!!viewingQrCode} onOpenChange={() => setViewingQrCode(null)}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="font-lusail text-xl">
              QR Code - {viewingQrCode?.name}
            </DialogTitle>
          </DialogHeader>
          {viewingQrCode && (
            <div className="space-y-4">
              <div className="flex justify-center p-4">
                <img
                  src={viewingQrCode.code}
                  alt={`QR Code for ${viewingQrCode.name}`}
                  className="w-full max-w-[400px] h-auto"
                />
              </div>
              <div className="bg-muted p-4 rounded-lg">
                <p className="text-sm font-medium mb-2 font-lusail">QR Code Value:</p>
                <p className="font-mono text-xs break-all bg-background p-2 rounded border">
                  {viewingQrCode.reference}
                </p>
                <p className="text-xs text-muted-foreground mt-2 font-lusail">
                  This is the value encoded in the QR code. It should match what the scanner reads.
                </p>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* Edit Customer Dialog */}
      <Dialog open={!!editingCustomer} onOpenChange={() => setEditingCustomer(null)}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="font-lusail text-xl">تعديل بيانات العميل</DialogTitle>
          </DialogHeader>

          <div className="space-y-4">
            <div>
              <label className="text-sm font-medium font-lusail block mb-2">الاسم</label>
              <Input
                value={editForm.name}
                onChange={(e) => setEditForm({ ...editForm, name: e.target.value })}
                placeholder="اسم العميل"
                className="font-lusail"
              />
            </div>

            <div>
              <label className="text-sm font-medium font-lusail block mb-2">البريد الإلكتروني</label>
              <Input
                type="email"
                value={editForm.email}
                onChange={(e) => setEditForm({ ...editForm, email: e.target.value })}
                placeholder="email@example.com"
                className="font-lusail"
              />
            </div>

            <div>
              <label className="text-sm font-medium font-lusail block mb-2">رقم الهاتف</label>
              <Input
                value={editForm.phone}
                onChange={(e) => setEditForm({ ...editForm, phone: e.target.value })}
                placeholder="+974 XXXX XXXX"
                className="font-lusail"
              />
            </div>

            <div className="flex justify-end gap-2 pt-4">
              <Button
                variant="outline"
                onClick={() => setEditingCustomer(null)}
                disabled={saving}
                className="font-lusail"
              >
                إلغاء
              </Button>
              <Button
                onClick={handleSaveCustomer}
                disabled={saving}
                className="font-lusail"
              >
                {saving ? "جاري الحفظ..." : "حفظ التعديلات"}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
};
