import type { Actor, IsoDateTime, WireDocument, WireVersioned } from '@/api/dto/common';
import type { PaymentMethod } from '@/api/dto/booking';

export const PAYMENT_ATTEMPT_STATUSES = [
  'CREATED',
  'SUBMITTED',
  'PENDING',
  'PAID',
  'FAILED',
  'CANCELLED',
  'UNKNOWN',
] as const;
export type PaymentAttemptStatus = (typeof PAYMENT_ATTEMPT_STATUSES)[number];

export interface WirePaymentAttempt extends WireDocument, WireVersioned {
  bookingId: string;
  townId: string;
  customerId: string;
  amountCents: number;
  currency: 'USD';
  method: PaymentMethod;
  provider: 'NONE' | 'PAYNOW';
  reference: string;
  providerReference?: string;
  instrument?: string;
  walletNumberMasked?: string;
  status: PaymentAttemptStatus;
  lastProviderStatus?: string;
  statusHistory: Array<{
    status: PaymentAttemptStatus;
    providerStatus?: string;
    at: IsoDateTime;
    source: string;
  }>;
  pollAttempts: number;
  nextPollAt?: IsoDateTime;
  submittedAt?: IsoDateTime;
  resolvedAt?: IsoDateTime;
  /** Set when a verified success arrived after cancellation or restriction. */
  financeExceptionReason?: string;
  appliedToBooking: boolean;
}

/** `POST /admin/payments/:id/reconcile` asks the server to verify with the provider. */
export interface WireReconcileResult {
  applied: boolean;
  reason?: string;
  status: string;
}

export const CASH_STATES = [
  'DUE',
  'COLLECTED_BY_DRIVER',
  'REMITTED',
  'RECONCILED',
  'DISCREPANCY',
] as const;
export type CashState = (typeof CASH_STATES)[number];

export type CashEntryType =
  'DUE' | 'COLLECTION' | 'REMITTANCE' | 'RECONCILIATION' | 'DISCREPANCY' | 'CORRECTION' | 'REFUND';

export interface WireCashEntry extends WireDocument, WireVersioned {
  bookingId: string;
  townId: string;
  driverId?: string;
  entryType: CashEntryType;
  state: CashState;
  amountDueCents: number;
  amountReceivedCents?: number;
  changeGivenCents?: number;
  payerRole: 'SENDER';
  handoverContact?: { name: string; phone: string; relationship: 'SENDER' | 'RECIPIENT' | 'OTHER' };
  receiptReference?: string;
  recordedBy: Actor;
  occurredAt: IsoDateTime;
  remittanceReference?: string;
  reconciliationReference?: string;
  notes?: string;
  linkedEntryIds: string[];
}

export interface WireCashReceiptResult {
  entry: WireCashEntry;
  /** Positive when the driver received less than the amount due. */
  shortfallCents: number;
}

export const REFUND_STATUSES = [
  'REQUESTED',
  'APPROVED',
  'PROCESSING',
  'COMPLETED',
  'FAILED',
  'REJECTED',
] as const;
export type RefundStatus = (typeof REFUND_STATUSES)[number];

/** Stages finance may settle a refund into. */
export const REFUND_SETTLEMENT_STATUSES = [
  'PROCESSING',
  'COMPLETED',
  'FAILED',
  'REJECTED',
] as const;
export type RefundSettlementStatus = (typeof REFUND_SETTLEMENT_STATUSES)[number];

export interface WireRefund extends WireDocument, WireVersioned {
  bookingId: string;
  townId: string;
  paymentAttemptId?: string;
  amountCents: number;
  currency: 'USD';
  reason: string;
  status: RefundStatus;
  requestedBy: Actor;
  approvedBy?: Actor;
  approvedAt?: IsoDateTime;
  completedAt?: IsoDateTime;
  failureReason?: string;
  manualWorkflowRequired: boolean;
  providerReference?: string;
}
