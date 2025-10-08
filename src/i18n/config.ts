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
      "description": "الوصف",
      "imageUrl": "رابط الصورة",
      "ticketConfiguration": "إعدادات التذاكر",
      "vipQuantity": "كمية VIP",
      "vipPrice": "سعر VIP",
      "regularQuantity": "كمية التذاكر العادية",
      "regularPrice": "سعر التذاكر العادية",
      "studentQuantity": "كمية تذاكر الطلاب",
      "studentPrice": "سعر تذاكر الطلاب",
      
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
      
      // Event Home Page
      "adminLoginBtn": "تسجيل دخول المسؤول",
      "loadingEvents": "جاري التحميل...",
      "noActiveEvents": "لا توجد فعاليات نشطة",
      "bookTicketsNow": "احجز التذاكر الآن",
      "eventDateTime": "تاريخ ووقت الفعالية",
      "readyToJoin": "جاهز للانضمام إلينا؟",
      "secureYourSpot": "احجز مكانك في هذا الاحتفال الذي لا يُنسى. اختر من بين تذاكر VIP أو العادية أو مواقف السيارات.",
      "selectYourTickets": "اختر تذاكرك",
      
      // Ticket Selection Page
      "selectTicketsTitle": "اختر تذاكرك",
      "chooseQuantity": "اختر الكمية لكل نوع تذكرة",
      "vipAccessTitle": "دخول VIP",
      "vipAccessDesc": "مقاعد مميزة، وصول حصري، مشروبات مجانية",
      "generalAdmissionTitle": "دخول عام",
      "generalAdmissionDesc": "دخول عام لجميع مناطق وأنشطة الفعالية",
      "parkingPassTitle": "بطاقة موقف السيارات",
      "parkingPassDesc": "موقف سيارات محجوز بالقرب من مدخل المكان",
      "availableTickets": "متاح",
      "totalAmount": "المبلغ الإجمالي",
      "continueToCheckout": "المتابعة إلى الدفع",
      "backToEvent": "← العودة لتفاصيل الفعالية",
      "loadingTickets": "جاري تحميل التذاكر...",
      "selectAtLeastOne": "الرجاء اختيار تذكرة واحدة على الأقل",
      "maxTicketsError": "الحد الأقصى 5 تذاكر مسموح لـ VIP والدخول العام معاً",
      "maxParkingLabel": "الحد الأقصى: 5",
      "maxAdmissionLabel": "الحد الأقصى: 5 إجمالي لـ VIP + العام",
      
      // Checkout Page
      "checkoutTitle": "إتمام الحجز",
      "fillTicketHolderInfo": "يرجى ملء معلومات حاملي التذاكر",
      "customerInfo": "معلومات العميل",
      "fullName": "الاسم الكامل",
      "phoneNumber": "رقم الهاتف",
      "nationality": "الجنسية",
      "ticketHolderInfo": "معلومات حامل التذكرة",
      "selectPaymentMethod": "اختر طريقة الدفع",
      "sadadOnline": "سداد (دفع إلكتروني)",
      "cashAtVenue": "نقداً/بطاقة في المكان",
      "orderSummary": "ملخص الطلب",
      "completeBooking": "إتمام الحجز",
      "backToTickets": "← العودة لاختيار التذاكر",
      "bookingCreated": "تم إنشاء الحجز بنجاح!",
      "fillAllFields": "يرجى ملء جميع الحقول المطلوبة",
      
      // Confirmation Page
      "bookingReceived": "تم استلام الحجز!",
      "bookingPending": "حجزك قيد انتظار تأكيد الدفع",
      "paymentPendingTitle": "الدفع قيد الانتظار",
      "paymentPendingDesc": "تم إنشاء حجزك بنجاح. سيقوم فريق الإدارة لدينا بتأكيد دفعتك قريباً. بمجرد التأكيد، ستتلقى تذاكرك مع رموز QR عبر البريد الإلكتروني.",
      "bookingDetails": "تفاصيل الحجز",
      "bookingReference": "الرقم المرجعي للحجز",
      "nextSteps": "الخطوات التالية:",
      "saveReference": "احفظ الرقم المرجعي للحجز للرجوع إليه مستقبلاً",
      "adminReview": "سيقوم فريق الإدارة لدينا بمراجعة وتأكيد دفعتك",
      "receiveEmail": "ستتلقى بريداً إلكترونياً يحتوي على تذاكرك ورموز QR بمجرد التأكيد",
      "presentQR": "قدّم رمز QR الخاص بك عند مدخل المكان في يوم الفعالية",
      "returnToHome": "العودة للرئيسية",
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
