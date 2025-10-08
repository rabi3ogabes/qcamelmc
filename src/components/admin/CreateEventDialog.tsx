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
    vip_quantity: "",
    vip_price: "",
    regular_quantity: "",
    regular_price: "",
    student_quantity: "",
    student_price: "",
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
          is_active: true,
        })
        .select()
        .single();

      if (eventError) throw eventError;

      const tickets = [];
      
      if (formData.vip_quantity && formData.vip_price) {
        tickets.push({
          event_id: event.id,
          type: "vip",
          available_quantity: parseInt(formData.vip_quantity),
          price: parseFloat(formData.vip_price),
          sold_quantity: 0,
        });
      }

      if (formData.regular_quantity && formData.regular_price) {
        tickets.push({
          event_id: event.id,
          type: "regular",
          available_quantity: parseInt(formData.regular_quantity),
          price: parseFloat(formData.regular_price),
          sold_quantity: 0,
        });
      }

      if (formData.student_quantity && formData.student_price) {
        tickets.push({
          event_id: event.id,
          type: "student",
          available_quantity: parseInt(formData.student_quantity),
          price: parseFloat(formData.student_price),
          sold_quantity: 0,
        });
      }

      if (tickets.length > 0) {
        const { error: ticketsError } = await supabase
          .from("tickets")
          .insert(tickets);

        if (ticketsError) throw ticketsError;
      }

      toast.success(t("savedSuccessfully"));
      setOpen(false);
      setFormData({
        title: "",
        description: "",
        event_date: "",
        location: "",
        image_url: "",
        vip_quantity: "",
        vip_price: "",
        regular_quantity: "",
        regular_price: "",
        student_quantity: "",
        student_price: "",
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

            <div className="border-t pt-4">
              <h3 className="font-lusail font-bold mb-4">{t("ticketConfiguration")}</h3>
              
              <div className="space-y-4">
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <Label htmlFor="vip_quantity" className="font-lusail">{t("vipQuantity")}</Label>
                    <Input
                      id="vip_quantity"
                      type="number"
                      min="0"
                      value={formData.vip_quantity}
                      onChange={(e) => setFormData({ ...formData, vip_quantity: e.target.value })}
                      className="font-lusail"
                    />
                  </div>
                  <div>
                    <Label htmlFor="vip_price" className="font-lusail">{t("vipPrice")}</Label>
                    <Input
                      id="vip_price"
                      type="number"
                      min="0"
                      step="0.01"
                      value={formData.vip_price}
                      onChange={(e) => setFormData({ ...formData, vip_price: e.target.value })}
                      className="font-lusail"
                    />
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <Label htmlFor="regular_quantity" className="font-lusail">{t("regularQuantity")}</Label>
                    <Input
                      id="regular_quantity"
                      type="number"
                      min="0"
                      value={formData.regular_quantity}
                      onChange={(e) => setFormData({ ...formData, regular_quantity: e.target.value })}
                      className="font-lusail"
                    />
                  </div>
                  <div>
                    <Label htmlFor="regular_price" className="font-lusail">{t("regularPrice")}</Label>
                    <Input
                      id="regular_price"
                      type="number"
                      min="0"
                      step="0.01"
                      value={formData.regular_price}
                      onChange={(e) => setFormData({ ...formData, regular_price: e.target.value })}
                      className="font-lusail"
                    />
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <Label htmlFor="student_quantity" className="font-lusail">{t("studentQuantity")}</Label>
                    <Input
                      id="student_quantity"
                      type="number"
                      min="0"
                      value={formData.student_quantity}
                      onChange={(e) => setFormData({ ...formData, student_quantity: e.target.value })}
                      className="font-lusail"
                    />
                  </div>
                  <div>
                    <Label htmlFor="student_price" className="font-lusail">{t("studentPrice")}</Label>
                    <Input
                      id="student_price"
                      type="number"
                      min="0"
                      step="0.01"
                      value={formData.student_price}
                      onChange={(e) => setFormData({ ...formData, student_price: e.target.value })}
                      className="font-lusail"
                    />
                  </div>
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