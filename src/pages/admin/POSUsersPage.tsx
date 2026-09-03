import { POSUsersTab } from "@/components/admin/POSUsersTab";
import StaffRolesCard from "@/components/admin/StaffRolesCard";

const POSUsersPage = () => (
  <div className="space-y-6">
    <StaffRolesCard />
    <POSUsersTab />
  </div>
);

export default POSUsersPage;
