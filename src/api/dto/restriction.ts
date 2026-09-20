import type { Actor, IsoDateTime, WireDocument, WireVersioned } from '@/api/dto/common';

export const RESTRICTION_REASONS = [
  'FRAUDULENT_SHIPMENT',
  'PROHIBITED_GOODS',
  'PARCEL_MISREPRESENTATION',
  'REPEATED_PAYMENT_FRAUD',
  'SERVICE_ABUSE',
] as const;
export type RestrictionReason = (typeof RESTRICTION_REASONS)[number];

export const EVIDENCE_KINDS = ['BOOKING', 'PAYMENT', 'MEDIA', 'NOTE', 'ENQUIRY'] as const;
export type EvidenceKind = (typeof EVIDENCE_KINDS)[number];

export interface EvidenceReference {
  kind: EvidenceKind;
  reference: string;
  note?: string;
  recordedAt: IsoDateTime;
  recordedBy: Actor;
}

export interface RestrictionScope {
  type: 'TOWN' | 'PLATFORM';
  townId?: string;
}

export const RESTRICTION_STATUSES = ['ACTIVE', 'EXPIRED', 'REVOKED'] as const;
export type RestrictionStatus = (typeof RESTRICTION_STATUSES)[number];

export interface WireRestriction extends WireDocument, WireVersioned {
  customerId: string;
  subjectKey: string;
  scopeKey: string;
  scope: RestrictionScope;
  status: RestrictionStatus;
  reasonCode: RestrictionReason;
  explanation: string;
  evidence: EvidenceReference[];
  relatedBookingIds: string[];
  effectiveFrom: IsoDateTime;
  reviewAt?: IsoDateTime;
  expiresAt?: IsoDateTime;
  createdBy: Actor;
  revokedAt?: IsoDateTime;
  revokedBy?: Actor;
  revocationReason?: string;
  expiredAt?: IsoDateTime;
}

export const FRAUD_REPORT_STATUSES = [
  'OPEN',
  'UNDER_REVIEW',
  'DISMISSED',
  'RESTRICTION_APPLIED',
] as const;
export type FraudReportStatus = (typeof FRAUD_REPORT_STATUSES)[number];

export interface WireFraudReport extends WireDocument, WireVersioned {
  bookingId?: string;
  customerId: string;
  subjectKey: string;
  reportedBy: Actor;
  reasonCode: RestrictionReason;
  allegation: string;
  evidence: EvidenceReference[];
  status: FraudReportStatus;
  reviewOutcome?: string;
  reviewedBy?: Actor;
  reviewedAt?: IsoDateTime;
  linkedRestrictionId?: string;
}

/** `GET /admin/restrictions/:id` returns the record plus the customer's reports. */
export interface WireRestrictionDetail {
  restriction: WireRestriction;
  fraudReports: WireFraudReport[];
}
