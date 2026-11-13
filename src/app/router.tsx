import { Alert, Typography, Stack } from '@mui/material';
import { Navigate, Outlet, createBrowserRouter, type RouteObject } from 'react-router-dom';

import { AuthProvider } from '@/auth/AuthProvider';
import { ForbiddenPage } from '@/auth/ForbiddenPage';
import { SignedOutPage } from '@/auth/SignedOutPage';
import { LegacyLoginRedirect, RequireAccess, RequireAuth, RequireShopAuth } from '@/auth/guards';
import { useBackForwardCacheGuard } from '@/auth/useBackForwardCacheGuard';
import { OwnerAuthProvider } from '@/auth/OwnerAuthProvider';
import { AppShell } from '@/components/AppShell';
import { appConfig } from '@/config';
import { ADMIN_ONLY, AUDIT_READ, CONFIG_READ, FINANCE_ONLY, OPERATOR_ONLY } from '@/app/navigation';
import { NotFoundPage } from '@/features/NotFoundPage';
import { AlertsPage } from '@/features/alerts/AlertsPage';
import { AuditPage } from '@/features/audit/AuditPage';
import { BookingDetailPage } from '@/features/bookings/BookingDetailPage';
import { BookingsPage } from '@/features/bookings/BookingsPage';
import { ParcelPresetsPage } from '@/features/configuration/ParcelPresetsPage';
import { RatesPage } from '@/features/configuration/RatesPage';
import { TownsPage } from '@/features/configuration/TownsPage';
import { ZonesPage } from '@/features/configuration/ZonesPage';
import { CustomerDetailPage } from '@/features/customers/CustomerDetailPage';
import { CustomersPage } from '@/features/customers/CustomersPage';
import { DispatchPage } from '@/features/dispatch/DispatchPage';
import { EnquiriesPage } from '@/features/enquiries/EnquiriesPage';
import { EnquiryDetailPage } from '@/features/enquiries/EnquiryDetailPage';
import { CashPage } from '@/features/finance/CashPage';
import { PaymentsPage } from '@/features/finance/PaymentsPage';
import { RefundsPage } from '@/features/finance/RefundsPage';
import { DriverDetailPage } from '@/features/fleet/DriverDetailPage';
import { DriversPage } from '@/features/fleet/DriversPage';
import { VehicleDetailPage } from '@/features/fleet/VehicleDetailPage';
import { VehiclesPage } from '@/features/fleet/VehiclesPage';
import { OverviewPage } from '@/features/overview/OverviewPage';
import { RestrictionDetailPage } from '@/features/restrictions/RestrictionDetailPage';
import { RestrictionsPage } from '@/features/restrictions/RestrictionsPage';
import { AccessPage } from '@/features/settings/AccessPage';
import { AppearancePage } from '@/features/settings/AppearancePage';
import { AdminShopsPage } from '@/features/shop/AdminShopsPage';
import { ShopCataloguePage } from '@/features/shop/ShopCataloguePage';
import { ShopHomePage } from '@/features/shop/ShopHomePage';
import { ShopProfilePage } from '@/features/shop/ShopProfilePage';
import { ShopSetupPage } from '@/features/shop/ShopSetupPage';
import { ShopOrdersPage, ShopOrdersEntry } from '@/features/shop/ShopOrdersPage';
import { ShopShell } from '@/features/shop/ShopShell';
import { ShopEarningsPage } from '@/features/shop/ShopEarningsPage';
import { ShopPayoutDetailsPage } from '@/features/shop/ShopPayoutDetailsPage';
import { ShopSettlementPage } from '@/features/shop/ShopSettlementPage';
import { ShopFinanceEntry } from '@/features/shop/ShopFinanceEntry';
import { FoodSettlementsPage } from '@/features/finance/FoodSettlementsPage';
import { FoodSettlementPage } from '@/features/finance/FoodSettlementPage';
import { FOOD_SETTLEMENTS_READ } from '@/lib/foodSettlementAccess';

/** Providers that need router context (navigation, location) sit inside the router. */
function RootLayout() {
  useBackForwardCacheGuard();
  return (
    <AuthProvider>
      <Outlet />
    </AuthProvider>
  );
}

/**
 * `import.meta.env.DEV` is replaced with `false` in a production build, so the stand-in
 * and its import are dropped from the bundle rather than merely being unreachable.
 */
const mockLoginRoutes: RouteObject[] =
  import.meta.env.DEV && appConfig.enableMockApi
    ? [
        {
          path: '/login',
          lazy: async () => ({ Component: (await import('@/mocks/MockLoginPage')).MockLoginPage }),
        },
      ]
    : [];

/**
 * Route table (specification section 3).
 *
 * Every guarded route repeats its requirement, so a direct URL is checked even when the
 * navigation item is hidden. A data router is used so unsaved-changes blocking works.
 */
export const routes: RouteObject[] = [
  {
    element: <RootLayout />,
    children: [
      // Standalone mock mode serves React at /; deployed public roots are proxied.
      { index: true, element: <Navigate to="/dashboard" replace /> },
      // There is no login page in this app: the one login is served outside it. In
      // mock mode nothing serves that address, so a development-only stand-in does.
      ...mockLoginRoutes,
      { path: '/signed-out', element: <SignedOutPage /> },
      // Old links keep working: they lead to the one login.
      { path: 'shop/login', element: <LegacyLoginRedirect /> },
      { path: 'shop/signup', element: <LegacyLoginRedirect intent="shop" /> },
      // The read-only shop page the home page used to open is retired.
      { path: 'shop/dashboard', element: <Navigate to="/shop" replace /> },
      {
        element: (
          <OwnerAuthProvider>
            <Outlet />
          </OwnerAuthProvider>
        ),
        children: [
          {
            element: (
              <RequireShopAuth>
                <ShopShell />
              </RequireShopAuth>
            ),
            children: [
              { path: 'shop', element: <ShopHomePage /> },
              { path: 'shop/orders', element: <ShopOrdersEntry /> },
              { path: 'shop/earnings', element: <ShopFinanceEntry section="earnings" /> },
              {
                path: 'shop/payout-details',
                element: <ShopFinanceEntry section="payout-details" />,
              },
              { path: 'shop/settlements/:id', element: <ShopFinanceEntry section="settlements" /> },
              { path: 'shop/:shopId/earnings', element: <ShopEarningsPage /> },
              { path: 'shop/:shopId/payout-details', element: <ShopPayoutDetailsPage /> },
              { path: 'shop/:shopId/settlements/:id', element: <ShopSettlementPage /> },
              {
                path: 'shop/help',
                element: (
                  <Stack spacing={2}>
                    <Typography component="h1" variant="h4">
                      Delivery operations help
                    </Typography>
                    <Alert severity="info">
                      Contact your agreed pilot delivery operations contact and quote the order
                      reference. Explain any delay, notification problem or failed handover. After
                      acceptance, operations must handle exceptions while preserving custody and
                      payment records. WhatsApp remains the order notification route when the
                      browser is asleep.
                    </Alert>
                  </Stack>
                ),
              },
              { path: 'shop/:shopId/orders', element: <ShopOrdersPage /> },
              { path: 'shop/:shopId/orders/:orderId', element: <ShopOrdersPage /> },
              { path: 'shop/setup', element: <ShopSetupPage /> },
              { path: 'shop/:shopId/profile', element: <ShopProfilePage /> },
              { path: 'shop/:shopId/catalogue', element: <ShopCataloguePage /> },
            ],
          },
        ],
      },
      {
        element: (
          <RequireAuth>
            <AppShell />
          </RequireAuth>
        ),
        children: [
          { path: 'dashboard', element: <OverviewPage /> },
          { path: 'forbidden', element: <ForbiddenPage /> },

          {
            element: <RequireAccess requirement={FOOD_SETTLEMENTS_READ} />,
            children: [
              { path: 'finance/food-settlements', element: <FoodSettlementsPage /> },
              { path: 'finance/food-settlements/:id', element: <FoodSettlementPage /> },
            ],
          },

          {
            element: <RequireAccess requirement={OPERATOR_ONLY} />,
            children: [
              { path: 'bookings', element: <BookingsPage /> },
              { path: 'bookings/:id', element: <BookingDetailPage /> },
              { path: 'dispatch', element: <DispatchPage /> },
              { path: 'drivers', element: <DriversPage /> },
              { path: 'drivers/:id', element: <DriverDetailPage /> },
              { path: 'vehicles', element: <VehiclesPage /> },
              { path: 'vehicles/:id', element: <VehicleDetailPage /> },
              { path: 'customers', element: <CustomersPage /> },
              { path: 'customers/:id', element: <CustomerDetailPage /> },
              { path: 'enquiries', element: <EnquiriesPage /> },
              { path: 'enquiries/:id', element: <EnquiryDetailPage /> },
              { path: 'alerts', element: <AlertsPage /> },
            ],
          },

          {
            element: <RequireAccess requirement={FINANCE_ONLY} />,
            children: [
              { path: 'finance/payments', element: <PaymentsPage /> },
              { path: 'finance/cash', element: <CashPage /> },
              { path: 'finance/refunds', element: <RefundsPage /> },
            ],
          },

          {
            element: <RequireAccess requirement={ADMIN_ONLY} />,
            children: [
              { path: 'restrictions', element: <RestrictionsPage /> },
              { path: 'restrictions/:id', element: <RestrictionDetailPage /> },
              { path: 'admin/food/shops', element: <AdminShopsPage /> },
            ],
          },

          {
            // Configuration reads are open to operator and admin; writes stay admin-only
            // inside each page and on the server.
            element: <RequireAccess requirement={CONFIG_READ} />,
            children: [
              { path: 'configuration/towns', element: <TownsPage /> },
              { path: 'configuration/zones', element: <ZonesPage /> },
              { path: 'configuration/rates', element: <RatesPage /> },
              { path: 'configuration/parcels', element: <ParcelPresetsPage /> },
            ],
          },

          {
            element: <RequireAccess requirement={AUDIT_READ} />,
            children: [{ path: 'audit', element: <AuditPage /> }],
          },

          { path: 'settings/appearance', element: <AppearancePage /> },
          { path: 'settings/access', element: <AccessPage /> },
        ],
      },
      { path: '*', element: <NotFoundPage /> },
    ],
  },
];

export function createAppRouter() {
  return createBrowserRouter(routes);
}
