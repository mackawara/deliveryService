import { baseApi } from '@/api/baseApi';
import type {
  CashDiscrepancyResolutionBody,
  CursorPage,
  CursorQuery,
  FinanceCsvPage,
  FoodCashEntry,
  FoodEarningsResult,
  FoodFinancialCommand,
  FoodSettlement,
  FoodSettlementAgreement,
  FoodSettlementPaidBody,
  FoodSettlementQuery,
  FoodStatementCommand,
  OwnerFoodScope,
  PayoutDestination,
  PayoutDetailsBody,
  PayoutDetailsResult,
  RiderCashHandInBody,
  RiderCashOutstanding,
  ShopFinanceBalance,
  StaffFoodScope,
} from '@/api/dto/foodFinance';

const encoded = encodeURIComponent;
const ownerPath = (shopId: string) => `/shop/shops/${encoded(shopId)}`;
const staffStatementPath = (id: string) => `/admin/food/settlements/${encoded(id)}`;
const ownerTag = ({ ownerId, shopId }: OwnerFoodScope) => ({
  type: 'FoodBalance' as const,
  id: `owner:${ownerId}:shop:${shopId}`,
});
const shopTag = (shopId: string) => ({ type: 'FoodBalance' as const, id: `shop:${shopId}` });
const payoutTag = (shopId: string) => ({ type: 'FoodPayout' as const, id: `shop:${shopId}` });
const statementTag = (id: string) => ({ type: 'FoodSettlement' as const, id });
const commandHeaders = (idempotencyKey: string) => ({ 'Idempotency-Key': idempotencyKey });
const pageParams = ({ cursor, limit = 25 }: CursorQuery) => ({
  limit: Math.max(1, Math.min(100, limit)),
  ...(cursor ? { cursor } : {}),
});
const settlementParams = (args: FoodSettlementQuery) => ({
  ...pageParams(args),
  ...(args.status ? { status: args.status } : {}),
  ...(args.periodStart ? { periodStart: args.periodStart } : {}),
  ...(args.periodEnd ? { periodEnd: args.periodEnd } : {}),
});
const unwrapSettlement = (response: { settlement: FoodSettlement }) => response.settlement;
const unwrapDestination = (response: { payoutDetails: PayoutDestination }) =>
  response.payoutDetails;
const newestSettlement = (current: FoodSettlement, incoming: FoodSettlement) =>
  incoming.version >= current.version ? incoming : current;
function newestPage(current: CursorPage<FoodSettlement>, incoming: CursorPage<FoodSettlement>) {
  const previous = new Map(current.items.map((statement) => [statement._id, statement]));
  return {
    ...incoming,
    items: incoming.items.map((statement) => {
      const existing = previous.get(statement._id);
      return existing ? newestSettlement(existing, statement) : statement;
    }),
  };
}
const csvResponse = async (response: Response) => (response.ok ? response.text() : response.json());

/**
 * Server-owned accounting only. Cache identity includes actor/branch scope, all financial
 * commands carry the caller's stable key, and even ambiguous failures invalidate reads.
 */
export const foodFinanceApi = baseApi.injectEndpoints({
  endpoints: (build) => ({
    getShopFoodEarnings: build.query<FoodEarningsResult, OwnerFoodScope & CursorQuery>({
      query: ({ shopId, ...args }) => ({
        url: `${ownerPath(shopId)}/earnings`,
        params: pageParams(args),
        headers: { 'Cache-Control': 'no-store' },
      }),
      keepUnusedDataFor: 0,
      providesTags: (_result, _error, scope) => [ownerTag(scope), shopTag(scope.shopId)],
      merge: (current, incoming) =>
        Date.parse(incoming.serverNow) >= Date.parse(current.serverNow) ? incoming : current,
    }),
    listShopFoodSettlements: build.query<
      CursorPage<FoodSettlement>,
      OwnerFoodScope & FoodSettlementQuery
    >({
      query: ({ shopId, ...args }) => ({
        url: `${ownerPath(shopId)}/settlements`,
        params: settlementParams(args),
        headers: { 'Cache-Control': 'no-store' },
      }),
      keepUnusedDataFor: 0,
      providesTags: (result, _error, scope) => [
        ownerTag(scope),
        shopTag(scope.shopId),
        'FoodSettlement',
        ...(result?.items.map((statement) => statementTag(statement._id)) ?? []),
      ],
      merge: newestPage,
    }),
    getShopFoodSettlement: build.query<FoodSettlement, OwnerFoodScope & { id: string }>({
      query: ({ shopId, id }) => ({
        url: `${ownerPath(shopId)}/settlements/${encoded(id)}`,
        headers: { 'Cache-Control': 'no-store' },
      }),
      transformResponse: unwrapSettlement,
      keepUnusedDataFor: 0,
      providesTags: (_result, _error, scope) => [
        ownerTag(scope),
        shopTag(scope.shopId),
        statementTag(scope.id),
      ],
      merge: newestSettlement,
    }),
    getShopPayoutDetails: build.query<PayoutDetailsResult, OwnerFoodScope>({
      query: ({ shopId }) => ({
        url: `${ownerPath(shopId)}/payout-details`,
        headers: { 'Cache-Control': 'no-store' },
      }),
      keepUnusedDataFor: 0,
      providesTags: (_result, _error, scope) => [ownerTag(scope), payoutTag(scope.shopId)],
    }),
    updateShopPayoutDetails: build.mutation<PayoutDestination, OwnerFoodScope & PayoutDetailsBody>({
      query: ({ ownerId: _ownerId, shopId, idempotencyKey, ...body }) => ({
        url: `${ownerPath(shopId)}/payout-details`,
        method: 'PUT',
        body,
        headers: commandHeaders(idempotencyKey),
      }),
      transformResponse: unwrapDestination,
      invalidatesTags: (_result, _error, scope) => [
        ownerTag(scope),
        shopTag(scope.shopId),
        payoutTag(scope.shopId),
        'Shop',
      ],
    }),
    exportShopFoodEarnings: build.query<FinanceCsvPage, OwnerFoodScope & CursorQuery>({
      query: ({ shopId, ...args }) => ({
        url: `${ownerPath(shopId)}/earnings/export`,
        params: pageParams(args),
        responseHandler: csvResponse,
        headers: { Accept: 'text/csv', 'Cache-Control': 'no-store' },
      }),
      transformResponse: (csv: string, meta) => ({
        csv,
        nextCursor: meta?.response?.headers.get('x-next-cursor') ?? null,
      }),
      keepUnusedDataFor: 0,
    }),
    exportShopFoodSettlement: build.query<FinanceCsvPage, OwnerFoodScope & { id: string }>({
      query: ({ shopId, id }) => ({
        url: `${ownerPath(shopId)}/settlements/${encoded(id)}/export`,
        responseHandler: csvResponse,
        headers: { Accept: 'text/csv', 'Cache-Control': 'no-store' },
      }),
      transformResponse: (csv: string) => ({ csv, nextCursor: null }),
      keepUnusedDataFor: 0,
    }),
    listFoodShopBalances: build.query<
      CursorPage<ShopFinanceBalance>,
      StaffFoodScope & CursorQuery & { townId?: string }
    >({
      query: ({ townId, ...args }) => ({
        url: '/admin/food/shop-balances',
        params: { ...pageParams(args), ...(townId ? { townId } : {}) },
        headers: { 'Cache-Control': 'no-store' },
      }),
      keepUnusedDataFor: 0,
      providesTags: ['FoodBalance'],
    }),
    listFoodSettlements: build.query<
      CursorPage<FoodSettlement>,
      StaffFoodScope & FoodSettlementQuery & { shopId?: string; townId?: string }
    >({
      query: ({ shopId, townId, ...args }) => ({
        url: '/admin/food/settlements',
        params: {
          ...settlementParams(args),
          ...(shopId ? { shopId } : {}),
          ...(townId ? { townId } : {}),
        },
        headers: { 'Cache-Control': 'no-store' },
      }),
      keepUnusedDataFor: 0,
      providesTags: (result) => [
        'FoodSettlement',
        ...(result?.items.map((statement) => statementTag(statement._id)) ?? []),
      ],
      merge: newestPage,
    }),
    getFoodSettlement: build.query<FoodSettlement, StaffFoodScope & { id: string }>({
      query: ({ id }) => ({
        url: staffStatementPath(id),
        headers: { 'Cache-Control': 'no-store' },
      }),
      transformResponse: unwrapSettlement,
      keepUnusedDataFor: 0,
      providesTags: (_result, _error, { id }) => [statementTag(id)],
      merge: newestSettlement,
    }),
    getFoodShopAgreement: build.query<
      { agreement: FoodSettlementAgreement | null; shopVersion: number },
      StaffFoodScope & { shopId: string }
    >({
      query: ({ shopId }) => ({
        url: `/admin/food/shops/${encoded(shopId)}/settlement-agreement`,
        headers: { 'Cache-Control': 'no-store' },
      }),
      keepUnusedDataFor: 0,
      providesTags: (_result, _error, { shopId }) => [shopTag(shopId)],
    }),
    getFoodShopPayoutDetails: build.query<PayoutDetailsResult, StaffFoodScope & { shopId: string }>(
      {
        query: ({ shopId }) => ({
          url: `/admin/food/shops/${encoded(shopId)}/payout-details`,
          headers: { 'Cache-Control': 'no-store' },
        }),
        keepUnusedDataFor: 0,
        providesTags: (_result, _error, { shopId }) => [payoutTag(shopId), shopTag(shopId)],
      },
    ),
    createFoodSettlement: build.mutation<
      FoodSettlement,
      StaffFoodScope &
        FoodFinancialCommand & {
          shopId: string;
          from: string;
          to: string;
          agreementId?: string;
        }
    >({
      query: ({ scopeKey: _scopeKey, idempotencyKey, ...body }) => ({
        url: '/admin/food/settlements',
        method: 'POST',
        body,
        headers: commandHeaders(idempotencyKey),
      }),
      transformResponse: unwrapSettlement,
      invalidatesTags: ['FoodBalance', 'FoodSettlement'],
    }),
    approveFoodSettlement: build.mutation<FoodSettlement, FoodStatementCommand>({
      query: ({ id, idempotencyKey, expectedVersion }) => ({
        url: `${staffStatementPath(id)}/approve`,
        method: 'POST',
        body: { expectedVersion },
        headers: commandHeaders(idempotencyKey),
      }),
      transformResponse: unwrapSettlement,
      invalidatesTags: ['FoodBalance', 'FoodSettlement'],
    }),
    voidFoodSettlement: build.mutation<FoodSettlement, FoodStatementCommand & { reason: string }>({
      query: ({ id, idempotencyKey, expectedVersion, reason }) => ({
        url: `${staffStatementPath(id)}/void`,
        method: 'POST',
        body: { expectedVersion, reason },
        headers: commandHeaders(idempotencyKey),
      }),
      transformResponse: unwrapSettlement,
      invalidatesTags: ['FoodBalance', 'FoodSettlement'],
    }),
    recordFoodSettlementPaid: build.mutation<FoodSettlement, FoodSettlementPaidBody>({
      query: ({ scopeKey: _scopeKey, id, idempotencyKey, ...body }) => ({
        url: `${staffStatementPath(id)}/paid`,
        method: 'POST',
        body,
        headers: commandHeaders(idempotencyKey),
      }),
      transformResponse: unwrapSettlement,
      invalidatesTags: ['FoodBalance', 'FoodSettlement', 'CashEntry', 'Overview'],
    }),
    revealFoodSettlementDestination: build.mutation<
      { destination: PayoutDestination; amountCents: number },
      FoodStatementCommand & { reason: string }
    >({
      query: ({ id, idempotencyKey, expectedVersion, reason }) => ({
        url: `${staffStatementPath(id)}/payout-destination/reveal`,
        method: 'POST',
        body: { expectedVersion, reason },
        headers: commandHeaders(idempotencyKey),
      }),
    }),
    getRiderCashOutstanding: build.query<
      RiderCashOutstanding,
      StaffFoodScope & { driverId?: string }
    >({
      query: ({ driverId }) => ({
        url: '/admin/cash-outstanding',
        params: driverId ? { driverId } : {},
        headers: { 'Cache-Control': 'no-store' },
      }),
      keepUnusedDataFor: 0,
      providesTags: ['FoodCash', 'CashEntry'],
    }),
    listCashDiscrepancies: build.query<
      { items: FoodCashEntry[] },
      StaffFoodScope & { driverId?: string; status?: 'OPEN' | 'RESOLVED'; limit?: number }
    >({
      query: ({ scopeKey: _scopeKey, limit = 100, ...params }) => ({
        url: '/admin/cash-discrepancies',
        params: { ...params, limit: Math.max(1, Math.min(100, limit)) },
        headers: { 'Cache-Control': 'no-store' },
      }),
      keepUnusedDataFor: 0,
      providesTags: ['FoodCash'],
    }),
    getCashDiscrepancy: build.query<FoodCashEntry, StaffFoodScope & { id: string }>({
      query: ({ id }) => ({
        url: `/admin/cash-discrepancies/${encoded(id)}`,
        headers: { 'Cache-Control': 'no-store' },
      }),
      transformResponse: (response: { entry: FoodCashEntry }) => response.entry,
      keepUnusedDataFor: 0,
      providesTags: ['FoodCash'],
      merge: (current, incoming) => (incoming.version >= current.version ? incoming : current),
    }),
    recordRiderCashHandIn: build.mutation<
      { entry: FoodCashEntry; discrepancy?: FoodCashEntry },
      RiderCashHandInBody
    >({
      query: ({ scopeKey: _scopeKey, driverId, idempotencyKey, ...body }) => ({
        url: `/admin/drivers/${encoded(driverId)}/cash-remittances`,
        method: 'POST',
        body,
        headers: commandHeaders(idempotencyKey),
      }),
      invalidatesTags: ['FoodCash', 'CashEntry', 'FoodBalance', 'Driver', 'Overview'],
    }),
    resolveCashDiscrepancy: build.mutation<
      { discrepancy: FoodCashEntry; correction: FoodCashEntry },
      CashDiscrepancyResolutionBody
    >({
      query: ({ scopeKey: _scopeKey, id, idempotencyKey, ...body }) => ({
        url: `/admin/cash-discrepancies/${encoded(id)}/resolve`,
        method: 'POST',
        body,
        headers: commandHeaders(idempotencyKey),
      }),
      invalidatesTags: ['FoodCash', 'CashEntry', 'FoodBalance', 'Driver', 'Overview'],
    }),
  }),
});

export const {
  useGetShopFoodEarningsQuery,
  useListShopFoodSettlementsQuery,
  useGetShopFoodSettlementQuery,
  useGetShopPayoutDetailsQuery,
  useUpdateShopPayoutDetailsMutation,
  useLazyExportShopFoodEarningsQuery,
  useLazyExportShopFoodSettlementQuery,
  useListFoodShopBalancesQuery,
  useListFoodSettlementsQuery,
  useGetFoodSettlementQuery,
  useGetFoodShopAgreementQuery,
  useGetFoodShopPayoutDetailsQuery,
  useCreateFoodSettlementMutation,
  useApproveFoodSettlementMutation,
  useVoidFoodSettlementMutation,
  useRecordFoodSettlementPaidMutation,
  useRevealFoodSettlementDestinationMutation,
  useGetRiderCashOutstandingQuery,
  useListCashDiscrepanciesQuery,
  useGetCashDiscrepancyQuery,
  useRecordRiderCashHandInMutation,
  useResolveCashDiscrepancyMutation,
} = foodFinanceApi;
