import { useState, useEffect } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { useTranslation } from "react-i18next";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

interface Event {
  id: string;
  title: string;
  description: string;
  event_date: string;
  location: string;
  image_url: string | null;
  is_active: boolean;
  display_order?: number;
}

interface EditEventDialogProps {
  event: Event | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onEventUpdated: () => void;
}

export const EditEventDialog = ({ event, open, onOpenChange, onEventUpdated }: EditEventDialogProps) => {
  const { t } = useTranslation();
  const [loading, setLoading] = useState(false);
  const [formData, setFormData] = useState({
    title: "",
    description: "",
    event_date: "",
    location: "",
    image_url: "",
    display_order: "0",
    vip_quantity: "",
    vip_price: "",
    normal_quantity: "",
    normal_price: "",
    parking_quantity: "",
    parking_price: "",
  });

  useEffect(() => {
    const fetchTickets = async () => {
      if (event) {
        const { data: tickets } = await supabase
          .from("tickets")
          .select("*")
          .eq("event_id", event.id);

        const vipTicket = tickets?.find(t => t.type === "vip");
        const normalTicket = tickets?.find(t => t.type === "normal");
        const parkingTicket = tickets?.find(t => t.type === "parking");

        setFormData({
          title: event.title,
          description: event.description || "",
          event_date: event.event_date.slice(0, 16),
          location: event.location,
          image_url: event.image_url || "",
          display_order: event.display_order?.toString() || "0",
          vip_quantity: vipTicket?.available_quantity.toString() || "",
          vip_price: vipTicket?.price.toString() || "",
          normal_quantity: normalTicket?.available_quantity.toString() || "",
          normal_price: normalTicket?.price.toString() || "",
          parking_quantity: parkingTicket?.available_quantity.toString() || "",
          parking_price: parkingTicket?.price.toString() || "",
        });
      }
    };
    
    fetchTickets();
  }, [event]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!event) return;
    
    setLoading(true);

    try {
      const { error } = await supabase
        .from("events")
        .update({
          title: formData.title,
          description: formData.description,
          event_date: formData.event_date,
          location: formData.location,
          image_url: formData.image_url || null,
          display_order: parseInt(formData.display_order) || 0,
        })
        .eq("id", event.id);

      if (error) throw error;

      // Get existing tickets
      const { data: existingTickets } = await supabase
        .from("tickets")
        .select("*")
        .eq("event_id", event.id);

      const ticketTypes: Array<{ type: "vip" | "normal" | "parking"; quantity: string; price: string }> = [
        { type: "vip", quantity: formData.vip_quantity, price: formData.vip_price },
        { type: "normal", quantity: formData.normal_quantity, price: formData.normal_price },
        { type: "parking", quantity: formData.parking_quantity, price: formData.parking_price },
      ];

      for (const ticket of ticketTypes) {
        const existing = existingTickets?.find(t => t.type === ticket.type);
        
        if (ticket.quantity && ticket.price) {
          if (existing) {
            // Update existing ticket
            await supabase
              .from("tickets")
              .update({
                available_quantity: parseInt(ticket.quantity),
                price: parseFloat(ticket.price),
              })
              .eq("id", existing.id);
          } else {
            // Insert new ticket
            await supabase
              .from("tickets")
              .insert({
                event_id: event.id,
                type: ticket.type,
                available_quantity: parseInt(ticket.quantity),
                price: parseFloat(ticket.price),
                sold_quantity: 0,
              });
          }
        } else if (existing) {
          // Delete ticket if both quantity and price are empty
          await supabase
            .from("tickets")
            .delete()
            .eq("id", existing.id);
        }
      }

      toast.success(t("savedSuccessfully"));
      onOpenChange(false);
      onEventUpdated();
    } catch (error) {
      console.error("Error updating event:", error);
      toast.error(t("failedToLoad"));
    } finally {
      setLoading(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="font-lusail text-2xl">{t("editEvent")}</DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-6">
          <div className="space-y-4">
            <div>
              <Label htmlFor="title" className="font-lusail">{t("eventTitle")}</Label>
              <Input
                id="title"
                value={formData.title}
                onChange={(e) => setFormData({ ...formData, title: e.target.value })}
                required
                className="font-lusail"
              />
            </div>

            <div>
              <Label htmlFor="description" className="font-lusail">{t("description")}</Label>
              <Textarea
                id="description"
                value={formData.description}
                onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                required
                className="font-lusail"
                rows={3}
              />
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label htmlFor="event_date" className="font-lusail">{t("eventDate")}</Label>
                <Input
                  id="event_date"
                  type="datetime-local"
                  value={formData.event_date}
                  onChange={(e) => setFormData({ ...formData, event_date: e.target.value })}
                  required
                  className="font-lusail"
                />
              </div>

              <div>
                <Label htmlFor="location" className="font-lusail">{t("location")}</Label>
                <Input
                  id="location"
                  value={formData.location}
                  onChange={(e) => setFormData({ ...formData, location: e.target.value })}
                  required
                  className="font-lusail"
                />
              </div>
            </div>

            <div>
              <Label htmlFor="image_url" className="font-lusail">{t("imageUrl")}</Label>
              <Input
                id="image_url"
                value={formData.image_url}
                onChange={(e) => setFormData({ ...formData, image_url: e.target.value })}
                placeholder="https://example.com/image.jpg"
                className="font-lusail"
              />
            </div>

            <div>
              <Label htmlFor="display_order" className="font-lusail">ترتيب العرض (الأقل يظهر أولاً)</Label>
              <Input
                id="display_order"
                type="number"
                value={formData.display_order}
                onChange={(e) => setFormData({ ...formData, display_order: e.target.value })}
                placeholder="0"
                className="font-lusail"
              />
              <p className="text-xs text-muted-foreground mt-1">
                استخدم الأرقام لترتيب الفعاليات (0، 1، 2، الخ...)
              </p>
            </div>

            <div className="space-y-3 pt-4 border-t">
              <Label className="font-lusail text-lg font-bold">أنواع التذاكر والأسعار</Label>
              
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <Label htmlFor="vip_quantity" className="font-lusail">عدد تذاكر VIP</Label>
                  <Input
                    id="vip_quantity"
                    type="number"
                    min="0"
                    value={formData.vip_quantity}
                    onChange={(e) => setFormData({ ...formData, vip_quantity: e.target.value })}
                    placeholder="100"
                    className="font-lusail"
                  />
                </div>
                <div>
                  <Label htmlFor="vip_price" className="font-lusail">سعر VIP (ريال)</Label>
                  <Input
                    id="vip_price"
                    type="number"
                    min="0"
                    step="0.01"
                    value={formData.vip_price}
                    onChange={(e) => setFormData({ ...formData, vip_price: e.target.value })}
                    placeholder="200"
                    className="font-lusail"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <Label htmlFor="normal_quantity" className="font-lusail">عدد تذاكر عادية</Label>
                  <Input
                    id="normal_quantity"
                    type="number"
                    min="0"
                    value={formData.normal_quantity}
                    onChange={(e) => setFormData({ ...formData, normal_quantity: e.target.value })}
                    placeholder="500"
                    className="font-lusail"
                  />
                </div>
                <div>
                  <Label htmlFor="normal_price" className="font-lusail">سعر عادية (ريال)</Label>
                  <Input
                    id="normal_price"
                    type="number"
                    min="0"
                    step="0.01"
                    value={formData.normal_price}
                    onChange={(e) => setFormData({ ...formData, normal_price: e.target.value })}
                    placeholder="150"
                    className="font-lusail"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <Label htmlFor="parking_quantity" className="font-lusail">عدد تذاكر مواقف</Label>
                  <Input
                    id="parking_quantity"
                    type="number"
                    min="0"
                    value={formData.parking_quantity}
                    onChange={(e) => setFormData({ ...formData, parking_quantity: e.target.value })}
                    placeholder="200"
                    className="font-lusail"
                  />
                </div>
                <div>
                  <Label htmlFor="parking_price" className="font-lusail">سعر مواقف (ريال)</Label>
                  <Input
                    id="parking_price"
                    type="number"
                    min="0"
                    step="0.01"
                    value={formData.parking_price}
                    onChange={(e) => setFormData({ ...formData, parking_price: e.target.value })}
                    placeholder="1"
                    className="font-lusail"
                  />
                </div>
              </div>
            </div>
          </div>

          <div className="flex justify-end gap-2">
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)} className="font-lusail">
              {t("cancel")}
            </Button>
            <Button type="submit" disabled={loading} className="font-lusail">
              {loading ? t("loading") : t("save")}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
};