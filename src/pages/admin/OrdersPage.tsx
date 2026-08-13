import { useOutletContext } from "react-router-dom";
import { OrdersTab } from "@/components/admin/OrdersTab";
import type { AdminOutletContext } from "@/pages/AdminDashboard";

const OrdersPage = () => {
  const { orders, isFullyLoaded, showUpcomingOnly, setShowUpcomingOnly, refreshOrders } =
    useOutletContext<AdminOutletContext>();

  return (
    <OrdersTab
      orders={orders}
      onRefresh={refreshOrders}
      isFullyLoaded={isFullyLoaded}
      showUpcomingOnly={showUpcomingOnly}
      onUpcomingOnlyChange={setShowUpcomingOnly}
    />
  );
};

export default OrdersPage;
