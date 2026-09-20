import { clampPageQuery, queryParams, toEntities, toEntity, toEntityPage } from '@/api/adapters';
import { baseApi } from '@/api/baseApi';
import type { Page, PageQuery, WireList } from '@/api/dto/common';
import type {
  CashState,
  PaymentAttemptStatus,
  RefundSettlementStatus,
  RefundStatus,
  WireCashEntry,
  WireCashReceiptResult,
  WirePaymentAttempt,
  WireReconcileResult,
  WireRefund,
} from '@/api/dto/finance';
import { allOf, entityTag, listTag } from '@/api/tags';
import type { CashEntry, PaymentAttempt, Refund } from '@/api/types';

/**
 * Finance endpoints (specification section 4.6).
 *
 * Reconciliation asks the server to verify with the provider; there is no force-paid
 * control, and no refund or cash entry is ever completed optimistically.
 */
export interface PaymentListArgs extends PageQuery {
  townId?: string | null;
  bookingId?: string | null;
  status?: PaymentAttemptStatus | null;
}

export interface CashLedgerArgs extends PageQuery {
  bookingId?: string | null;
  driverId?: string | null;
  state?: CashState | null;
}

export interface RefundListArgs extends PageQuery {
  bookingId?: string | null;
  status?: RefundStatus | null;
}

export const financeApi = baseApi.injectEndpoints({
  endpoints: (build) => ({
    listPayments: build.query<Page<PaymentAttempt>, PaymentListArgs>({
      query: (args) => {
        const page = clampPageQuery(args);
        return {
          url: '/admin/payments',
          params: queryParams({
            townId: args.townId ?? undefined,
            bookingId: args.bookingId ?? undefined,
            status: args.status ?? undefined,
            ...page,
          }),
        };
      },
      transformResponse: (response: WireList<WirePaymentAttempt>, _meta, args) =>
        toEntityPage(response, clampPageQuery(args)),
      providesTags: (result, _error, args) => [
        listTag('Payment', args.townId, args.bookingId, args.status),
        allOf('Payment'),
        ...(result?.items ?? []).map((payment) => entityTag('Payment', payment.id)),
      ],
    }),

    /** Server-side provider verification. An unknown outcome is not a new payment. */
    reconcilePayment: build.mutation<
      WireReconcileResult,
      { id: string; bookingId?: string; idempotencyKey: string }
    >({
      query: ({ id, idempotencyKey }) => ({
        url: `/admin/payments/${id}/reconcile`,
        method: 'POST',
        headers: { 'Idempotency-Key': idempotencyKey },
      }),
      invalidatesTags: (_result, _error, args) => [
        entityTag('Payment', args.id),
        allOf('Payment'),
        ...(args.bookingId ? [entityTag('Booking', args.bookingId)] : []),
        'Alerts',
        'Overview',
      ],
    }),

    listCashLedger: build.query<Page<CashEntry>, CashLedgerArgs>({
      query: (args) => {
        const page = clampPageQuery(args);
        return {
          url: '/admin/cash-ledger',
          params: queryParams({
            bookingId: args.bookingId ?? undefined,
            driverId: args.driverId ?? undefined,
            state: args.state ?? undefined,
            ...page,
          }),
        };
      },
      transformResponse: (response: WireList<WireCashEntry>, _meta, args) =>
        toEntityPage(response, clampPageQuery(args)),
      providesTags: (result, _error, args) => [
        listTag('CashEntry', args.bookingId, args.driverId, args.state),
        allOf('CashEntry'),
        ...(result?.items ?? []).map((entry) => entityTag('CashEntry', entry.id)),
      ],
    }),

    /** Collection is an operator action tied to a booking. */
    recordCashReceipt: build.mutation<
      { entry: CashEntry; shortfallCents: number },
      {
        bookingId: string;
        amountReceivedCents: number;
        changeGivenCents?: number;
        driverId: string;
        handoverContact?: {
          name: string;
          phone: string;
          relationship: 'SENDER' | 'RECIPIENT' | 'OTHER';
        };
        evidence?: string;
        idempotencyKey: string;
      }
    >({
      query: ({ bookingId, idempotencyKey, ...body }) => ({
        url: `/admin/bookings/${bookingId}/cash-receipts`,
        method: 'POST',
        body,
        headers: { 'Idempotency-Key': idempotencyKey },
      }),
      transformResponse: (response: WireCashReceiptResult) => ({
        entry: toEntity(response.entry),
        shortfallCents: response.shortfallCents,
      }),
      invalidatesTags: (_result, _error, args) => [
        entityTag('Booking', args.bookingId),
        allOf('CashEntry'),
        allOf('Booking'),
        'Overview',
      ],
    }),

    /** Finance records remittance against ledger references. */
    recordCashRemittance: build.mutation<
      CashEntry,
      {
        driverId: string;
        ledgerEntryIds: string[];
        amountCents: number;
        receiptReference: string;
        notes?: string;
        idempotencyKey: string;
      }
    >({
      query: ({ driverId, idempotencyKey, ...body }) => ({
        url: `/admin/drivers/${driverId}/cash-remittances`,
        method: 'POST',
        body,
        headers: { 'Idempotency-Key': idempotencyKey },
      }),
      transformResponse: (response: { entry: WireCashEntry }) => toEntity(response.entry),
      invalidatesTags: (_result, _error, args) => [
        allOf('CashEntry'),
        entityTag('Driver', args.driverId),
        'Overview',
      ],
    }),

    listRefunds: build.query<Page<Refund>, RefundListArgs>({
      query: (args) => {
        const page = clampPageQuery(args);
        return {
          url: '/admin/refunds',
          params: queryParams({
            bookingId: args.bookingId ?? undefined,
            status: args.status ?? undefined,
            ...page,
          }),
        };
      },
      transformResponse: (response: WireList<WireRefund>, _meta, args) =>
        toEntityPage(response, clampPageQuery(args)),
      providesTags: (result, _error, args) => [
        listTag('Refund', args.bookingId, args.status),
        allOf('Refund'),
        ...(result?.items ?? []).map((refund) => entityTag('Refund', refund.id)),
      ],
    }),

    requestRefund: build.mutation<
      Refund,
      {
        bookingId: string;
        amountCents: number;
        reason: string;
        paymentAttemptId?: string;
        idempotencyKey: string;
      }
    >({
      query: ({ idempotencyKey, ...body }) => ({
        url: '/admin/refunds',
        method: 'POST',
        body,
        headers: { 'Idempotency-Key': idempotencyKey },
      }),
      transformResponse: (response: { refund: WireRefund }) => toEntity(response.refund),
      invalidatesTags: (_result, _error, args) => [
        allOf('Refund'),
        entityTag('Booking', args.bookingId),
        'Overview',
      ],
    }),

    approveRefund: build.mutation<
      Refund,
      { id: string; reason: string; expectedVersion?: number; idempotencyKey: string }
    >({
      query: ({ id, idempotencyKey, ...body }) => ({
        url: `/admin/refunds/${id}/approve`,
        method: 'POST',
        body,
        headers: { 'Idempotency-Key': idempotencyKey },
      }),
      transformResponse: (response: { refund: WireRefund }) => toEntity(response.refund),
      invalidatesTags: (_result, _error, args) => [entityTag('Refund', args.id), allOf('Refund')],
    }),

    settleRefund: build.mutation<
      Refund,
      {
        id: string;
        status: RefundSettlementStatus;
        providerReference?: string;
        failureReason?: string;
        expectedVersion?: number;
        idempotencyKey: string;
      }
    >({
      query: ({ id, idempotencyKey, ...body }) => ({
        url: `/admin/refunds/${id}/settle`,
        method: 'POST',
        body,
        headers: { 'Idempotency-Key': idempotencyKey },
      }),
      transformResponse: (response: { refund: WireRefund }) => toEntity(response.refund),
      invalidatesTags: (_result, _error, args) => [
        entityTag('Refund', args.id),
        allOf('Refund'),
        allOf('Payment'),
        'Overview',
      ],
    }),
  }),
});

/** Cash entries for one driver, used by the remittance form. */
export function collectedEntries(entries: CashEntry[]): CashEntry[] {
  return entries.filter((entry) => entry.state === 'COLLECTED_BY_DRIVER');
}

export const unwrapCashEntries = (response: WireList<WireCashEntry>): CashEntry[] =>
  toEntities(response.items ?? []);

export const {
  useListPaymentsQuery,
  useReconcilePaymentMutation,
  useListCashLedgerQuery,
  useRecordCashReceiptMutation,
  useRecordCashRemittanceMutation,
  useListRefundsQuery,
  useRequestRefundMutation,
  useApproveRefundMutation,
  useSettleRefundMutation,
} = financeApi;
