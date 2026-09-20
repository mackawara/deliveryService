import type { GeoPoint, IsoDateTime } from '@/api/dto/common';
import type { DeliveryStatus, PaymentMethod, BookingPaymentState } from '@/api/dto/booking';

export interface SavedAddress {
  id: string;
  label: string;
  zoneCode?: string;
  addressLine: string;
  landmark?: string;
  point?: GeoPoint;
  /** Only verified coordinates may be reused without operator confirmation. */
  verified: boolean;
  contactName?: string;
  contactPhone?: string;
  lastUsedAt?: IsoDateTime;
  createdAt: IsoDateTime;
}

export interface ConsentRecord {
  granted: boolean;
  grantedAt?: IsoDateTime;
  source?: string;
}

export type EligibilityStatus = 'ALLOWED' | 'RESTRICTED';

/** `GET /admin/customers` projects to `id`, not `_id`. */
export interface WireCustomerRow {
  id: string;
  name?: string;
  phone: string;
  townId?: string;
  restrictionStatus: EligibilityStatus;
  version: number;
}

export interface WireCustomerDetail {
  customer: {
    id: string;
    name?: string;
    phone: string;
    townId?: string;
    savedAddresses: SavedAddress[];
    consents: { serviceUpdates: ConsentRecord; marketing: ConsentRecord };
    version: number;
  };
  restrictionStatus: EligibilityStatus;
  activeRestrictions: Array<{
    id: string;
    reasonCode: string;
    scope: { type: 'TOWN' | 'PLATFORM'; townId?: string };
  }>;
  risk: WireCustomerRiskProfile | null;
}

export interface WireCustomerRiskProfile {
  customerId: string;
  townId?: string;
  windowDays: number;
  bookings: {
    total: number;
    delivered: number;
    cancelled: number;
    returned: number;
    failedAttempts: number;
  };
  cancellationRate: number;
  cash: {
    openBookings: number;
    openValueCents: number;
    discrepancies: number;
    outstandingDiscrepancyCents: number;
    limits?: { maxOpenBookings?: number; maxOpenValueCents?: number };
    exceeded?: boolean;
  };
  payments: { failed: number; unresolved: number };
  credit?: Record<string, unknown>;
}

export interface WireCustomerRiskResponse {
  profile: WireCustomerRiskProfile;
  recentBookings: Array<{
    id: string;
    waybill?: string;
    status: DeliveryStatus;
    paymentMethod?: PaymentMethod;
    paymentState: BookingPaymentState;
    amountDueCents: number;
    createdAt: IsoDateTime;
  }>;
}
