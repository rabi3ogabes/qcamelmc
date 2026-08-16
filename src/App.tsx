import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { I18nextProvider } from "react-i18next";
import { lazy, Suspense } from "react";
import i18n from "./i18n/config";
import { SettingsProvider } from "./contexts/SettingsContext";
import ChunkLoadErrorBoundary from "@/components/ChunkLoadErrorBoundary";
import RequireAdmin from "@/components/RequireAdmin";

import EventHome from "./pages/EventHome";
import { useVisitorTracking } from "./hooks/useVisitorTracking";

// Visitor tracking wrapper
const VisitorTracker = ({ children }: { children: React.ReactNode }) => {
  useVisitorTracking();
  return <>{children}</>;
};

// Lazy load route components (keep the homepage in the main bundle for reliability)
const TicketSelection = lazy(() => import("./pages/TicketSelection"));
const Checkout = lazy(() => import("./pages/Checkout"));
const Confirmation = lazy(() => import("./pages/Confirmation"));
const InvoicePage = lazy(() => import("./pages/InvoicePage"));
const SadadCallback = lazy(() => import("./pages/SadadCallback"));
const SadadRedirect = lazy(() => import("./pages/SadadRedirect"));
const AdminLogin = lazy(() => import("./pages/AdminLogin"));
const AdminDashboard = lazy(() => import("./pages/AdminDashboard"));
const LiveBookings = lazy(() => import("./pages/LiveBookings"));
const LiveVisitors = lazy(() => import("./pages/LiveVisitors"));
const QRScanner = lazy(() => import("./pages/QRScanner"));
const AdminPOS = lazy(() => import("./pages/AdminPOS"));
const POSReceiptPage = lazy(() => import("./pages/POSReceiptPage"));
const TicketViewer = lazy(() => import("./pages/TicketViewer"));
const NotFound = lazy(() => import("./pages/NotFound"));

// Admin dashboard sub-pages
const OrdersPage = lazy(() => import("./pages/admin/OrdersPage"));
const CustomersPage = lazy(() => import("./pages/admin/CustomersPage"));
const EventsPage = lazy(() => import("./pages/admin/EventsPage"));
const TicketsPage = lazy(() => import("./pages/admin/TicketsPage"));
const InvoicesPage = lazy(() => import("./pages/admin/InvoicesPage"));
const SettingsPage = lazy(() => import("./pages/admin/SettingsPage"));
const POSUsersPage = lazy(() => import("./pages/admin/POSUsersPage"));
const VisitorsPage = lazy(() => import("./pages/admin/VisitorsPage"));
const ReportsPage = lazy(() => import("./pages/admin/ReportsPage"));
const ActivityLogsPage = lazy(() => import("./pages/admin/ActivityLogsPage"));

const queryClient = new QueryClient();

const App = () => (
  <I18nextProvider i18n={i18n}>
    <QueryClientProvider client={queryClient}>
      <SettingsProvider>
        <TooltipProvider>
          <Toaster />
            <Sonner 
              position="top-right"
              expand={true}
              visibleToasts={6}
              gap={12}
            />
          <BrowserRouter>
            <VisitorTracker>
              <ChunkLoadErrorBoundary>
                <Suspense
                  fallback={
                    <div className="flex items-center justify-center min-h-screen">
                      <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary"></div>
                    </div>
                  }
                >
                  <Routes>
                    <Route path="/" element={<EventHome />} />
                    <Route path="/tickets/:eventId" element={<TicketSelection />} />
                    <Route path="/checkout" element={<Checkout />} />
                    <Route path="/confirmation" element={<Confirmation />} />
                    <Route path="/invoice/:bookingReference" element={<InvoicePage />} />
                    <Route path="/sadad-callback" element={<SadadCallback />} />
                    <Route path="/sadad-redirect" element={<SadadRedirect />} />
                    <Route path="/live-bookings" element={<RequireAdmin><LiveBookings /></RequireAdmin>} />
                    <Route path="/live-visitors" element={<RequireAdmin><LiveVisitors /></RequireAdmin>} />
                    <Route path="/admin/login" element={<AdminLogin />} />
                    <Route path="/admin/dashboard" element={<RequireAdmin><AdminDashboard /></RequireAdmin>}>
                      <Route index element={<Navigate to="orders" replace />} />
                      <Route path="orders" element={<OrdersPage />} />
                      <Route path="customers" element={<CustomersPage />} />
                      <Route path="events" element={<EventsPage />} />
                      <Route path="tickets" element={<TicketsPage />} />
                      <Route path="invoices" element={<InvoicesPage />} />
                      <Route path="settings" element={<SettingsPage />} />
                      <Route path="pos-users" element={<POSUsersPage />} />
                      <Route path="visitors" element={<VisitorsPage />} />
                      <Route path="reports" element={<ReportsPage />} />
                      <Route path="activity-logs" element={<ActivityLogsPage />} />
                    </Route>
                    <Route path="/admin/qr-scanner" element={<RequireAdmin><QRScanner /></RequireAdmin>} />
                    <Route path="/admin/pos" element={<RequireAdmin><AdminPOS /></RequireAdmin>} />
                    <Route path="/admin/pos-receipts" element={<RequireAdmin><POSReceiptPage /></RequireAdmin>} />
                    <Route path="/admin/tickets" element={<TicketViewer />} />

                    <Route path="*" element={<NotFound />} />
                  </Routes>
                </Suspense>
              </ChunkLoadErrorBoundary>
            </VisitorTracker>
          </BrowserRouter>
        </TooltipProvider>
      </SettingsProvider>
    </QueryClientProvider>
  </I18nextProvider>
);

export default App;
