import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';

const resources = {
  ar: {
    translation: {
      // Navigation & Auth
      "logout": "تسجيل الخروج",
      "login": "تسجيل الدخول",
      "adminLogin": "تسجيل دخول المسؤول",
      "email": "البريد الإلكتروني",
      "password": "كلمة المرور",
      "backToHome": "العودة للرئيسية",
      
      // Dashboard
      "adminDashboard": "لوحة تحكم المسؤول",
      "orders": "الطلبات",
      "events": "الفعاليات",
      "tickets": "التذاكر",
      "settings": "الإعدادات",
      "statistics": "الإحصائيات",
      
      // Orders
      "allOrders": "جميع الطلبات",
      "successfulPayments": "الدفعات الناجحة",
      "failedPayments": "الدفعات الفاشلة",
      "pendingPayments": "الدفعات المعلقة",
      "reference": "الرقم المرجعي",
      "customer": "العميل",
      "ticket": "التذكرة",
      "amount": "المبلغ",
      "status": "الحالة",
      "paymentMethod": "طريقة الدفع",
      "confirmPayment": "تأكيد الدفع",
      "confirmed": "مؤكد",
      "pending": "قيد الانتظار",
      "failed": "فشل",
      "success": "نجح",
      "location": "الموقع",
      "date": "التاريخ",
      "actions": "الإجراءات",
      "viewDetails": "عرض التفاصيل",
      "ticketHoldersTitle": "معلومات حاملي التذاكر",
      "holderName": "اسم حامل التذكرة",
      "holderPhone": "رقم الهاتف",
      "holderNationality": "الجنسية",
      "ticketType": "نوع التذكرة",
      "noTicketHolders": "لا توجد معلومات حاملي التذاكر",
      
      // Events
      "eventManagement": "إدارة الفعاليات",
      "createEvent": "إنشاء فعالية جديدة",
      "editEvent": "تعديل الفعالية",
      "eventTitle": "عنوان الفعالية",
      "eventDescription": "وصف الفعالية",
      "eventDate": "تاريخ الفعالية",
      "eventLocation": "موقع الفعالية",
      "active": "نشط",
      "inactive": "غير نشط",
      
      // Tickets
      "ticketManagement": "إدارة التذاكر",
      "vipAccess": "دخول VIP",
      "generalAdmission": "دخول عام",
      "parking": "موقف السيارات",
      "price": "السعر",
      "available": "متاح",
      "sold": "مُباع",
      "quantity": "الكمية",
      
      // Settings
      "paymentSettings": "إعدادات الدفع",
      "sadadPayment": "دفع سداد",
      "logoUpload": "رفع الشعار",
      "currentLogo": "الشعار الحالي",
      "uploadNewLogo": "رفع شعار جديد",
      "save": "حفظ",
      "cancel": "إلغاء",
      
      // Stats
      "totalOrders": "إجمالي الطلبات",
      "totalRevenue": "إجمالي الإيرادات",
      "successfulPaymentsCount": "الدفعات الناجحة",
      "pendingPaymentsCount": "الدفعات المعلقة",
      
      // Messages
      "loading": "جاري التحميل...",
      "noOrders": "لا توجد طلبات",
      "noEvents": "لا توجد فعاليات",
      "paymentConfirmed": "تم تأكيد الدفع!",
      "failedToLoad": "فشل التحميل",
      "savedSuccessfully": "تم الحفظ بنجاح",
      
      // Common
      "search": "بحث",
      "filter": "تصفية",
      "export": "تصدير",
      "print": "طباعة",
      "delete": "حذف",
      "edit": "تعديل",
      "view": "عرض",
      "close": "إغلاق",
      "qar": "ريال قطري",
    }
  }
};

i18n
  .use(initReactI18next)
  .init({
    resources,
    lng: 'ar',
    fallbackLng: 'ar',
    interpolation: {
      escapeValue: false
    }
  });

export default i18n;
