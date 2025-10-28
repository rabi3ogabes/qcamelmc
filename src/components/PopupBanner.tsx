import { useState, useEffect } from "react";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { X } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useTranslation } from "react-i18next";

interface Banner {
  id: string;
  title: string;
  message: string;
  image_url: string | null;
}

export const PopupBanner = () => {
  const { t } = useTranslation();
  const [banner, setBanner] = useState<Banner | null>(null);
  const [open, setOpen] = useState(false);
  const [canClose, setCanClose] = useState(false);

  useEffect(() => {
    fetchActiveBanner();
  }, []);

  useEffect(() => {
    if (open) {
      // Enable close button after 3 seconds
      const timer = setTimeout(() => {
        setCanClose(true);
      }, 3000);

      return () => clearTimeout(timer);
    }
  }, [open]);

  const fetchActiveBanner = async () => {
    try {
      const { data, error } = await supabase
        .from("popup_banners")
        .select("*")
        .eq("is_active", true)
        .maybeSingle();

      if (error) throw error;
      
      if (data) {
        // Check if user has already seen this banner in current session
        const seenBanners = JSON.parse(sessionStorage.getItem("seenBanners") || "[]");
        if (!seenBanners.includes(data.id)) {
          setBanner(data);
          setOpen(true);
        }
      }
    } catch (error) {
      console.error("Error fetching banner:", error);
    }
  };

  const handleClose = () => {
    if (!canClose) return;
    
    setOpen(false);
    
    // Mark banner as seen for this session
    if (banner) {
      const seenBanners = JSON.parse(sessionStorage.getItem("seenBanners") || "[]");
      seenBanners.push(banner.id);
      sessionStorage.setItem("seenBanners", JSON.stringify(seenBanners));
    }
  };

  if (!banner) return null;

  return (
    <Dialog open={open} onOpenChange={(newOpen) => canClose && setOpen(newOpen)}>
      <DialogContent className="max-w-2xl p-0 overflow-hidden font-lusail">
        {/* Close Button */}
        {canClose && (
          <Button
            variant="ghost"
            size="icon"
            className="absolute top-2 right-2 z-10"
            onClick={handleClose}
          >
            <X className="w-4 h-4" />
          </Button>
        )}

        {/* Banner Content */}
        <div className="relative">
          {banner.image_url && (
            <div className="relative h-64 md:h-96 overflow-hidden">
              <img
                src={banner.image_url}
                alt={banner.title}
                className="w-full h-full object-cover"
                loading="lazy"
              />
              <div className="absolute inset-0 bg-gradient-to-t from-black/60 to-transparent" />
            </div>
          )}

          <div className={`${banner.image_url ? 'absolute bottom-0 left-0 right-0 p-8 text-white' : 'p-8'}`}>
            <h2 className="text-3xl md:text-4xl font-bold mb-4">{banner.title}</h2>
            <p className="text-lg md:text-xl whitespace-pre-wrap">{banner.message}</p>
          </div>

          {!canClose && (
            <div className="p-4 bg-muted/50 text-center">
              <p className="text-sm text-muted-foreground">
                {t("closeAfter3Seconds")}
              </p>
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
};