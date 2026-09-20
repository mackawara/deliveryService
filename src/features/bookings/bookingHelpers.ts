import type { Booking } from '@/api/types';
import type { DeliveryStatus } from '@/api/dto/booking';

/** States that still need operator attention. */
export const ACTIVE_STATUSES: DeliveryStatus[] = [
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
  'DELIVERY_ATTEMPT_FAILED',
  'RETRY_AUTHORIZED',
  'RETURNING',
];

export const TERMINAL_STATUSES: DeliveryStatus[] = ['DELIVERED', 'RETURNED', 'CANCELLED'];

export function isActiveBooking(booking: Booking): boolean {
  return !TERMINAL_STATUSES.includes(booking.status);
}

/** Waybill when the booking has one, otherwise a short draft reference. */
export function bookingReference(booking: Pick<Booking, 'waybill' | 'id'>): string {
  return booking.waybill ?? `Draft ${booking.id.slice(-6)}`;
}

/**
 * The price to show. An accepted quote is the customer-approved price; a current quote
 * is only a draft and must be labelled as such (specification section 4.2).
 */
export function bookingPrice(booking: Booking): { cents: number | null; accepted: boolean } {
  if (booking.acceptedQuote) return { cents: booking.acceptedQuote.totalCents, accepted: true };
  if (booking.currentQuote) return { cents: booking.currentQuote.totalCents, accepted: false };
  return { cents: null, accepted: false };
}

export function activeHolds(booking: Booking) {
  return booking.holds.filter((hold) => !hold.releasedAt);
}

/** Holds an operator may release; restriction and payment holds are resolved elsewhere. */
export const RELEASABLE_HOLDS = ['OPERATOR_REVIEW', 'CAPACITY', 'CASH_ARRANGEMENT'] as const;
export type ReleasableHold = (typeof RELEASABLE_HOLDS)[number];

export function isReleasable(code: string): code is ReleasableHold {
  return (RELEASABLE_HOLDS as readonly string[]).includes(code);
}

/**
 * Delivery events an operator may record from the dashboard, derived from the booking's
 * current state. The server still rejects anything that breaks a custody, capacity,
 * payment or restriction rule.
 */
export function suggestedNextStates(booking: Booking): DeliveryStatus[] {
  switch (booking.status) {
    case 'ASSIGNED':
      return ['HEADING_TO_PICKUP', 'AT_PICKUP'];
    case 'HEADING_TO_PICKUP':
      return ['AT_PICKUP'];
    case 'AT_PICKUP':
      return ['COLLECTED'];
    case 'COLLECTED':
      return ['IN_TRANSIT'];
    case 'IN_TRANSIT':
      return ['AT_DROPOFF'];
    case 'AT_DROPOFF':
      return ['DELIVERED', 'DELIVERY_ATTEMPT_FAILED'];
    case 'DELIVERY_ATTEMPT_FAILED':
      return ['RETRY_AUTHORIZED', 'RETURNING'];
    case 'RETRY_AUTHORIZED':
      return ['AT_DROPOFF', 'RETURNING'];
    case 'RETURNING':
      return ['RETURNED'];
    default:
      return [];
  }
}
