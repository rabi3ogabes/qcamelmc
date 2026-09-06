import { useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogTrigger } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Sparkles } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

interface StartNewEventDialogProps {
  onEventCreated: () => void;
}

const emptyForm = {
  title: "",
  description: "",
  location: "",
  start_day: "",
  end_day: "",
  start_time: "",
  end_time: "",
  image_url: "",
  vip_quantity: "",
  vip_price: "",
  normal_quantity: "",
  normal_price: "",
  parking_quantity: "",
  parking_price: "",
};

export const StartNewEventDialog = ({ onEventCreated }: StartNewEventDialogProps) => {
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [archiveOld, setArchiveOld] = useState(true);
  const [formData, setFormData] = useState(emptyForm);

  const set = (key: keyof typeof emptyForm, value: string) =>
    setFormData((prev) => ({ ...prev, [key]: value }));

  const handleClose = (next: boolean) => {
    if (loading) return;
    setOpen(next);
    if (!next) {
      setFormData(emptyForm);
      setArchiveOld(true);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (loading) return;

    if (!formData.title.trim() || !formData.location.trim()) {
      toast.error("يرجى إدخال اسم الفعالية والموقع");
      return;
    }
    const start = new Date(formData.start_day);
    const end = new Date(formData.end_day);
    if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) {
      toast.error("يرجى اختيار تاريخ بداية وتاريخ نهاية صالحين");
      return;
    }
    if (end < start) {
      toast.error("تاريخ النهاية يجب أن يكون بعد تاريخ البداية");
      return;
    }
    if (formData.start_time && formData.end_time && formData.end_time <= formData.start_time) {
      toast.error("وقت النهاية يجب أن يكون بعد وقت البداية");
      return;
    }
    if (
      !formData.vip_quantity || !formData.vip_price ||
      !formData.normal_quantity || !formData.normal_price ||
      !formData.parking_quantity || !formData.parking_price
    ) {
      toast.error("يرجى إدخال عدد وسعر جميع أنواع التذاكر");
      return;
    }
    for (const [label, qty, price] of [
      ["VIP", formData.vip_quantity, formData.vip_price],
      ["عادي", formData.normal_quantity, formData.normal_price],
      ["مواقف", formData.parking_quantity, formData.parking_price],
    ] as const) {
      const q = parseInt(qty, 10);
      const p = parseFloat(price);
      if (!Number.isInteger(q) || q < 0 || !Number.isFinite(p) || p < 0) {
        toast.error(`قيم غير صحيحة لتذاكر ${label} — يرجى إدخال عدد وسعر صالحين`);
        return;
      }
    }


    setLoading(true);
    try {
      // 1) Archive the previous season (data is preserved, only hidden)
      if (archiveOld) {
        const { error: archiveError } = await supabase
          .from("events")
          .update({ is_archived: true, is_active: false, archived_at: new Date().toISOString() })
          .eq("is_archived", false);
        if (archiveError) throw archiveError;
      }

      // 2) Create the new event spanning the selected date range
      const startISO = new Date(`${formData.start_day}T${formData.start_time || "00:00"}:00`).toISOString();
      const endISO = new Date(`${formData.end_day}T${formData.end_time || "23:59"}:00`).toISOString();

      const { data: event, error: eventError } = await supabase
        .from("events")
        .insert({
          title: formData.title,
          description: formData.description,
          event_date: startISO,
          end_date: endISO,
          location: formData.location,
          image_url: formData.image_url || null,
          start_time: formData.start_time || null,
          end_time: formData.end_time || null,
          display_order: 0,
          is_active: true,
          is_archived: false,
        })
        .select()
        .single();

      if (eventError) throw eventError;

      // 3) Ticket types for the new event
      const { error: ticketsError } = await supabase.from("tickets").insert([
        {
          event_id: event.id,
          type: "vip" as const,
          price: parseFloat(formData.vip_price),
          available_quantity: parseInt(formData.vip_quantity),
          sold_quantity: 0,
        },
        {
          event_id: event.id,
          type: "normal" as const,
          price: parseFloat(formData.normal_price),
          available_quantity: parseInt(formData.normal_quantity),
          sold_quantity: 0,
        },
        {
          event_id: event.id,
          type: "parking" as const,
          price: parseFloat(formData.parking_price),
          available_quantity: parseInt(formData.parking_quantity),
          sold_quantity: 0,
        },
      ]);

      if (ticketsError) throw ticketsError;

      // 3.5) Make the new event the one customers see
      const { data: settingsRow } = await supabase.from("settings").select("id").maybeSingle();
      if (settingsRow?.id) {
        await supabase.from("settings").update({ current_event_id: event.id }).eq("id", settingsRow.id);
      }

      // 4) Log the season start
      await supabase.from("activity_logs").insert({
        activity_type: "new_event_started",
        user_type: "admin",
        action_data: {
          event_id: event.id,
          title: formData.title,
          start_day: formData.start_day,
          end_day: formData.end_day,
          archived_previous: archiveOld,
        },
      });

      toast.success("تم بدء الفعالية الجديدة بنجاح");
      setFormData(emptyForm);
      setOpen(false);
      onEventCreated();
    } catch (error) {
      console.error("Error starting new event:", error);
      toast.error("تعذر بدء الفعالية الجديدة");
    } finally {
      setLoading(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button className="font-lusail gap-2 bg-gradient-to-l from-primary to-primary/70 shadow-lg">
          <Sparkles className="w-4 h-4" />
          بدء فعالية جديدة
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto" dir="rtl">
        <DialogHeader>
          <DialogTitle className="font-lusail text-2xl">بدء فعالية جديدة</DialogTitle>
          <DialogDescription className="font-lusail">
            تُنشئ فعالية واحدة تمتد من يوم البداية إلى يوم النهاية. تبقى بيانات الفعاليات السابقة
            محفوظة بالكامل (العملاء والحجوزات) ويمكن الاطلاع عليها في الأرشيف.
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-5">
          <div>
            <Label className="font-lusail">اسم الفعالية</Label>
            <Input value={formData.title} onChange={(e) => set("title", e.target.value)} required className="font-lusail" />
          </div>

          <div>
            <Label className="font-lusail">الوصف</Label>
            <Textarea value={formData.description} onChange={(e) => set("description", e.target.value)} rows={3} className="font-lusail" />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <Label className="font-lusail">يوم البداية</Label>
              <Input type="date" value={formData.start_day} onChange={(e) => set("start_day", e.target.value)} required className="font-lusail" />
            </div>
            <div>
              <Label className="font-lusail">يوم النهاية</Label>
              <Input type="date" value={formData.end_day} onChange={(e) => set("end_day", e.target.value)} required className="font-lusail" />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <Label className="font-lusail">وقت البداية</Label>
              <Input type="time" value={formData.start_time} onChange={(e) => set("start_time", e.target.value)} className="font-lusail" />
            </div>
            <div>
              <Label className="font-lusail">وقت النهاية</Label>
              <Input type="time" value={formData.end_time} onChange={(e) => set("end_time", e.target.value)} className="font-lusail" />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <Label className="font-lusail">المكان</Label>
              <Input value={formData.location} onChange={(e) => set("location", e.target.value)} required className="font-lusail" />
            </div>
            <div>
              <Label className="font-lusail">رابط الصورة</Label>
              <Input value={formData.image_url} onChange={(e) => set("image_url", e.target.value)} placeholder="https://..." className="font-lusail" />
            </div>
          </div>

          <div className="space-y-3 pt-4 border-t">
            <Label className="font-lusail text-lg font-bold">أنواع التذاكر والأسعار</Label>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label className="font-lusail">عدد تذاكر VIP</Label>
                <Input type="number" min="0" value={formData.vip_quantity} onChange={(e) => set("vip_quantity", e.target.value)} className="font-lusail" />
              </div>
              <div>
                <Label className="font-lusail">سعر VIP (ريال)</Label>
                <Input type="number" min="0" step="0.01" value={formData.vip_price} onChange={(e) => set("vip_price", e.target.value)} className="font-lusail" />
              </div>
              <div>
                <Label className="font-lusail">عدد التذاكر العادية</Label>
                <Input type="number" min="0" value={formData.normal_quantity} onChange={(e) => set("normal_quantity", e.target.value)} className="font-lusail" />
              </div>
              <div>
                <Label className="font-lusail">سعر العادية (ريال)</Label>
                <Input type="number" min="0" step="0.01" value={formData.normal_price} onChange={(e) => set("normal_price", e.target.value)} className="font-lusail" />
              </div>
              <div>
                <Label className="font-lusail">عدد تذاكر المواقف</Label>
                <Input type="number" min="0" value={formData.parking_quantity} onChange={(e) => set("parking_quantity", e.target.value)} className="font-lusail" />
              </div>
              <div>
                <Label className="font-lusail">سعر المواقف (ريال)</Label>
                <Input type="number" min="0" step="0.01" value={formData.parking_price} onChange={(e) => set("parking_price", e.target.value)} className="font-lusail" />
              </div>
            </div>
          </div>

          <div className="flex items-center justify-between rounded-lg border p-3">
            <div>
              <Label className="font-lusail">أرشفة الفعاليات السابقة</Label>
              <p className="text-xs text-muted-foreground font-lusail mt-1">
                إخفاؤها من الواجهات مع الاحتفاظ بكل البيانات
              </p>
            </div>
            <Switch checked={archiveOld} onCheckedChange={setArchiveOld} />
          </div>

          <Button type="submit" disabled={loading} className="w-full font-lusail">
            {loading ? "جارٍ البدء..." : "بدء الفعالية"}
          </Button>
        </form>
      </DialogContent>
    </Dialog>
  );
};
