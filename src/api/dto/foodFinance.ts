import type { Actor, IsoDateTime, WireDocument, WireVersioned } from '@/api/dto/common';
import type { WireCashEntry } from '@/api/dto/finance';
import type { SettlementFrequency, ShopSchedule, WireCommissionPolicy } from '@/api/dto/shop';

/** Wire contract pinned to deliveryBooking PR #50, 40c9923. Money is signed USD cents. */
export interface CursorPage<T> {
  items: T[];
  nextCursor: string | null;
}
export interface CursorQuery {
  cursor?: string;
  limit?: number;
}
/** Identity stays in query keys, never in the owner API request's authorization payload. */
export interface OwnerFoodScope {
  ownerId: string;
  shopId: string;
}
export interface StaffFoodScope {
  scopeKey?: string;
}
export type FoodFinanceActor = Omit<Actor, 'type'> & {
  type: Actor['type'] | 'SHOP' | 'SHOP_OWNER';
};
export const SHOP_PAYOUT_METHODS = ['CASH', 'BANK_TRANSFER', 'ECOCASH'] as const;
export type ShopPayoutMethod = (typeof SHOP_PAYOUT_METHODS)[number];
export type ShopEligibilityPolicy = 'ON_SCHEDULE' | 'AFTER_REMITTANCE';
export const FOOD_SETTLEMENT_STATUSES = ['DRAFT', 'APPROVED', 'PAID', 'VOID'] as const;
export type FoodSettlementStatus = (typeof FOOD_SETTLEMENT_STATUSES)[number];

export interface FoodSettlementAgreement extends WireDocument, WireVersioned {
  shopId: string;
  townId: string;
  enabled: boolean;
  frequency: SettlementFrequency;
  timezone: 'Africa/Harare';
  cutoffTime: '00:00';
  weeklyAnchor?: number;
  payoutLagDays: number;
  payoutWeekday?: number;
  payoutDay?: number;
  eligibilityPolicy: ShopEligibilityPolicy;
  effectiveFrom: IsoDateTime;
  recordedBy: FoodFinanceActor;
}
/** Ordinary responses mask accountIdentifier. Privileged reveal is a separate audited command. */
export interface PayoutDestination extends WireDocument, WireVersioned {
  shopId: string;
  townId: string;
  method: ShopPayoutMethod;
  accountName: string;
  accountIdentifier: string;
  provider?: string;
  reason: string;
  recordedBy: FoodFinanceActor;
}
export type FoodLedgerEligibility =
  'PAYABLE' | 'HELD' | 'RESERVED' | 'PAID' | 'VOID' | 'PENDING' | 'UNKNOWN';
export interface FoodLedgerEntry extends WireDocument, WireVersioned {
  shopId: string;
  townId: string;
  entryType: 'EARNING' | 'COMMISSION' | 'ADJUSTMENT' | 'PAYOUT' | 'PROVISIONAL_CREDIT';
  amountCents: number;
  currency: 'USD';
  sourceKey: string;
  operationKey?: string;
  orderId?: string;
  paymentId?: string;
  provisionalCreditStatus?: 'PENDING' | 'HELD' | 'ELIGIBLE' | 'REVERSED';
  payableId?: string;
  payoutId?: string;
  settlementId?: string;
  settledAt?: IsoDateTime;
  occurredAt: IsoDateTime;
  effectiveAt?: IsoDateTime;
  recordedBy: FoodFinanceActor;
  reason?: string;
  correctsEntryId?: string;
  commissionPolicySnapshot?: WireCommissionPolicy;
  eligibilityAtPosting?: FoodLedgerEligibility;
  holdReasonAtPosting?: string;
  eligibility?: FoodLedgerEligibility;
  holdReason?: string;
}
export interface FoodFailureReview {
  decision: 'HOLD' | 'COMPENSATE_SHOP' | 'NO_SHOP_LIABILITY';
  reason: string;
  by: FoodFinanceActor;
  at: IsoDateTime;
  amountCents?: number;
  adjustmentId?: string;
}
export interface FoodFailureException {
  orderId: string;
  bookingId: string;
  shopId: string;
  reference: string;
  foodSubtotalCents: number;
  shopNetCents: number;
  outcome: string;
  reason: string;
  review?: FoodFailureReview;
  version: number;
}
export interface FoodFinanceException {
  payableId: string;
  orderId: string;
  reason: string;
  amountCents: number;
}
export interface ShopFinanceBalance {
  shopId: string;
  townId: string;
  currency: 'USD';
  grossCents: number;
  commissionCents: number;
  adjustmentCents: number;
  earnedCents: number;
  paidCents: number;
  balanceCents: number;
  availableCents: number;
  reservedCents: number;
  heldCents: number;
  carryForwardCents: number;
  pendingCents: number;
  /** Verified online net food awaiting fulfillment; separate from pending schedule. */
  provisionalPendingCents?: number;
  paidOnlineLiabilityCents?: number;
  paymentExceptions?: Array<{
    orderId: string;
    paymentId: string;
    amountCents: number;
    reason: string;
    alreadyPaid: boolean;
  }>;
  disputedCents: number;
  failureExceptions: FoodFailureException[];
  nextPayoutAt: IsoDateTime | null;
  exceptions: FoodFinanceException[];
}
export interface FoodEarningsResult extends CursorPage<FoodLedgerEntry> {
  balance: ShopFinanceBalance;
  agreement: FoodSettlementAgreement | null;
  shopVersion: number;
  serverNow: IsoDateTime;
}
export interface FoodSettlementLine {
  sourceId: string;
  orderId?: string;
  orderReference?: string;
  payableId?: string;
  entryIds: string[];
  occurredAt: IsoDateTime;
  foodSubtotalCents: number;
  commissionCents: number;
  adjustmentCents: number;
  netCents: number;
  carryForward: boolean;
  commissionPolicySnapshot?: WireCommissionPolicy;
  settlementPolicySnapshot?: ShopSchedule & {
    effectiveFrom: IsoDateTime;
    version: number;
    financeAgreementId?: string;
    payoutLagDays?: number;
    payoutWeekday?: number;
    payoutDayOfMonth?: number;
    eligibilityPolicy?: ShopEligibilityPolicy;
  };
  originalPeriodStart?: IsoDateTime;
  originalPeriodEnd?: IsoDateTime;
  originalPayoutAt?: IsoDateTime;
}
export interface FoodSettlement extends WireDocument, WireVersioned {
  shopId: string;
  townId: string;
  currency: 'USD';
  status: FoodSettlementStatus;
  from: IsoDateTime;
  to: IsoDateTime;
  activePeriodKey?: string;
  agreementSnapshot: FoodSettlementAgreement;
  destinationSnapshot: PayoutDestination;
  payoutAt: IsoDateTime;
  lines: FoodSettlementLine[];
  payableIds: string[];
  entryIds: string[];
  grossCents: number;
  commissionCents: number;
  adjustmentCents: number;
  amountCents: number;
  broughtForwardCents: number;
  heldCents: number;
  disputedCents: number;
  failureExceptions: FoodFailureException[];
  exceptions: FoodFinanceException[];
  recordedBy: FoodFinanceActor;
  approvedBy?: FoodFinanceActor;
  approvedAt?: IsoDateTime;
  voidedBy?: FoodFinanceActor;
  voidedAt?: IsoDateTime;
  voidReason?: string;
  payment?: {
    payoutId: string;
    amountCents: number;
    method: ShopPayoutMethod;
    paidAt: IsoDateTime;
    reference: string;
    destinationId: string;
    destinationVersion: number;
    recordedBy: FoodFinanceActor;
  };
}
export interface FoodSettlementQuery extends CursorQuery {
  status?: FoodSettlementStatus;
  periodStart?: IsoDateTime;
  periodEnd?: IsoDateTime;
}
export interface FoodFinancialCommand {
  idempotencyKey: string;
  expectedVersion: number;
}
export interface PayoutDetailsResult {
  payoutDetails: PayoutDestination | null;
  shopVersion: number;
}
export interface PayoutDetailsBody extends FoodFinancialCommand {
  method: ShopPayoutMethod;
  accountName: string;
  accountIdentifier: string;
  provider?: string;
  reason: string;
}
export interface FoodStatementCommand extends StaffFoodScope, FoodFinancialCommand {
  id: string;
}
export interface FoodSettlementPaidBody extends FoodStatementCommand {
  amountCents: number;
  method: ShopPayoutMethod;
  paidAt: IsoDateTime;
  reference: string;
  destinationId: string;
  destinationVersion: number;
}
export interface FinanceCsvPage {
  csv: string;
  nextCursor: string | null;
}

export const CASH_DISCREPANCY_RESOLUTIONS = [
  'CASH_RECEIVED',
  'CASH_RETURNED',
  'CORRECT_RECORD',
  'WRITE_OFF',
  'ACCEPT_OVERAGE',
] as const;
export type CashDiscrepancyResolution = (typeof CASH_DISCREPANCY_RESOLUTIONS)[number];
export interface CashHandInAmounts {
  expectedCents: number;
  receivedCents: number;
  /** Actual minus expected: a shortage is negative. */
  differenceCents: number;
}
export interface CashDiscrepancyDetails extends CashHandInAmounts {
  handInId: string;
  status: 'OPEN' | 'RESOLVED';
  currentReceivedCents: number;
  outstandingCents: number;
  overageCents: number;
  reason: string;
  evidence?: string;
  resolution?: {
    kind: CashDiscrepancyResolution;
    reason: string;
    evidence?: string;
    actor: FoodFinanceActor;
    resolvedAt: IsoDateTime;
    correctionEntryId: string;
  };
}
export interface CashCorrectionDetails {
  discrepancyId: string;
  handInId: string;
  kind: CashDiscrepancyResolution;
  adjustmentCents: number;
  previousReceivedCents: number;
  resultingReceivedCents: number;
  previousDifferenceCents: number;
  resultingDifferenceCents: number;
  reason: string;
  evidence?: string;
}
export interface FoodCashEntry extends WireCashEntry {
  operationKey?: string;
  handInId?: string;
  handIn?: CashHandInAmounts;
  discrepancy?: CashDiscrepancyDetails;
  correction?: CashCorrectionDetails;
  foodOrderIds?: string[];
}
export interface DriverCashBalance extends CashHandInAmounts {
  driverId: string;
  townId: string;
  unremittedCollectionCents: number;
  unresolvedShortfallCents: number;
  outstandingCents: number;
  overageCents: number;
  entries: FoodCashEntry[];
  discrepancies: FoodCashEntry[];
}
export interface RiderCashOutstanding extends CashHandInAmounts {
  outstandingCents: number;
  overageCents: number;
  drivers: DriverCashBalance[];
}
export interface RiderCashHandInBody extends StaffFoodScope {
  driverId: string;
  ledgerEntryIds: string[];
  amountReceivedCents: number;
  collectionVersions: Record<string, number>;
  receiptReference: string;
  reason?: string;
  evidence?: string;
  idempotencyKey: string;
}
export interface CashDiscrepancyResolutionBody extends FoodStatementCommand {
  resolution: CashDiscrepancyResolution;
  amountCents?: number;
  reason: string;
  evidence?: string;
}
