import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { BrowserRouter, Navigate, Route, Routes } from "react-router";
import { AuthProvider } from "./auth/AuthProvider";
import { RequireRole } from "./auth/RequireRole";
import { AppBanners } from "./components/AppBanners";
import { FarmerShell, PlainShell } from "./layouts/AppLayouts";
import { LegacyProductRedirect } from "./layouts/LegacyProductRedirect";
import { SiteShell } from "./layouts/SiteShell";
import Account from "./pages/Account";
import { AdminShell } from "./layouts/AdminShell";
import AdminHome from "./pages/admin/AdminHome";
import AdminOrders from "./pages/admin/AdminOrders";
import AdminSettings from "./pages/admin/AdminSettings";
import Dispatch from "./pages/admin/Dispatch";
import Payouts from "./pages/admin/Payouts";
import Applications from "./pages/admin/Applications";
import DeliveryAreas from "./pages/admin/DeliveryAreas";
import { ForgotPasswordPage, LoginPage, RegisterPage, ResetPasswordPage } from "./pages/AuthPages";
import PaymentReturn from "./pages/buyer/PaymentReturn";
import { PrivacyPage, TermsPage } from "./pages/Legal";
import Basket from "./pages/buyer/Basket";
import Orders from "./pages/buyer/Orders";
import ProductDetail from "./pages/buyer/ProductDetail";
import Shop from "./pages/buyer/Shop";
import EditListing from "./pages/farmer/EditListing";
import Earnings from "./pages/farmer/Earnings";
import FarmerOrders from "./pages/farmer/FarmerOrders";
import FarmProfile from "./pages/farmer/FarmProfile";
import Listings from "./pages/farmer/Listings";
import NewListing from "./pages/farmer/NewListing";
import Overview from "./pages/farmer/Overview";
import Home from "./pages/Home";
import { UiProvider } from "./ui/UiProvider";
import "./styles/app.css";
import "./styles/site.css";

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <BrowserRouter>
      <AuthProvider>
        <UiProvider>
          <AppBanners />
          <Routes>
            <Route element={<SiteShell />}>
              <Route index element={<Home />} />
              <Route path="shop" element={<Shop />} />
              <Route path="products/:productId" element={<ProductDetail />} />
              <Route path="basket" element={<RequireRole role="buyer"><Basket /></RequireRole>} />
              <Route path="orders" element={<RequireRole role="buyer"><Orders /></RequireRole>} />
              <Route path="account" element={<RequireRole role="buyer"><Account /></RequireRole>} />
              <Route path="payment/return" element={<RequireRole role="buyer"><PaymentReturn /></RequireRole>} />
              <Route path="terms" element={<TermsPage />} />
              <Route path="privacy" element={<PrivacyPage />} />
            </Route>

            <Route path="login" element={<LoginPage />} />
            <Route path="register" element={<RegisterPage />} />
            <Route path="forgot-password" element={<ForgotPasswordPage />} />
            <Route path="reset-password" element={<ResetPasswordPage />} />
            <Route path="shop/products/:productId" element={<LegacyProductRedirect />} />

            <Route element={<PlainShell />}>
              <Route path="farm/listings/new" element={<RequireRole role="farmer"><NewListing /></RequireRole>} />
              <Route path="farm/listings/:productId/edit" element={<RequireRole role="farmer"><EditListing /></RequireRole>} />
            </Route>

            <Route path="farm" element={<FarmerShell />}>
              <Route index element={<Overview />} />
              <Route path="orders" element={<FarmerOrders />} />
              <Route path="listings" element={<Listings />} />
              <Route path="earnings" element={<Earnings />} />
              <Route path="profile" element={<FarmProfile />} />
            </Route>

            <Route path="admin" element={<RequireRole role="admin"><AdminShell /></RequireRole>}>
              <Route index element={<AdminHome />} />
              <Route path="farms" element={<Applications />} />
              <Route path="dispatch" element={<Dispatch />} />
              <Route path="payouts" element={<Payouts />} />
              <Route path="settings" element={<AdminSettings />} />
              <Route path="orders" element={<AdminOrders />} />
              <Route path="delivery" element={<DeliveryAreas />} />
            </Route>
            <Route path="*" element={<Navigate to="/" replace />} />
          </Routes>
        </UiProvider>
      </AuthProvider>
    </BrowserRouter>
  </StrictMode>,
);
