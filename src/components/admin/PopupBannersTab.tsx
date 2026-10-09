import { useState, useEffect } from "react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { useTranslation } from "react-i18next";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { Plus, Edit, Trash2 } from "lucide-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";

interface PopupBanner {
  id: string;
  title: string;
  message: string;
  image_url: string | null;
  is_active: boolean | null;
}

export const PopupBannersTab = () => {
  const { t } = useTranslation();
  const [banners, setBanners] = useState<PopupBanner[]>([]);
  const [loading, setLoading] = useState(true);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingBanner, setEditingBanner] = useState<PopupBanner | null>(null);
  const [formData, setFormData] = useState({
    title: "",
    message: "",
    image_url: "",
  });

  useEffect(() => {
    fetchBanners();
  }, []);

  const fetchBanners = async () => {
    try {
      const { data, error } = await supabase
        .from("popup_banners")
        .select("*")
        .order("created_at", { ascending: false });

      if (error) throw error;
      setBanners(data || []);
    } catch (error) {
      console.error("Error fetching banners:", error);
      toast.error(t("failedToLoad"));
    } finally {
      setLoading(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);

    try {
      if (editingBanner) {
        const { error } = await supabase
          .from("popup_banners")
          .update(formData)
          .eq("id", editingBanner.id);

        if (error) throw error;
        toast.success(t("savedSuccessfully"));
      } else {
        const { error} = await supabase
          .from("popup_banners")
          .insert({ ...formData, is_active: false });

        if (error) throw error;
        toast.success(t("bannerCreated"));
      }

      setDialogOpen(false);
      setFormData({ title: "", message: "", image_url: "" });
      setEditingBanner(null);
      fetchBanners();
    } catch (error) {
      console.error("Error saving banner:", error);
      toast.error(t("failedToLoad"));
    } finally {
      setLoading(false);
    }
  };

  const toggleBannerStatus = async (bannerId: string, currentStatus: boolean) => {
    try {
      // If activating this banner, deactivate all others
      if (!currentStatus) {
        await supabase
          .from("popup_banners")
          .update({ is_active: false })
          .neq("id", bannerId);
      }

      const { error } = await supabase
        .from("popup_banners")
        .update({ is_active: !currentStatus })
        .eq("id", bannerId);

      if (error) throw error;
      toast.success(t("savedSuccessfully"));
      fetchBanners();
    } catch (error) {
      console.error("Error toggling banner:", error);
      toast.error(t("failedToLoad"));
    }
  };

  const deleteBanner = async (bannerId: string) => {
    if (!confirm(t("confirmDelete"))) return;

    try {
      const { error } = await supabase
        .from("popup_banners")
        .delete()
        .eq("id", bannerId);

      if (error) throw error;
      toast.success(t("deletedSuccessfully"));
      fetchBanners();
    } catch (error) {
      console.error("Error deleting banner:", error);
      toast.error(t("failedToLoad"));
    }
  };

  const openEditDialog = (banner: PopupBanner) => {
    setEditingBanner(banner);
    setFormData({
      title: banner.title,
      message: banner.message,
      image_url: banner.image_url || "",
    });
    setDialogOpen(true);
  };

  const openCreateDialog = () => {
    setEditingBanner(null);
    setFormData({ title: "", message: "", image_url: "" });
    setDialogOpen(true);
  };

  if (loading) {
    return <div className="text-center py-12 font-lusail">{t("loading")}</div>;
  }

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <h2 className="text-2xl font-bold font-lusail">{t("popupBanners")}</h2>
        <Button onClick={openCreateDialog} className="font-lusail">
          <Plus className="w-4 h-4 ml-2" />
          {t("createBanner")}
        </Button>
      </div>

      <div className="grid grid-cols-1 gap-4">
        {banners.map((banner) => (
          <Card key={banner.id} className="p-6">
            <div className="flex items-start justify-between gap-4">
              <div className="flex-1">
                <h3 className="text-xl font-bold mb-2">{banner.title}</h3>
                <p className="text-muted-foreground mb-4">{banner.message}</p>
                {banner.image_url && (
                  <img
                    src={banner.image_url}
                    alt={banner.title}
                    className="w-full max-w-md h-48 object-cover rounded-lg mb-4"
                  />
                )}
              </div>

              <div className="flex flex-col gap-2 items-end">
                <div className="flex items-center gap-2 p-2 border rounded-lg">
                  <Label htmlFor={`active-${banner.id}`} className="font-lusail text-sm cursor-pointer">
                    {banner.is_active ? t("active") : t("inactive")}
                  </Label>
                  <Switch
                    id={`active-${banner.id}`}
                    checked={Boolean(banner.is_active)}
                    onCheckedChange={() => toggleBannerStatus(banner.id, Boolean(banner.is_active))}
                  />
                </div>

                <div className="flex gap-2">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => openEditDialog(banner)}
                    className="font-lusail"
                  >
                    <Edit className="w-4 h-4" />
                  </Button>
                  <Button
                    variant="destructive"
                    size="sm"
                    onClick={() => deleteBanner(banner.id)}
                    className="font-lusail"
                  >
                    <Trash2 className="w-4 h-4" />
                  </Button>
                </div>
              </div>
            </div>
          </Card>
        ))}

        {banners.length === 0 && (
          <Card className="p-12 text-center">
            <p className="text-muted-foreground font-lusail">{t("noBanners")}</p>
          </Card>
        )}
      </div>

      {/* Create/Edit Dialog */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle className="font-lusail text-2xl">
              {editingBanner ? t("editBanner") : t("createBanner")}
            </DialogTitle>
          </DialogHeader>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <Label htmlFor="title" className="font-lusail">{t("bannerTitle")}</Label>
              <Input
                id="title"
                value={formData.title}
                onChange={(e) => setFormData({ ...formData, title: e.target.value })}
                required
                className="font-lusail"
              />
            </div>

            <div>
              <Label htmlFor="message" className="font-lusail">{t("bannerMessage")}</Label>
              <Textarea
                id="message"
                value={formData.message}
                onChange={(e) => setFormData({ ...formData, message: e.target.value })}
                required
                className="font-lusail"
                rows={4}
              />
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

            <div className="flex justify-end gap-2">
              <Button type="button" variant="outline" onClick={() => setDialogOpen(false)} className="font-lusail">
                {t("cancel")}
              </Button>
              <Button type="submit" disabled={loading} className="font-lusail">
                {loading ? t("loading") : t("save")}
              </Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
};