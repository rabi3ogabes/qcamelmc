import { useEffect, useState } from "react";
import { Card } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { Star, Loader2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

const NONE = "__all__";

interface EventOption {
  id: string;
  title: string;
  event_date: string;
}

interface CurrentEventSelectorProps {
  onChanged?: () => void;
}

export const CurrentEventSelector = ({ onChanged }: CurrentEventSelectorProps) => {
  const [events, setEvents] = useState<EventOption[]>([]);
  const [settingsId, setSettingsId] = useState<string | null>(null);
  const [currentEventId, setCurrentEventId] = useState<string>(NONE);
  const [saving, setSaving] = useState(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    load();
  }, []);

  const load = async () => {
    try {
      const [{ data: eventRows }, { data: settingsRow }] = await Promise.all([
        supabase
          .from("events")
          .select("id, title, event_date")
          .eq("is_archived", false)
          .order("event_date", { ascending: true }),
        supabase.from("settings").select("id, current_event_id").maybeSingle(),
      ]);

      setEvents((eventRows || []) as EventOption[]);
      setSettingsId(settingsRow?.id || null);
      setCurrentEventId(settingsRow?.current_event_id || NONE);
    } catch (error) {
      console.error("Error loading current event selector:", error);
    } finally {
      setLoading(false);
    }
  };

  const save = async (value: string) => {
    if (!settingsId) {
      toast.error("لا توجد إعدادات محفوظة");
      return;
    }
    setSaving(true);
    setCurrentEventId(value);
    try {
      const { error } = await supabase
        .from("settings")
        .update({ current_event_id: value === NONE ? null : value })
        .eq("id", settingsId);

      if (error) throw error;
      toast.success(
        value === NONE
          ? "سيظهر للعملاء جميع الفعاليات النشطة"
          : "تم تحديد الفعالية الحالية للعملاء"
      );
      onChanged?.();
    } catch (error) {
      console.error("Error saving current event:", error);
      toast.error("تعذر حفظ الفعالية الحالية");
    } finally {
      setSaving(false);
    }
  };

  return (
    <Card className="p-4 border-primary/30 bg-primary/5" dir="rtl">
      <div className="flex flex-col md:flex-row md:items-center gap-3 md:gap-6">
        <div className="flex items-start gap-2 md:min-w-[260px]">
          <Star className="w-5 h-5 text-primary mt-0.5 shrink-0" />
          <div>
            <Label className="font-lusail text-base font-bold">الفعالية الحالية</Label>
            <p className="text-xs text-muted-foreground font-lusail mt-1">
              الفعالية التي يراها العملاء ويمكنهم الحجز فيها. الفعاليات المؤرشفة مخفية دائماً.
            </p>
          </div>
        </div>

        <div className="flex-1 flex items-center gap-2">
          <Select value={currentEventId} onValueChange={save} disabled={loading || saving}>
            <SelectTrigger className="font-lusail">
              <SelectValue placeholder="اختر الفعالية" />
            </SelectTrigger>
            <SelectContent className="bg-popover z-50">
              <SelectItem value={NONE} className="font-lusail">
                كل الفعاليات النشطة
              </SelectItem>
              {events.map((event) => (
                <SelectItem key={event.id} value={event.id} className="font-lusail">
                  {event.title} — {new Date(event.event_date).toLocaleDateString("en-US")}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          {saving && <Loader2 className="w-4 h-4 animate-spin text-muted-foreground" />}
          {currentEventId !== NONE && !saving && (
            <Button variant="ghost" size="sm" className="font-lusail" onClick={() => save(NONE)}>
              إلغاء التحديد
            </Button>
          )}
        </div>
      </div>
    </Card>
  );
};
