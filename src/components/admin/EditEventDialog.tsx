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
  });

  useEffect(() => {
    if (event) {
      setFormData({
        title: event.title,
        description: event.description || "",
        event_date: event.event_date.slice(0, 16), // Format for datetime-local
        location: event.location,
        image_url: event.image_url || "",
      });
    }
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
        })
        .eq("id", event.id);

      if (error) throw error;

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