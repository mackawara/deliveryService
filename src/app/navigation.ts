import AssignmentIcon from '@mui/icons-material/Assignment';
import CampaignIcon from '@mui/icons-material/Campaign';
import DashboardIcon from '@mui/icons-material/Dashboard';
import DirectionsCarIcon from '@mui/icons-material/DirectionsCar';
import FactCheckIcon from '@mui/icons-material/FactCheck';
import GavelIcon from '@mui/icons-material/Gavel';
import HistoryIcon from '@mui/icons-material/History';
import Inventory2Icon from '@mui/icons-material/Inventory2';
import MapIcon from '@mui/icons-material/Map';
import PaidIcon from '@mui/icons-material/Paid';
import PaletteIcon from '@mui/icons-material/Palette';
import PaymentsIcon from '@mui/icons-material/Payments';
import PeopleIcon from '@mui/icons-material/People';
import PersonPinIcon from '@mui/icons-material/PersonPin';
import PriceChangeIcon from '@mui/icons-material/PriceChange';
import ReplayIcon from '@mui/icons-material/Replay';
import RouteIcon from '@mui/icons-material/Route';
import SupportAgentIcon from '@mui/icons-material/SupportAgent';
import TravelExploreIcon from '@mui/icons-material/TravelExplore';
import VerifiedUserIcon from '@mui/icons-material/VerifiedUser';
import type { SvgIconComponent } from '@mui/icons-material';

import { CAPABILITY, type AccessRequirement } from '@/lib/permissions';

export type NavGroup = 'operations' | 'finance' | 'administration';

export interface NavItem {
  path: string;
  label: string;
  icon: SvgIconComponent;
  group: NavGroup;
  requirement?: AccessRequirement;
  /** Short description used as a tooltip and on the overview cards. */
  description: string;
}

/**
 * Navigation model and route access (specification section 3).
 *
 * Only sections the user can access are displayed, and the matching route guard repeats
 * the requirement so a direct URL is still checked.
 */
export const OPERATOR_ONLY: AccessRequirement = { anyRole: ['operator'] };
export const FINANCE_ONLY: AccessRequirement = { anyRole: ['finance'] };
export const ADMIN_ONLY: AccessRequirement = { anyRole: ['admin'] };
/** Configuration reads are open to operator and admin; writes stay admin-only. */
export const CONFIG_READ: AccessRequirement = { anyRole: ['operator', 'admin'] };
/** Audit is admin plus finance, where finance only ever receives finance events. */
export const AUDIT_READ: AccessRequirement = { anyRole: ['admin', 'finance'] };
export const STAFF_MANAGE: AccessRequirement = {
  anyRole: ['admin'],
  anyCapability: [CAPABILITY.staffManage],
};

/** Shown above the groups: the overview is available to every authenticated staff member. */
export const PRIMARY_ITEMS: NavItem[] = [
  {
    path: '/',
    label: 'Overview',
    icon: DashboardIcon,
    group: 'operations',
    description: 'Outstanding work across the towns you can access.',
  },
];

export const NAV_ITEMS: NavItem[] = [
  {
    path: '/bookings',
    label: 'Bookings',
    icon: AssignmentIcon,
    group: 'operations',
    requirement: OPERATOR_ONLY,
    description: 'Booking queue, detail and operator commands.',
  },
  {
    path: '/dispatch',
    label: 'Dispatch',
    icon: RouteIcon,
    group: 'operations',
    requirement: OPERATOR_ONLY,
    description: 'Match a booking to an available driver and vehicle.',
  },
  {
    path: '/drivers',
    label: 'Drivers',
    icon: PersonPinIcon,
    group: 'operations',
    requirement: OPERATOR_ONLY,
    description: 'Driver records, availability and approval state.',
  },
  {
    path: '/vehicles',
    label: 'Vehicles',
    icon: DirectionsCarIcon,
    group: 'operations',
    requirement: OPERATOR_ONLY,
    description: 'Vehicle capacity, handling and service state.',
  },
  {
    path: '/customers',
    label: 'Customers',
    icon: PeopleIcon,
    group: 'operations',
    requirement: OPERATOR_ONLY,
    description: 'Search by phone or town and review history.',
  },
  {
    path: '/enquiries',
    label: 'Enquiries',
    icon: SupportAgentIcon,
    group: 'operations',
    requirement: OPERATOR_ONLY,
    description: 'Support queue, ownership and replies.',
  },
  {
    path: '/alerts',
    label: 'Alerts',
    icon: CampaignIcon,
    group: 'operations',
    requirement: OPERATOR_ONLY,
    description: 'Notification failures and payments with an unknown outcome.',
  },
  {
    path: '/finance/payments',
    label: 'Payments',
    icon: PaymentsIcon,
    group: 'finance',
    requirement: FINANCE_ONLY,
    description: 'Payment attempts and provider reconciliation.',
  },
  {
    path: '/finance/cash',
    label: 'Cash ledger',
    icon: PaidIcon,
    group: 'finance',
    requirement: FINANCE_ONLY,
    description: 'Cash due, collected, remitted, reconciled and discrepancies.',
  },
  {
    path: '/finance/refunds',
    label: 'Refunds',
    icon: ReplayIcon,
    group: 'finance',
    requirement: FINANCE_ONLY,
    description: 'Request, approve and settle refunds.',
  },
  {
    path: '/restrictions',
    label: 'Restrictions',
    icon: GavelIcon,
    group: 'administration',
    requirement: ADMIN_ONLY,
    description: 'Blacklist review, activation and revocation.',
  },
  {
    path: '/configuration/towns',
    label: 'Towns',
    icon: TravelExploreIcon,
    group: 'administration',
    requirement: CONFIG_READ,
    description: 'Service areas, operating hours and launch readiness.',
  },
  {
    path: '/configuration/zones',
    label: 'Zones',
    icon: MapIcon,
    group: 'administration',
    requirement: CONFIG_READ,
    description: 'Zone codes, aliases and boundary data.',
  },
  {
    path: '/configuration/rates',
    label: 'Rate cards',
    icon: PriceChangeIcon,
    group: 'administration',
    requirement: CONFIG_READ,
    description: 'Zone-pair pricing by parcel class, drafted then published.',
  },
  {
    path: '/configuration/parcels',
    label: 'Parcel presets',
    icon: Inventory2Icon,
    group: 'administration',
    requirement: CONFIG_READ,
    description: 'Preset labels, limits and handling for the customer flow.',
  },
  {
    path: '/audit',
    label: 'Audit',
    icon: HistoryIcon,
    group: 'administration',
    requirement: AUDIT_READ,
    description: 'Actor, action, entity and time history.',
  },
];

export const NAV_GROUP_LABELS: Record<NavGroup, string> = {
  operations: 'Operations',
  finance: 'Finance',
  administration: 'Administration',
};

export const SETTINGS_ITEMS: NavItem[] = [
  {
    path: '/settings/appearance',
    label: 'Appearance',
    icon: PaletteIcon,
    group: 'administration',
    description: 'Brand preset and interface density for this browser.',
  },
  {
    path: '/settings/access',
    label: 'Access & staff',
    icon: VerifiedUserIcon,
    group: 'administration',
    description: 'Your effective access, and staff provisioning for administrators.',
  },
];

/** Icon used by the overview for work that needs attention. */
export const REVIEW_ICON = FactCheckIcon;
