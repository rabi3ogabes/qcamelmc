import { useState, useEffect } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useTranslation } from "react-i18next";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

interface Ticket {
  id: string;
  type: string;
  price: number;
  available_quantity: number;
  sold_quantity: number;
  event_id: string;
}

interface EditTicketDialogProps {
  ticket: Ticket | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onTicketUpdated: () => void;
}

export const EditTicketDialog = ({ ticket, open, onOpenChange, onTicketUpdated }: EditTicketDialogProps) => {
  const { t } = useTranslation();
  const [price, setPrice] = useState("");
  const [availableQuantity, setAvailableQuantity] = useState("");
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (ticket) {
      setPrice(ticket.price.toString());
      setAvailableQuantity(ticket.available_quantity.toString());
    }
  }, [ticket]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!ticket) return;

    setLoading(true);
    try {
      const { error } = await supabase
        .from("tickets")
        .update({
          price: parseFloat(price),
          available_quantity: parseInt(availableQuantity)
        })
        .eq("id", ticket.id);

      if (error) throw error;

      toast.success(t("savedSuccessfully"));
      onTicketUpdated();
      onOpenChange(false);
    } catch (error) {
      console.error("Error updating ticket:", error);
      toast.error("فشل في تحديث التذكرة");
    } finally {
      setLoading(false);
    }
  };

  const getTicketTypeName = (type: string) => {
    switch(type) {
      case "vip": return t("vipAccess");
      case "normal": return t("generalAdmission");
      case "parking": return t("parking");
      default: return type;
    }
  };

  if (!ticket) return null;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md font-lusail">
        <DialogHeader>
          <DialogTitle className="font-lusail">تعديل التذكرة</DialogTitle>
        </DialogHeader>
        
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <Label className="font-lusail">نوع التذكرة</Label>
            <Input 
              value={getTicketTypeName(ticket.type)}
              disabled
              className="mt-2 bg-muted font-lusail"
            />
          </div>

          <div>
            <Label htmlFor="price" className="font-lusail">السعر (ريال قطري)</Label>
            <Input
              id="price"
              type="number"
              step="0.01"
              value={price}
              onChange={(e) => setPrice(e.target.value)}
              required
              className="mt-2 font-lusail"
            />
          </div>

          <div>
            <Label htmlFor="quantity" className="font-lusail">الكمية المتاحة</Label>
            <Input
              id="quantity"
              type="number"
              value={availableQuantity}
              onChange={(e) => setAvailableQuantity(e.target.value)}
              required
              className="mt-2 font-lusail"
            />
            <p className="text-xs text-muted-foreground mt-1">
              تم بيع {ticket.sold_quantity} تذكرة حتى الآن
            </p>
          </div>

          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)} className="font-lusail">
              {t("cancel")}
            </Button>
            <Button type="submit" disabled={loading} className="font-lusail">
              {loading ? t("loading") : t("save")}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
};
