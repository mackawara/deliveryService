/**
 * Status vocabulary. Every state renders a text label and an icon as well as a tone,
 * so meaning never depends on colour and both brand presets stay readable
 * (specification sections 7 and 8).
 */
import type { StatusTone } from '@/theme/tokens';

export interface StatusDescriptor {
  label: string;
  tone: StatusTone;
  /** Short icon hint resolved by StatusChip; keeps this module free of JSX. */
  icon: StatusIconName;
  /** Optional clarification shown in a tooltip. */
  hint?: string;
}

export type StatusIconName =
  | 'draft'
  | 'review'
  | 'quote'
  | 'confirmed'
  | 'ready'
  | 'assigned'
  | 'transit'
  | 'delivered'
  | 'failed'
  | 'returned'
  | 'cancelled'
  | 'paid'
  | 'cash'
  | 'pending'
  | 'unknown'
  | 'refund'
  | 'blocked'
  | 'available'
  | 'break'
  | 'offline'
  | 'busy'
  | 'open'
  | 'closed';

const fallback = (value: string): StatusDescriptor => ({
  label: value
    .replaceAll('_', ' ')
    .toLowerCase()
    .replace(/^./, (c) => c.toUpperCase()),
  tone: 'neutral',
  icon: 'unknown',
  hint: 'This state was returned by the server and is not one the dashboard knows about.',
});

export function describeStatus<T extends string>(
  registry: Partial<Record<T, StatusDescriptor>>,
  value: T | null | undefined,
): StatusDescriptor {
  if (!value) return { label: 'Unavailable', tone: 'neutral', icon: 'unknown' };
  return registry[value] ?? fallback(value);
}

export const deliveryStatusMeta: Record<string, StatusDescriptor> = {
  DRAFT: { label: 'Draft', tone: 'neutral', icon: 'draft' },
  REVIEW_REQUIRED: { label: 'Review required', tone: 'caution', icon: 'review' },
  QUOTED: {
    label: 'Quoted',
    tone: 'info',
    icon: 'quote',
    hint: 'A draft quote is not a customer-approved price.',
  },
  CONFIRMED: { label: 'Confirmed', tone: 'info', icon: 'confirmed' },
  READY_FOR_DISPATCH: { label: 'Ready for dispatch', tone: 'progress', icon: 'ready' },
  ASSIGNED: { label: 'Assigned', tone: 'progress', icon: 'assigned' },
  HEADING_TO_PICKUP: { label: 'Heading to pickup', tone: 'progress', icon: 'transit' },
  AT_PICKUP: { label: 'At pickup', tone: 'progress', icon: 'transit' },
  COLLECTED: { label: 'Collected', tone: 'progress', icon: 'transit' },
  IN_TRANSIT: { label: 'In transit', tone: 'progress', icon: 'transit' },
  AT_DROPOFF: { label: 'At drop-off', tone: 'progress', icon: 'transit' },
  DELIVERED: { label: 'Delivered', tone: 'positive', icon: 'delivered' },
  DELIVERY_ATTEMPT_FAILED: { label: 'Attempt failed', tone: 'critical', icon: 'failed' },
  RETRY_AUTHORIZED: { label: 'Retry authorized', tone: 'caution', icon: 'pending' },
  RETURNING: { label: 'Returning', tone: 'caution', icon: 'returned' },
  RETURNED: { label: 'Returned', tone: 'caution', icon: 'returned' },
  CANCELLED: { label: 'Cancelled', tone: 'critical', icon: 'cancelled' },
};

export const bookingPaymentStateMeta: Record<string, StatusDescriptor> = {
  PENDING_SELECTION: { label: 'Method not chosen', tone: 'neutral', icon: 'pending' },
  DUE_AT_DELIVERY: { label: 'Cash due at delivery', tone: 'info', icon: 'cash' },
  ON_ACCOUNT: { label: 'On account', tone: 'info', icon: 'pending' },
  ATTEMPT_PENDING: { label: 'Payment pending', tone: 'progress', icon: 'pending' },
  PAID: { label: 'Paid', tone: 'positive', icon: 'paid' },
  FAILED: { label: 'Payment failed', tone: 'critical', icon: 'failed' },
  REFUND_PENDING: { label: 'Refund pending', tone: 'caution', icon: 'refund' },
  REFUNDED: { label: 'Refunded', tone: 'neutral', icon: 'refund' },
  EXCEPTION: { label: 'Finance exception', tone: 'critical', icon: 'failed' },
};

export const paymentMethodMeta: Record<string, StatusDescriptor> = {
  CASH_ON_DELIVERY: { label: 'Cash on delivery', tone: 'neutral', icon: 'cash' },
  ECOCASH: { label: 'EcoCash', tone: 'neutral', icon: 'paid' },
  PAYNOW_CHECKOUT: { label: 'Paynow checkout', tone: 'neutral', icon: 'paid' },
  ACCOUNT: { label: 'Credit account', tone: 'neutral', icon: 'pending' },
};

export const paymentAttemptMeta: Record<string, StatusDescriptor> = {
  CREATED: { label: 'Created', tone: 'neutral', icon: 'draft' },
  SUBMITTED: { label: 'Submitted', tone: 'progress', icon: 'pending' },
  PENDING: { label: 'Pending', tone: 'progress', icon: 'pending' },
  PAID: { label: 'Paid', tone: 'positive', icon: 'paid' },
  FAILED: { label: 'Failed', tone: 'critical', icon: 'failed' },
  CANCELLED: { label: 'Cancelled', tone: 'neutral', icon: 'cancelled' },
  UNKNOWN: {
    label: 'Unknown',
    tone: 'caution',
    icon: 'unknown',
    hint: 'Check the original attempt with the provider; never create a second payment.',
  },
};

export const cashStateMeta: Record<string, StatusDescriptor> = {
  DUE: { label: 'Due', tone: 'info', icon: 'cash' },
  COLLECTED_BY_DRIVER: { label: 'Collected by driver', tone: 'progress', icon: 'cash' },
  REMITTED: { label: 'Remitted', tone: 'positive', icon: 'paid' },
  RECONCILED: { label: 'Reconciled', tone: 'positive', icon: 'delivered' },
  DISCREPANCY: { label: 'Discrepancy', tone: 'critical', icon: 'failed' },
};

export const refundStatusMeta: Record<string, StatusDescriptor> = {
  REQUESTED: { label: 'Requested', tone: 'info', icon: 'pending' },
  APPROVED: { label: 'Approved', tone: 'progress', icon: 'confirmed' },
  PROCESSING: { label: 'Processing', tone: 'progress', icon: 'pending' },
  COMPLETED: { label: 'Completed', tone: 'positive', icon: 'paid' },
  FAILED: { label: 'Failed', tone: 'critical', icon: 'failed' },
  REJECTED: { label: 'Rejected', tone: 'neutral', icon: 'cancelled' },
};

export const assignmentStateMeta: Record<string, StatusDescriptor> = {
  OFFERED: {
    label: 'Awaiting driver acceptance',
    tone: 'progress',
    icon: 'pending',
    hint: 'A sent offer is not an assignment until the driver accepts.',
  },
  ACCEPTED: { label: 'Accepted', tone: 'positive', icon: 'assigned' },
  DECLINED: { label: 'Declined', tone: 'caution', icon: 'cancelled' },
  EXPIRED: { label: 'Offer expired', tone: 'caution', icon: 'pending' },
  RELEASED: { label: 'Released', tone: 'neutral', icon: 'cancelled' },
  COMPLETED: { label: 'Completed', tone: 'positive', icon: 'delivered' },
};

export const availabilityMeta: Record<string, StatusDescriptor> = {
  AVAILABLE: { label: 'Available', tone: 'positive', icon: 'available' },
  BREAK: { label: 'On break', tone: 'caution', icon: 'break' },
  OFF_DUTY: { label: 'Off duty', tone: 'neutral', icon: 'offline' },
  RESERVED: { label: 'Reserved', tone: 'progress', icon: 'busy' },
  BUSY: { label: 'Busy', tone: 'progress', icon: 'busy' },
  UNAVAILABLE: { label: 'Unavailable', tone: 'neutral', icon: 'offline' },
};

export const driverStatusMeta: Record<string, StatusDescriptor> = {
  ACTIVE: { label: 'Active', tone: 'positive', icon: 'available' },
  SUSPENDED: { label: 'Suspended', tone: 'critical', icon: 'blocked' },
  INACTIVE: { label: 'Inactive', tone: 'neutral', icon: 'offline' },
};

export const driverApprovalMeta: Record<string, StatusDescriptor> = {
  APPLICATION: { label: 'Application', tone: 'neutral', icon: 'draft' },
  PHONE_VERIFIED: { label: 'Phone verified', tone: 'info', icon: 'confirmed' },
  DOCUMENTS_UNDER_REVIEW: { label: 'Documents under review', tone: 'progress', icon: 'review' },
  VEHICLE_CHECKED: { label: 'Vehicle checked', tone: 'progress', icon: 'confirmed' },
  APPROVED: { label: 'Approved', tone: 'positive', icon: 'confirmed' },
  REJECTED: { label: 'Rejected', tone: 'critical', icon: 'cancelled' },
  ACTIVATED: { label: 'Activated', tone: 'positive', icon: 'available' },
};

export const vehicleServiceMeta: Record<string, StatusDescriptor> = {
  IN_SERVICE: { label: 'In service', tone: 'positive', icon: 'available' },
  MAINTENANCE: { label: 'Maintenance', tone: 'caution', icon: 'break' },
  OUT_OF_SERVICE: { label: 'Out of service', tone: 'critical', icon: 'offline' },
};

export const enquiryStatusMeta: Record<string, StatusDescriptor> = {
  OPEN: { label: 'Open', tone: 'caution', icon: 'open' },
  IN_PROGRESS: { label: 'In progress', tone: 'progress', icon: 'pending' },
  RESOLVED: { label: 'Resolved', tone: 'positive', icon: 'delivered' },
  CLOSED: { label: 'Closed', tone: 'neutral', icon: 'closed' },
};

export const enquiryCategoryMeta: Record<string, StatusDescriptor> = {
  BOOKING_HELP: { label: 'Booking help', tone: 'neutral', icon: 'open' },
  PRICING_COVERAGE: { label: 'Pricing and coverage', tone: 'neutral', icon: 'quote' },
  DELIVERY_ISSUE: { label: 'Delivery issue', tone: 'caution', icon: 'failed' },
  PAYMENT_ISSUE: { label: 'Payment issue', tone: 'caution', icon: 'cash' },
  COMPLAINT: { label: 'Complaint', tone: 'critical', icon: 'review' },
  OTHER: { label: 'Other', tone: 'neutral', icon: 'open' },
};

export const restrictionStatusMeta: Record<string, StatusDescriptor> = {
  ACTIVE: { label: 'Active restriction', tone: 'critical', icon: 'blocked' },
  EXPIRED: { label: 'Expired', tone: 'neutral', icon: 'closed' },
  REVOKED: { label: 'Revoked', tone: 'neutral', icon: 'closed' },
};

export const fraudReportStatusMeta: Record<string, StatusDescriptor> = {
  OPEN: { label: 'Open', tone: 'caution', icon: 'open' },
  UNDER_REVIEW: { label: 'Under review', tone: 'progress', icon: 'review' },
  DISMISSED: { label: 'Dismissed', tone: 'neutral', icon: 'closed' },
  RESTRICTION_APPLIED: { label: 'Restriction applied', tone: 'critical', icon: 'blocked' },
};

export const restrictionReasonMeta: Record<string, StatusDescriptor> = {
  FRAUDULENT_SHIPMENT: { label: 'Fraudulent shipment', tone: 'critical', icon: 'blocked' },
  PROHIBITED_GOODS: { label: 'Prohibited goods', tone: 'critical', icon: 'blocked' },
  PARCEL_MISREPRESENTATION: { label: 'Parcel misrepresentation', tone: 'caution', icon: 'review' },
  REPEATED_PAYMENT_FRAUD: { label: 'Repeated payment fraud', tone: 'critical', icon: 'failed' },
  SERVICE_ABUSE: { label: 'Service abuse', tone: 'caution', icon: 'review' },
};

export const rateCardStatusMeta: Record<string, StatusDescriptor> = {
  DRAFT: { label: 'Draft', tone: 'neutral', icon: 'draft' },
  PUBLISHED: { label: 'Published', tone: 'positive', icon: 'confirmed' },
  SUPERSEDED: { label: 'Superseded', tone: 'neutral', icon: 'closed' },
};

export const holdCodeMeta: Record<string, StatusDescriptor> = {
  RESTRICTION: { label: 'Restriction hold', tone: 'critical', icon: 'blocked' },
  PAYMENT: { label: 'Payment hold', tone: 'caution', icon: 'cash' },
  CASH_ARRANGEMENT: { label: 'Cash arrangement hold', tone: 'caution', icon: 'cash' },
  CAPACITY: { label: 'Capacity hold', tone: 'caution', icon: 'pending' },
  OPERATOR_REVIEW: { label: 'Operator review hold', tone: 'caution', icon: 'review' },
};
