/**
 * Dashboard summary DTO for the proposed `GET /api/v1/admin/overview`
 * (specification sections 4.1 and 11, priority P1).
 *
 * Until the endpoint exists the overview shows links and clearly labelled loaded-page
 * information; it never computes a town-wide total from the first page of records.
 */
import type { IsoDateTime } from '@/api/dto/common';

export interface WireOverviewOperations {
  awaitingReview: number;
  readyForDispatch: number;
  awaitingDriverAcceptance: number;
  activeDeliveries: number;
  staleDriverLocations: number;
  openEnquiries: number;
  capacityQueued: number;
}

/**
 * Financial totals use documented definitions: cash remittance moves money that was
 * already collected and is never counted as additional revenue.
 */
export interface WireOverviewFinance {
  deliveryChargesCents: number;
  electronicPaymentsReceivedCents: number;
  cashCollectedCents: number;
  cashRemittedCents: number;
  refundsCompletedCents: number;
  cashOutstandingCents: number;
  unknownPaymentCount: number;
}

export interface WireOverviewAlerts {
  notificationFailures: number;
  stuckPayments: number;
}

export interface WireOverview {
  generatedAt: IsoDateTime;
  reportingWindow: { from: IsoDateTime; to: IsoDateTime; label: string };
  townId: string | null;
  /** Each section is present only when the caller's role permits it. */
  operations?: WireOverviewOperations;
  finance?: WireOverviewFinance;
  alerts?: WireOverviewAlerts;
}
