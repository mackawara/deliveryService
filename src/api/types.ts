/**
 * Normalized entities used by feature code.
 *
 * Every wire document is adapted to carry `id` instead of `_id`; timestamps stay ISO
 * strings and money stays integer cents.
 */
import type { EntityOf } from '@/api/dto/common';
import type { WireAssignment, WireBooking, WireDeliveryEvent, WireQuote } from '@/api/dto/booking';
import type { WireDriver, WirePresence, WireVehicle } from '@/api/dto/fleet';
import type { WireCashEntry, WirePaymentAttempt, WireRefund } from '@/api/dto/finance';
import type { WireEnquiry } from '@/api/dto/enquiry';
import type { WireFraudReport, WireRestriction } from '@/api/dto/restriction';
import type { WireParcelPreset, WireRateCard, WireTown, WireZone } from '@/api/dto/configuration';
import type { WireAuditEvent, WireOutboxEvent } from '@/api/dto/operations';

export type Booking = EntityOf<WireBooking>;
export type DeliveryEvent = EntityOf<WireDeliveryEvent>;
export type Assignment = EntityOf<WireAssignment>;
export type Quote = EntityOf<WireQuote>;
export type Driver = EntityOf<WireDriver>;
export type Presence = EntityOf<WirePresence>;
export type Vehicle = EntityOf<WireVehicle>;
export type PaymentAttempt = EntityOf<WirePaymentAttempt>;
export type CashEntry = EntityOf<WireCashEntry>;
export type Refund = EntityOf<WireRefund>;
export type Enquiry = EntityOf<WireEnquiry>;
export type Restriction = EntityOf<WireRestriction>;
export type FraudReport = EntityOf<WireFraudReport>;
export type Town = EntityOf<WireTown>;
export type Zone = EntityOf<WireZone>;
export type RateCard = EntityOf<WireRateCard>;
export type ParcelPreset = EntityOf<WireParcelPreset>;
export type AuditEvent = EntityOf<WireAuditEvent>;
export type OutboxEvent = EntityOf<WireOutboxEvent>;

/** Composite booking detail. Histories are capped by the backend and labelled as recent. */
export interface BookingDetail {
  booking: Booking;
  custodyHistory: DeliveryEvent[];
  assignments: Assignment[];
  payments: PaymentAttempt[];
  cash: CashEntry[];
  quotes: Quote[];
}

/** Caps applied by the inspected detail route; the UI labels these as recent records. */
export const DETAIL_HISTORY_CAPS = {
  custodyHistory: 100,
  assignments: 20,
  payments: 20,
  cash: 20,
  quotes: 20,
} as const;

export interface DriverRow {
  driver: Driver;
  presence: Presence | null;
}

export interface TownRow {
  town: Town;
  launchReadiness: { ready: boolean; missing: string[] };
}
