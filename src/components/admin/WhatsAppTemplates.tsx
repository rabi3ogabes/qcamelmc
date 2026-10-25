import { useEffect, useState } from "react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { Plus, Save, Trash2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

interface Template { id: string; name: string; body: string; enabled: boolean; }
export function WhatsAppTemplates() {
  const [templates, setTemplates] = useState<Template[]>([]);
  const [settingsId, setSettingsId] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  useEffect(() => {
    supabase.from("settings").select("id, whatsapp_templates").maybeSingle().then(({ data, error }) => {
      if (error) { toast.error("تعذّر تحميل قوالب واتساب"); return; }
      if (data) { setSettingsId(data.id); setTemplates((data.whatsapp_templates as unknown as Template[]) ?? []); }
    });
  }, []);
  const update = (id: string, patch: Partial<Template>) => setTemplates(current => current.map(t => t.id === id ? { ...t, ...patch } : t));
  const save = async () => {
    if (!settingsId || templates.some(t => !t.name.trim() || !t.body.trim())) { toast.error("أدخل اسم الرسالة ونصها"); return; }
    setSaving(true);
    const { error } = await supabase.from("settings").update({ whatsapp_templates: templates.map(t => ({ ...t })) }).eq("id", settingsId);
    setSaving(false);
    if (error) toast.error("تعذّر حفظ الرسائل"); else toast.success("تم حفظ رسائل واتساب");
  };
  return <Card className="p-6 space-y-4" dir="rtl">
    <div className="flex flex-wrap items-center justify-between gap-3">
      <h3 className="text-lg font-semibold">رسائل فواتير واتساب — اختيار عشوائي</h3>
      <Button variant="outline" disabled={templates.length >= 50} onClick={() => setTemplates(t => [...t, { id: crypto.randomUUID(), name: "", body: "", enabled: true }])}><Plus className="h-4 w-4 ml-2" />إضافة رسالة</Button>
    </div>
    {templates.map((t, i) => <div key={t.id} className="border-b border-border pb-4 space-y-3">
      <div className="flex items-center gap-3">
        <Input aria-label={`اسم الرسالة ${i + 1}`} placeholder="اسم الرسالة" value={t.name} maxLength={100} onChange={e => update(t.id, { name: e.target.value })} />
        <Label className="flex items-center gap-2 whitespace-nowrap"><Switch aria-label={`تفعيل الرسالة ${i + 1}`} checked={t.enabled} onCheckedChange={enabled => update(t.id, { enabled })} />مفعّلة</Label>
        <Button variant="ghost" size="icon" title="حذف الرسالة" onClick={() => setTemplates(all => all.filter(item => item.id !== t.id))}><Trash2 className="h-4 w-4" /></Button>
      </div>
      <Textarea aria-label={`نص الرسالة ${i + 1}`} value={t.body} maxLength={4000} rows={5} placeholder="نص الرسالة" onChange={e => update(t.id, { body: e.target.value })} />
    </div>)}
    <div className="text-xs text-muted-foreground break-words" dir="ltr">{'{{customer_name}} · {{booking_reference}} · {{event_title}} · {{event_date}} · {{event_location}} · {{quantity}} · {{total_amount}} · {{invoice_url}}'}</div>
    <Button onClick={save} disabled={saving || !settingsId}><Save className="h-4 w-4 ml-2" />{saving ? "جارٍ الحفظ…" : "حفظ الرسائل"}</Button>
  </Card>;
}