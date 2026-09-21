import StaffRolesCard from "@/components/admin/StaffRolesCard";

const StaffAccountsPage = () => (
  <div className="space-y-6" dir="rtl">
    <div className="rounded-2xl border bg-gradient-to-l from-primary/10 via-card to-card p-5 shadow-[var(--shadow-card)]">
      <p className="text-[11px] font-semibold uppercase tracking-[0.25em] text-muted-foreground">
        حسابات الفريق
      </p>
      <h2 className="mt-1 text-2xl font-bold">إدارة الدخول والصلاحيات</h2>
      <p className="mt-1 text-sm text-muted-foreground">
        أنشئ حسابات للموظفين وحدّد من يملك صلاحية لوحة التحكم الكاملة.
      </p>
    </div>
    <StaffRolesCard />
  </div>
);

export default StaffAccountsPage;
