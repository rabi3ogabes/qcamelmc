import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { I18nextProvider } from "react-i18next";
import { lazy, Suspense } from "react";
import i18n from "./i18n/config";
import { SettingsProvider } from "./contexts/SettingsContext";
import { RequireAdmin } from "./components/RequireAdmin";

// Lazy load route components
const EventHome = lazy(() => import("./pages/EventHome"));
const TicketSelection = lazy(() => import("./pages/TicketSelection"));
const Checkout = lazy(() => import("./pages/Checkout"));
const Confirmation = lazy(() => import("./pages/Confirmation"));
const PaymentResult = lazy(() => import("./pages/PaymentResult"));
const AdminLogin = lazy(() => import("./pages/AdminLogin"));
const AdminDashboard = lazy(() => import("./pages/AdminDashboard"));
const LiveBookings = lazy(() => import("./pages/LiveBookings"));
const QRScanner = lazy(() => import("./pages/QRScanner"));
const AdminPOS = lazy(() => import("./pages/AdminPOS"));
const TicketViewer = lazy(() => import("./pages/TicketViewer"));
const NotFound = lazy(() => import("./pages/NotFound"));

const queryClient = new QueryClient();

const App = () => (
  <I18nextProvider i18n={i18n}>
    <QueryClientProvider client={queryClient}>
      <SettingsProvider>
        <TooltipProvider>
          <Toaster />
          <Sonner />
          <BrowserRouter>
            <Suspense fallback={<div className="flex items-center justify-center min-h-screen"><div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary"></div></div>}>
              <Routes>
                {/* Public */}
                <Route path="/" element={<EventHome />} />
                <Route path="/tickets" element={<Navigate to="/" replace />} />
                <Route path="/tickets/:eventId" element={<TicketSelection />} />
                <Route path="/checkout" element={<Checkout />} />
                <Route path="/confirmation" element={<Confirmation />} />
                <Route path="/payment/result" element={<PaymentResult />} />
                {/* Old return address from Sadad: same page, same behaviour */}
                <Route path="/sadad-callback" element={<PaymentResult />} />
                <Route path="/sadad-redirect" element={<Navigate to="/checkout" replace />} />

                {/* Administrators only (also enforced by row-level security) */}
                <Route path="/admin/login" element={<AdminLogin />} />
                <Route path="/admin/dashboard" element={<RequireAdmin><AdminDashboard /></RequireAdmin>} />
                <Route path="/admin/qr-scanner" element={<RequireAdmin><QRScanner /></RequireAdmin>} />
                <Route path="/admin/pos" element={<RequireAdmin><AdminPOS /></RequireAdmin>} />
                <Route path="/admin/tickets" element={<RequireAdmin><TicketViewer /></RequireAdmin>} />
                <Route path="/live-bookings" element={<RequireAdmin><LiveBookings /></RequireAdmin>} />
                <Route path="*" element={<NotFound />} />
              </Routes>
            </Suspense>
          </BrowserRouter>
        </TooltipProvider>
      </SettingsProvider>
    </QueryClientProvider>
  </I18nextProvider>
);

export default App;
