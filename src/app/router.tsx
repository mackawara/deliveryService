import { Outlet, createBrowserRouter } from 'react-router-dom';

import { AuthProvider } from '@/auth/AuthProvider';
import { ForbiddenPage } from '@/auth/ForbiddenPage';
import { LoginPage } from '@/auth/LoginPage';
import { SignedOutPage } from '@/auth/SignedOutPage';
import { RedirectIfAuthenticated, RequireAccess, RequireAuth } from '@/auth/guards';
import { AppShell } from '@/components/AppShell';
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

/** Providers that need router context (navigation, location) sit inside the router. */
function RootLayout() {
  return (
    <AuthProvider>
      <Outlet />
    </AuthProvider>
  );
}

/**
 * Route table (specification section 3).
 *
 * Every guarded route repeats its requirement, so a direct URL is checked even when the
 * navigation item is hidden. A data router is used so unsaved-changes blocking works.
 */
export const routes = [
  {
    element: <RootLayout />,
    children: [
      {
        path: '/login',
        element: (
          <RedirectIfAuthenticated>
            <LoginPage />
          </RedirectIfAuthenticated>
        ),
      },
      { path: '/signed-out', element: <SignedOutPage /> },
      {
        element: (
          <RequireAuth>
            <AppShell />
          </RequireAuth>
        ),
        children: [
          { index: true, element: <OverviewPage /> },
          { path: 'forbidden', element: <ForbiddenPage /> },

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
