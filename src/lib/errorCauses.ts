// Classifies any recorded failure into one human cause, so the error log can group by cause.
export type ErrorCause =
  | "payment"
  | "email"
  | "network"
  | "page_load"
  | "permission"
  | "data"
  | "code"
  | "other";

export const CAUSE_LABELS: Record<ErrorCause, { title: string; hint: string }> = {
  payment: { title: "الدفع", hint: "رفض أو فشل في عملية الدفع عبر سداد أو البنك" },
  email: { title: "البريد والإشعارات", hint: "رسائل لم تصل إلى العميل أو الإدارة" },
  network: { title: "الاتصال بالشبكة", hint: "انقطاع أو بطء في اتصال الزائر أو الخادم" },
  page_load: { title: "تحميل الصفحات", hint: "غالباً بعد تحديث الموقع وتحميل نسخة قديمة" },
  permission: { title: "الصلاحيات والدخول", hint: "محاولة الوصول لبيانات بدون صلاحية أو جلسة منتهية" },
  data: { title: "البيانات والتحقق", hint: "بيانات مرفوضة بسبب قواعد النظام" },
  code: { title: "خلل برمجي", hint: "خطأ داخل الموقع يحتاج مراجعة" },
  other: { title: "أخرى", hint: "أخطاء غير مصنّفة" },
};

export const CAUSE_ORDER: ErrorCause[] = ["payment", "email", "code", "page_load", "permission", "data", "network", "other"];

export function classifyError(input: { source?: string | null; kind?: string | null; message?: string | null }): ErrorCause {
  const source = (input.source ?? "").toLowerCase();
  if (source === "payment") return "payment";
  if (source === "email") return "email";
  const m = `${input.kind ?? ""} ${input.message ?? ""}`.toLowerCase();
  if (/loading chunk|dynamically imported module|importing a module script|failed to fetch dynamically/.test(m)) return "page_load";
  if (/failed to fetch|networkerror|network request failed|load failed|timeout|timed out|aborterror|err_network|offline/.test(m)) return "network";
  if (/permission denied|42501|row-level security|jwt|unauthorized|forbidden|\b401\b|\b403\b|not allowed/.test(m)) return "permission";
  if (/23505|23514|23503|violates|duplicate key|invalid input|check constraint|ticket_limit|sold out/.test(m)) return "data";
  if (/typeerror|referenceerror|syntaxerror|rangeerror|undefined|null|is not a function|cannot read/.test(m)) return "code";
  return "other";
}

// Errors the browser raises that are not real problems with the site.
export function isNoiseError(message: string | null | undefined): boolean {
  const m = (message ?? "").toLowerCase();
  if (!m || m === "script error." || m === "script error") return true;
  return /resizeobserver loop|chrome-extension:|moz-extension:|safari-extension:|function components cannot be given refs|non-error promise rejection captured/.test(m);
}
