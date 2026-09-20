import type {
  Actor,
  DimensionsCm,
  GeoPoint,
  HandlingCode,
  IsoDateTime,
  VehicleClass,
  WireDocument,
  WireVersioned,
} from '@/api/dto/common';
import type { WireCashEntry, WirePaymentAttempt } from '@/api/dto/finance';

export const DELIVERY_STATUSES = [
  'DRAFT',
  'REVIEW_REQUIRED',
  'QUOTED',
  'CONFIRMED',
  'READY_FOR_DISPATCH',
  'ASSIGNED',
  'HEADING_TO_PICKUP',
  'AT_PICKUP',
  'COLLECTED',
  'IN_TRANSIT',
  'AT_DROPOFF',
  'DELIVERED',
  'DELIVERY_ATTEMPT_FAILED',
  'RETRY_AUTHORIZED',
  'RETURNING',
  'RETURNED',
  'CANCELLED',
] as const;
export type DeliveryStatus = (typeof DELIVERY_STATUSES)[number];

export const BOOKING_PAYMENT_STATES = [
  'PENDING_SELECTION',
  'DUE_AT_DELIVERY',
  'ON_ACCOUNT',
  'ATTEMPT_PENDING',
  'PAID',
  'FAILED',
  'REFUND_PENDING',
  'REFUNDED',
  'EXCEPTION',
] as const;
export type BookingPaymentState = (typeof BOOKING_PAYMENT_STATES)[number];

export const PAYMENT_METHODS = [
  'CASH_ON_DELIVERY',
  'ECOCASH',
  'PAYNOW_CHECKOUT',
  'ACCOUNT',
] as const;
export type PaymentMethod = (typeof PAYMENT_METHODS)[number];

export type PointSource = 'SAVED_VERIFIED' | 'WHATSAPP_PIN' | 'OPERATOR_CONFIRMED' | 'NONE';

export interface Endpoint {
  zoneCode?: string;
  zoneId?: string;
  addressLine: string;
  landmark?: string;
  point?: GeoPoint;
  pointSource: PointSource;
  pointReceivedAt?: IsoDateTime;
  contactName: string;
  contactPhone: string;
  savedAddressId?: string;
  verified: boolean;
  needsOperatorConfirmation: boolean;
}

export type ParcelMode = 'PRESET' | 'CUSTOM' | 'UNKNOWN' | 'MIXED';

export interface ParcelDeclaration {
  mode: ParcelMode;
  categoryCode: string;
  categoryOther?: string;
  quantity: number;
  presetCode?: string;
  presetVersion?: number;
  declaredUpperBounds?: { weightKg: number; dimensionsCm: DimensionsCm };
  customMeasurements?: { weightKg: number; dimensionsCm: DimensionsCm };
  specialHandling: HandlingCode[];
  description?: string;
}

export interface QuoteLineItem {
  code: string;
  label: string;
  amountCents: number;
  kind: 'ZONE_PAIR_RATE' | 'EXTRA' | 'DISCOUNT';
  acceptedByCustomer?: boolean;
}

export interface QuoteSnapshot {
  quoteId: string;
  version: number;
  townId: string;
  rateCardId: string;
  rateCardVersion: number;
  parcelClass: string;
  currency: 'USD';
  lineItems: QuoteLineItem[];
  totalCents: number;
  inputSnapshot: Record<string, unknown>;
  createdAt: IsoDateTime;
  createdBy: Actor;
  expiresAt: IsoDateTime;
  acceptedAt?: IsoDateTime;
  taxTreatment?: string;
}

export interface BookingPayment {
  method?: PaymentMethod;
  provider: 'NONE' | 'PAYNOW';
  payerRole: 'SENDER';
  cashCollectionPoint?: 'DROPOFF';
  cashHandoverContact?: {
    name: string;
    phone: string;
    relationship: 'SENDER' | 'RECIPIENT' | 'OTHER';
    agreedAt: IsoDateTime;
    recordedBy: Actor;
  };
  state: BookingPaymentState;
  amountDueCents: number;
  currency: 'USD';
  paidAt?: IsoDateTime;
  activeAttemptId?: string;
  lastAttemptId?: string;
  creditAccountId?: string;
  creditLedgerEntryId?: string;
}

export interface VehicleRequirement {
  allowedClasses: VehicleClass[];
  smallestSuitableClass?: VehicleClass;
  totalWeightKg?: number;
  totalVolumeCm3?: number;
  largestItemDimensionsCm?: DimensionsCm;
  requiredHandling: HandlingCode[];
  unresolved: boolean;
  reasons: string[];
}

export type BookingHoldCode =
  'RESTRICTION' | 'PAYMENT' | 'CASH_ARRANGEMENT' | 'CAPACITY' | 'OPERATOR_REVIEW';

export interface BookingHold {
  code: BookingHoldCode;
  reason: string;
  placedAt: IsoDateTime;
  placedBy: Actor;
  releasedAt?: IsoDateTime;
  releasedBy?: Actor;
}

export interface WireBooking extends WireDocument, WireVersioned {
  townId: string;
  waybill?: string;
  status: DeliveryStatus;
  customerId: string;
  sender: { name: string; phone: string; whatsappId: string };
  pickup: Endpoint;
  dropoff: Endpoint;
  parcel: ParcelDeclaration;
  vehicleRequirement: VehicleRequirement;
  photos: Array<{ mediaObjectId: string; addedAt: IsoDateTime; purpose: 'PARCEL_CONDITION' }>;
  currentQuote?: QuoteSnapshot;
  acceptedQuote?: QuoteSnapshot;
  review: {
    required: boolean;
    reasons: string[];
    requestedAt?: IsoDateTime;
    resolvedAt?: IsoDateTime;
    resolvedBy?: Actor;
  };
  payment: BookingPayment;
  eligibilityCheckVersion: number;
  assignment?: {
    assignmentId: string;
    driverId: string;
    vehicleId: string;
    assignedAt: IsoDateTime;
  };
  capacityQueue?: { queued: boolean; since: IsoDateTime; notifiedCustomer: boolean };
  proof?: {
    recipientName?: string;
    deliveredAt?: IsoDateTime;
    method?: 'HANDOVER_CODE' | 'OPERATOR_APPROVED_ALTERNATIVE';
    approvedBy?: Actor;
    approvalReason?: string;
  };
  cancellation?: { cancelledAt: IsoDateTime; reason: string; by: Actor; refundRequired: boolean };
  deliveryAttempts: number;
  custody: {
    holder: 'SENDER' | 'DRIVER' | 'RECIPIENT' | 'OPERATOR';
    driverId?: string;
    since: IsoDateTime;
  };
  source: 'WHATSAPP_FLOW' | 'CHAT_FALLBACK' | 'OPERATOR';
  confirmedAt?: IsoDateTime;
  holds: BookingHold[];
  operatorNotes?: string;
}

export interface WireDeliveryEvent extends WireDocument {
  bookingId: string;
  townId: string;
  priorState: DeliveryStatus;
  newState: DeliveryStatus;
  actor: Actor;
  assignmentId?: string;
  assignmentVersion?: number;
  occurredAt: IsoDateTime;
  receivedAt: IsoDateTime;
  reason?: string;
  proofReference?: string;
  correlationId?: string;
}

export const ASSIGNMENT_STATES = [
  'OFFERED',
  'ACCEPTED',
  'DECLINED',
  'EXPIRED',
  'RELEASED',
  'COMPLETED',
] as const;
export type AssignmentState = (typeof ASSIGNMENT_STATES)[number];

export interface WireAssignment extends WireDocument, WireVersioned {
  bookingId: string;
  townId: string;
  driverId: string;
  vehicleId: string;
  state: AssignmentState;
  active: boolean;
  offeredAt: IsoDateTime;
  offeredBy: Actor;
  offerExpiresAt: IsoDateTime;
  acceptedAt?: IsoDateTime;
  declinedAt?: IsoDateTime;
  releasedAt?: IsoDateTime;
  releaseReason?: string;
  completedAt?: IsoDateTime;
  custodyHandover?: {
    fromDriverId: string;
    toDriverId: string;
    at: IsoDateTime;
    recordedBy: Actor;
    note?: string;
  };
  supersededByAssignmentId?: string;
}

export interface WireQuote extends WireDocument, WireVersioned, QuoteSnapshot {
  bookingId: string;
  status: 'ACTIVE' | 'SUPERSEDED' | 'ACCEPTED' | 'EXPIRED';
}

/** `GET /admin/bookings/:id` composite detail response. */
export interface WireBookingDetail {
  booking: WireBooking;
  custodyHistory: WireDeliveryEvent[];
  assignments: WireAssignment[];
  payments: WirePaymentAttempt[];
  cash: WireCashEntry[];
  quotes: WireQuote[];
}
