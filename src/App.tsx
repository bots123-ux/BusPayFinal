import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Route, Routes } from "react-router-dom";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { I18nProvider } from "@/lib/i18n";
import { AuthProvider } from "@/lib/auth";
import { AppShell } from "@/components/AppShell";
import Welcome from "./pages/Welcome";
import Language from "./pages/Language";
import Auth from "./pages/Auth";
import Home from "./pages/Home";
import Booking from "./pages/Booking";
import Tickets from "./pages/Tickets";
import TicketDetail from "./pages/TicketDetail";
import Wallet from "./pages/Wallet";
import Notifications from "./pages/Notifications";
import Profile from "./pages/Profile";
import Policy from "./pages/Policy";
import FAQ from "./pages/FAQ";
import PaymentMethods from "./pages/PaymentMethods";
import RouteMap from "./pages/RouteMap";
import NotFound from "./pages/NotFound.tsx";
import AdminLayout from "./pages/admin/AdminLayout";
import AdminOverview from "./pages/admin/AdminOverview";
import AdminUsers from "./pages/admin/AdminUsers";
import AdminTrips from "./pages/admin/AdminTrips";
import AdminTickets from "./pages/admin/AdminTickets";
import AdminPayments from "./pages/admin/AdminPayments";
import AdminFleet from "./pages/admin/AdminFleet";
import AdminRoutes from "./pages/admin/AdminRoutes";
import { AdminGuard } from "./components/admin/AdminGuard";



const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 1000 * 30, // 30s
      gcTime: 1000 * 60 * 5, // 5 min
      retry: 1,
      refetchOnWindowFocus: false,
    },
  },
});

const App = () => (
  <QueryClientProvider client={queryClient}>
    <TooltipProvider>
      <I18nProvider>
        <AuthProvider>
          <Toaster />
          <Sonner position="top-center" />
          <BrowserRouter>
            <Routes>
              <Route path="/" element={<Welcome />} />
              <Route path="/language" element={<Language />} />
              <Route path="/auth" element={<Auth />} />
              <Route path="/app" element={<AppShell />}>
                <Route index element={<Home />} />
                <Route path="book/:tripId" element={<Booking />} />
                <Route path="tickets" element={<Tickets />} />
                <Route path="tickets/:id" element={<TicketDetail />} />
                <Route path="wallet" element={<Wallet />} />
                <Route path="notifications" element={<Notifications />} />
                <Route path="profile" element={<Profile />} />
                <Route path="policy" element={<Policy />} />
                <Route path="faq" element={<FAQ />} />
                <Route path="payment-methods" element={<PaymentMethods />} />
                <Route path="route-map" element={<RouteMap />} />
              </Route>
              <Route path="*" element={<NotFound />} />
              <Route path="/admin" element={<AdminGuard><AdminLayout /></AdminGuard>}>
                <Route index element={<AdminOverview />} />
                <Route path="users" element={<AdminUsers />} />
                <Route path="trips" element={<AdminTrips />} />
                <Route path="tickets" element={<AdminTickets />} />
                <Route path="payments" element={<AdminPayments />} />
                <Route path="fleet" element={<AdminFleet />} />
                <Route path="routes" element={<AdminRoutes />} />
              </Route>
            </Routes>
          </BrowserRouter>
        </AuthProvider>
      </I18nProvider>
    </TooltipProvider>
  </QueryClientProvider>
);

export default App;
