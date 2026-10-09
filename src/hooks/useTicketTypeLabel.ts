import { useTranslation } from "react-i18next";

const TYPE_KEYS: Record<string, string> = {
  vip: "vipAccessTitle",
  normal: "generalAdmissionTitle",
  parking: "parkingPassTitle",
};

/** A function that turns a ticket type (vip / normal / parking) into its Arabic label. */
export function useTicketTypeLabel() {
  const { t } = useTranslation();
  return (type: string) => (TYPE_KEYS[type] ? t(TYPE_KEYS[type]) : type);
}
