import { useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Plus } from "lucide-react";
import { useTranslation } from "react-i18next";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

interface CreateEventDialogProps {
  onEventCreated: () => void;
}

export const CreateEventDialog = ({ onEventCreated }: CreateEventDialogProps) => {
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [formData, setFormData] = useState({
    title: "",
    description: "",
    event_date: "",
    location: "",
    image_url: "",
    display_order: "0",
    start_time: "",
    end_time: "",
    vip_quantity: "",
    vip_price: "",
    normal_quantity: "",
    normal_price: "",
    parking_quantity: "",
    parking_price: "",
  });

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);

    try {
      const { data: event, error: eventError } = await supabase
        .from("events")
        .insert({
          title: formData.title,
          description: formData.description,
          event_date: formData.event_date,
          location: formData.location,
          image_url: formData.image_url || null,
          display_order: parseInt(formData.display_order) || 0,
          start_time: formData.start_time || null,
          end_time: formData.end_time || null,
          is_active: true,
        })
        .select()
        .single();

      if (eventError) throw eventError;

      // Create tickets for the event - all 3 types are REQUIRED
      const ticketsToInsert: Array<{
        event_id: string;
        type: "vip" | "normal" | "parking";
        price: number;
        available_quantity: number;
        sold_quantity: number;
      }> = [];
      
      // Validate that all 3 ticket types have data
      if (!formData.vip_quantity || !formData.vip_price) {
        toast.error("يرجى إدخال عدد وسعر تذاكر VIP");
        setLoading(false);
        return;
      }
      
      if (!formData.normal_quantity || !formData.normal_price) {
        toast.error("يرجى إدخال عدد وسعر التذاكر العادية");
        setLoading(false);
        return;
      }
      
      if (!formData.parking_quantity || !formData.parking_price) {
        toast.error("يرجى إدخال عدد وسعر تذاكر المواقف");
        setLoading(false);
        return;
      }

      // Add VIP tickets
      ticketsToInsert.push({
        event_id: event.id,
        type: "vip",
        price: parseFloat(formData.vip_price),
        available_quantity: parseInt(formData.vip_quantity),
        sold_quantity: 0,
      });
      
      // Add Normal tickets
      ticketsToInsert.push({
        event_id: event.id,
        type: "normal",
        price: parseFloat(formData.normal_price),
        available_quantity: parseInt(formData.normal_quantity),
        sold_quantity: 0,
      });
      
      // Add Parking tickets
      ticketsToInsert.push({
        event_id: event.id,
        type: "parking",
        price: parseFloat(formData.parking_price),
        available_quantity: parseInt(formData.parking_quantity),
        sold_quantity: 0,
      });

      const { error: ticketsError } = await supabase
        .from("tickets")
        .insert(ticketsToInsert);

      if (ticketsError) throw ticketsError;

      toast.success(t("savedSuccessfully"));
      setOpen(false);
      setFormData({
        title: "",
        description: "",
        event_date: "",
        location: "",
        image_url: "",
        display_order: "0",
        start_time: "",
        end_time: "",
        vip_quantity: "",
        vip_price: "",
        normal_quantity: "",
        normal_price: "",
        parking_quantity: "",
        parking_price: "",
      });
      onEventCreated();
    } catch (error) {
      console.error("Error creating event:", error);
      toast.error(t("failedToLoad"));
    } finally {
      setLoading(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button className="font-lusail">
          <Plus className="w-4 h-4 ml-2" />
          {t("createEvent")}
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="font-lusail text-2xl">{t("createEvent")}</DialogTitle>
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

            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label htmlFor="start_time" className="font-lusail">وقت البداية</Label>
                <Input
                  id="start_time"
                  type="time"
                  value={formData.start_time}
                  onChange={(e) => setFormData({ ...formData, start_time: e.target.value })}
                  className="font-lusail"
                />
              </div>

              <div>
                <Label htmlFor="end_time" className="font-lusail">وقت النهاية</Label>
                <Input
                  id="end_time"
                  type="time"
                  value={formData.end_time}
                  onChange={(e) => setFormData({ ...formData, end_time: e.target.value })}
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
            <Button type="button" variant="outline" onClick={() => setOpen(false)} className="font-lusail">
              {t("cancel")}
            </Button>
            <Button type="submit" disabled={loading} className="font-lusail">
              {loading ? t("loading") : t("createEvent")}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
};