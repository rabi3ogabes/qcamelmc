import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Upload, Image as ImageIcon } from "lucide-react";
import { useTranslation } from "react-i18next";

export const SettingsTab = () => {
  const { t } = useTranslation();

  return (
    <div className="space-y-6 max-w-4xl">
      <h2 className="text-2xl font-bold font-lusail">{t("settings")}</h2>

      {/* Logo Upload */}
      <Card className="p-6">
        <h3 className="text-lg font-semibold mb-4 font-lusail">{t("logoUpload")}</h3>
        <div className="space-y-4">
          <div>
            <Label className="font-lusail">{t("currentLogo")}</Label>
            <div className="mt-2 p-8 border-2 border-dashed rounded-lg flex items-center justify-center bg-muted/50">
              <ImageIcon className="w-16 h-16 text-muted-foreground" />
            </div>
          </div>
          
          <div>
            <Label htmlFor="logo-upload" className="font-lusail">{t("uploadNewLogo")}</Label>
            <div className="mt-2">
              <Input id="logo-upload" type="file" accept="image/*" className="font-lusail" />
            </div>
          </div>
          
          <Button className="font-lusail">
            <Upload className="w-4 h-4 ml-2" />
            {t("uploadNewLogo")}
          </Button>
        </div>
      </Card>

      {/* Sadad Payment Settings */}
      <Card className="p-6">
        <h3 className="text-lg font-semibold mb-4 font-lusail">{t("sadadPayment")}</h3>
        <div className="space-y-4">
          <div>
            <Label htmlFor="sadad-merchant-id" className="font-lusail">معرف التاجر (Merchant ID)</Label>
            <Input id="sadad-merchant-id" placeholder="أدخل معرف التاجر" className="mt-2 font-lusail" />
          </div>
          
          <div>
            <Label htmlFor="sadad-api-key" className="font-lusail">مفتاح API</Label>
            <Input id="sadad-api-key" type="password" placeholder="أدخل مفتاح API" className="mt-2 font-lusail" />
          </div>
          
          <div>
            <Label htmlFor="sadad-secret" className="font-lusail">المفتاح السري</Label>
            <Input id="sadad-secret" type="password" placeholder="أدخل المفتاح السري" className="mt-2 font-lusail" />
          </div>
          
          <div className="flex gap-2 pt-4">
            <Button className="font-lusail">{t("save")}</Button>
            <Button variant="outline" className="font-lusail">{t("cancel")}</Button>
          </div>
        </div>
      </Card>

      {/* General Settings */}
      <Card className="p-6">
        <h3 className="text-lg font-semibold mb-4 font-lusail">الإعدادات العامة</h3>
        <div className="space-y-4">
          <div>
            <Label htmlFor="support-email" className="font-lusail">البريد الإلكتروني للدعم</Label>
            <Input id="support-email" type="email" placeholder="support@example.com" className="mt-2 font-lusail" />
          </div>
          
          <div>
            <Label htmlFor="support-phone" className="font-lusail">هاتف الدعم</Label>
            <Input id="support-phone" type="tel" placeholder="+974 XXXX XXXX" className="mt-2 font-lusail" />
          </div>
          
          <Button className="font-lusail">{t("save")}</Button>
        </div>
      </Card>
    </div>
  );
};
