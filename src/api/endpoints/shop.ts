import { baseApi } from '@/api/baseApi';
import { setShopCsrfToken } from '@/api/csrf';
import { queryParams } from '@/api/adapters';
import type {
  CreateItemBody,
  CreateShopBody,
  CreateSimpleShopBody,
  PickupBody,
  WireCurrentShopTerms,
  WireDeliverySize,
  WireFoodTownSettings,
  WireShopOverview,
  ShopCommandArgs,
  ShopTownChoice,
  ShopPage,
  UpdateItemBody,
  UpdateShopBody,
  WireClaim,
  WireFoodItem,
  WireMembership,
  WirePackingProfile,
  WireShop,
  WireShopDetail,
  WireShopMe,
  WireSettlementPolicy,
  WireTermsRequest,
} from '@/api/dto/shop';
import type { WireCsrf, WireOtpChallenge } from '@/api/dto/session';
import { allOf, entityTag, listTag } from '@/api/tags';
import { newIdempotencyKey } from '@/lib/idempotency';

const commandHeaders = (key?: string): Record<string, string> => ({
  'Idempotency-Key': key ?? newIdempotencyKey(),
});

function pageParams(limit = 25, skip = 0) {
  return queryParams({ limit, skip });
}

/** Readiness and suggestions change whenever the shop, its pin or its items change. */
const readinessTag = (shopId: string) => listTag('ShopReadiness', shopId);

/** An API without the issue 34 lists still renders: missing lists read as empty. */
function overview(response: Partial<WireShopOverview> & { shop: WireShop }): WireShopOverview {
  return {
    shop: response.shop,
    readiness: response.readiness ?? [],
    suggestions: response.suggestions ?? [],
  };
}

export const shopApi = baseApi.injectEndpoints({
  endpoints: (build) => ({
    getShopCsrf: build.query<WireCsrf, void>({
      query: () => ({ url: '/shop/auth/csrf', headers: { 'Cache-Control': 'no-store' } }),
      async onQueryStarted(_arg, { queryFulfilled }) {
        try {
          const { data } = await queryFulfilled;
          setShopCsrfToken(data.csrfToken);
        } catch {
          // The next state-changing request fetches it again.
        }
      },
    }),

    getShopMe: build.query<WireShopMe, void>({
      query: () => ({ url: '/shop/me' }),
      providesTags: ['Shop'],
    }),
    shopActivity: build.mutation<WireShopMe['session'], void>({
      query: () => ({ url: '/shop/auth/session/activity', method: 'POST' }),
    }),
    listShopTowns: build.query<ShopTownChoice[], void>({
      query: () => ({ url: '/shop/towns' }),
      transformResponse: (response: { items: ShopTownChoice[] }) => response.items,
    }),
    requestShopContactOtp: build.mutation<
      WireOtpChallenge,
      { shopId: string; expectedVersion: number; consent: true } & ShopCommandArgs
    >({
      query: ({ shopId, idempotencyKey, ...body }) => ({
        url: `/shop/shops/${shopId}/contact/otp/request`,
        method: 'POST',
        body,
        headers: commandHeaders(idempotencyKey),
      }),
    }),
    verifyShopContactOtp: build.mutation<
      WireShop,
      {
        shopId: string;
        expectedVersion: number;
        challengeId: string;
        code: string;
        consent: true;
      } & ShopCommandArgs
    >({
      query: ({ shopId, idempotencyKey, ...body }) => ({
        url: `/shop/shops/${shopId}/contact/otp/verify`,
        method: 'POST',
        body,
        headers: commandHeaders(idempotencyKey),
      }),
      transformResponse: (response: { shop: WireShop }) => response.shop,
      invalidatesTags: (_result, _error, args) => [
        entityTag('Shop', args.shopId),
        listTag('Shop', 'owner'),
      ],
    }),
    listShops: build.query<ShopPage<WireShop>, { limit?: number; skip?: number }>({
      query: ({ limit, skip } = {}) => ({ url: '/shop/shops', params: pageParams(limit, skip) }),
      providesTags: (result) => [
        listTag('Shop', 'owner'),
        allOf('Shop'),
        ...(result?.items ?? []).map((shop) => entityTag('Shop', shop._id)),
      ],
    }),
    getShop: build.query<WireShop, string>({
      query: (shopId) => ({ url: `/shop/shops/${shopId}` }),
      transformResponse: (response: { shop: WireShop }) => response.shop,
      providesTags: (_result, _error, shopId) => [entityTag('Shop', shopId)],
    }),
    createShop: build.mutation<WireShop, CreateShopBody & ShopCommandArgs>({
      query: ({ idempotencyKey, ...body }) => ({
        url: '/shop/shops',
        method: 'POST',
        body,
        headers: commandHeaders(idempotencyKey),
      }),
      transformResponse: (response: { shop: WireShop }) => response.shop,
      invalidatesTags: [listTag('Shop', 'owner'), allOf('Shop')],
    }),
    updateShop: build.mutation<WireShop, { shopId: string } & UpdateShopBody & ShopCommandArgs>({
      query: ({ shopId, idempotencyKey, ...body }) => ({
        url: `/shop/shops/${shopId}`,
        method: 'PATCH',
        body,
        headers: commandHeaders(idempotencyKey),
      }),
      transformResponse: (response: { shop: WireShop }) => response.shop,
      invalidatesTags: (_result, _error, args) => [
        entityTag('Shop', args.shopId),
        listTag('Shop', 'owner'),
        readinessTag(args.shopId),
      ],
    }),

    // -- issue 34: two-input signup, terms agreement, readiness and suggestions --
    getCurrentShopTerms: build.query<WireCurrentShopTerms | null, void>({
      query: () => ({ url: '/shop/terms', headers: { 'Cache-Control': 'no-store' } }),
      transformResponse: (response: { terms: WireCurrentShopTerms | null }) =>
        response.terms ?? null,
      providesTags: [listTag('ShopTerms', 'current')],
    }),
    createSimpleShop: build.mutation<WireShop, CreateSimpleShopBody & ShopCommandArgs>({
      query: ({ idempotencyKey, ...body }) => ({
        url: '/shop/shops',
        method: 'POST',
        body,
        headers: commandHeaders(idempotencyKey),
      }),
      transformResponse: (response: { shop: WireShop }) => response.shop,
      invalidatesTags: [listTag('Shop', 'owner'), allOf('Shop')],
    }),
    getShopOverview: build.query<WireShopOverview, string>({
      query: (shopId) => ({ url: `/shop/shops/${shopId}` }),
      transformResponse: overview,
      providesTags: (_result, _error, shopId) => [entityTag('Shop', shopId), readinessTag(shopId)],
    }),
    agreeShopTerms: build.mutation<
      WireShop,
      { shopId: string; termsVersion: string; expectedVersion: number } & ShopCommandArgs
    >({
      query: ({ shopId, idempotencyKey, ...body }) => ({
        url: `/shop/shops/${shopId}/terms-agreement`,
        method: 'POST',
        body,
        headers: commandHeaders(idempotencyKey),
      }),
      transformResponse: (response: { shop: WireShop }) => response.shop,
      invalidatesTags: (_result, _error, args) => [
        entityTag('Shop', args.shopId),
        listTag('Shop', 'owner'),
        readinessTag(args.shopId),
      ],
    }),

    listShopItems: build.query<
      ShopPage<WireFoodItem>,
      { shopId: string; limit?: number; skip?: number }
    >({
      query: ({ shopId, limit, skip }) => ({
        url: `/shop/shops/${shopId}/items`,
        params: pageParams(limit, skip),
      }),
      providesTags: (result, _error, args) => [
        listTag('ShopItem', args.shopId),
        ...(result?.items ?? []).map((item) => entityTag('ShopItem', item._id)),
      ],
    }),
    createShopItem: build.mutation<
      WireFoodItem,
      { shopId: string } & CreateItemBody & ShopCommandArgs
    >({
      query: ({ shopId, idempotencyKey, ...body }) => ({
        url: `/shop/shops/${shopId}/items`,
        method: 'POST',
        body,
        headers: commandHeaders(idempotencyKey),
      }),
      transformResponse: (response: { item: WireFoodItem }) => response.item,
      invalidatesTags: (_result, _error, args) => [
        listTag('ShopItem', args.shopId),
        readinessTag(args.shopId),
      ],
    }),
    updateShopItem: build.mutation<
      WireFoodItem,
      { shopId: string; itemId: string } & UpdateItemBody & ShopCommandArgs
    >({
      query: ({ shopId, itemId, idempotencyKey, ...body }) => ({
        url: `/shop/shops/${shopId}/items/${itemId}`,
        method: 'PATCH',
        body,
        headers: commandHeaders(idempotencyKey),
      }),
      transformResponse: (response: { item: WireFoodItem }) => response.item,
      invalidatesTags: (_result, _error, args) => [
        entityTag('ShopItem', args.itemId),
        listTag('ShopItem', args.shopId),
        readinessTag(args.shopId),
      ],
    }),
    archiveShopItem: build.mutation<
      WireFoodItem,
      { shopId: string; itemId: string; expectedVersion: number } & ShopCommandArgs
    >({
      query: ({ shopId, itemId, expectedVersion, idempotencyKey }) => ({
        url: `/shop/shops/${shopId}/items/${itemId}`,
        method: 'DELETE',
        body: { expectedVersion },
        headers: commandHeaders(idempotencyKey),
      }),
      transformResponse: (response: { item: WireFoodItem }) => response.item,
      invalidatesTags: (_result, _error, args) => [
        entityTag('ShopItem', args.itemId),
        listTag('ShopItem', args.shopId),
        readinessTag(args.shopId),
      ],
    }),
    listPackingProfiles: build.query<WirePackingProfile[], string>({
      query: (shopId) => ({ url: `/shop/shops/${shopId}/packing-profiles` }),
      transformResponse: (response: { items: WirePackingProfile[] }) => response.items ?? [],
      providesTags: (_result, _error, shopId) => [listTag('PackingProfile', shopId)],
    }),
    getShopTerms: build.query<
      { terms: WireSettlementPolicy[]; requests: WireTermsRequest[] },
      string
    >({
      query: (shopId) => ({ url: `/shop/shops/${shopId}/terms` }),
      providesTags: (_result, _error, shopId) => [listTag('ShopTerms', shopId)],
    }),
    requestShopTerms: build.mutation<
      WireShop,
      {
        shopId: string;
        expectedVersion: number;
        schedule?: WireTermsRequest['schedule'];
        acknowledgeTermsId?: string;
      } & ShopCommandArgs
    >({
      query: ({ shopId, idempotencyKey, ...body }) => ({
        url: `/shop/shops/${shopId}/terms-requests`,
        method: 'POST',
        body,
        headers: commandHeaders(idempotencyKey),
      }),
      transformResponse: (response: { shop: WireShop }) => response.shop,
      invalidatesTags: (_result, _error, args) => [
        entityTag('Shop', args.shopId),
        listTag('ShopTerms', args.shopId),
      ],
    }),
    uploadShopImage: build.mutation<
      { mediaId: string; thumbnail: WireShop['thumbnail']; base64: string; version: number },
      { shopId: string; itemId?: string; expectedVersion: number; base64: string } & ShopCommandArgs
    >({
      query: ({ shopId, idempotencyKey, ...body }) => ({
        url: `/shop/shops/${shopId}/images`,
        method: 'POST',
        body,
        headers: commandHeaders(idempotencyKey),
      }),
      invalidatesTags: (_result, _error, args) => [
        entityTag('Shop', args.shopId),
        listTag('Shop', 'owner'),
        readinessTag(args.shopId),
        ...(args.itemId
          ? [entityTag('ShopItem', args.itemId), listTag('ShopItem', args.shopId)]
          : []),
      ],
    }),
    listShopClaims: build.query<ShopPage<WireClaim>, { limit?: number; skip?: number }>({
      query: ({ limit, skip } = {}) => ({ url: '/shop/claims', params: pageParams(limit, skip) }),
      providesTags: (result) => [
        listTag('ShopClaim', 'owner'),
        ...(result?.items ?? []).map((claim) => entityTag('ShopClaim', claim._id)),
      ],
    }),
    submitShopClaim: build.mutation<
      WireClaim,
      { shopId: string; evidence: string } & ShopCommandArgs
    >({
      query: ({ idempotencyKey, ...body }) => ({
        url: '/shop/claims',
        method: 'POST',
        body,
        headers: commandHeaders(idempotencyKey),
      }),
      transformResponse: (response: { claim: WireClaim }) => response.claim,
      invalidatesTags: [listTag('ShopClaim', 'owner')],
    }),

    listAdminShops: build.query<
      ShopPage<WireShop>,
      { limit?: number; skip?: number; townId?: string; approvalState?: string }
    >({
      query: ({ limit, skip, townId, approvalState } = {}) => ({
        url: '/admin/food/shops',
        params: queryParams({ ...pageParams(limit, skip), townId, approvalState }),
      }),
      providesTags: (result) => [
        listTag('Shop', 'admin'),
        ...(result?.items ?? []).map((shop) => entityTag('Shop', shop._id)),
      ],
    }),
    getAdminShop: build.query<WireShopDetail, string>({
      query: (shopId) => ({ url: `/admin/food/shops/${shopId}` }),
      providesTags: (_result, _error, shopId) => [entityTag('Shop', shopId), readinessTag(shopId)],
    }),
    listAdminShopItems: build.query<
      ShopPage<WireFoodItem>,
      { shopId: string; limit?: number; skip?: number }
    >({
      query: ({ shopId, limit, skip }) => ({
        url: `/admin/food/shops/${shopId}/items`,
        params: pageParams(limit ?? 100, skip),
      }),
      providesTags: (result, _error, args) => [
        listTag('ShopItem', 'admin', args.shopId),
        ...(result?.items ?? []).map((item) => entityTag('ShopItem', item._id)),
      ],
    }),
    setAdminShopPickup: build.mutation<
      WireShop,
      { shopId: string; expectedVersion: number; pickup: PickupBody } & ShopCommandArgs
    >({
      query: ({ shopId, idempotencyKey, ...body }) => ({
        url: `/admin/food/shops/${shopId}/pickup`,
        method: 'PUT',
        body,
        headers: commandHeaders(idempotencyKey),
      }),
      transformResponse: (response: { shop: WireShop }) => response.shop,
      invalidatesTags: (_result, _error, args) => [
        entityTag('Shop', args.shopId),
        listTag('Shop', 'admin'),
        readinessTag(args.shopId),
      ],
    }),
    setAdminItemDeliverySize: build.mutation<
      WireFoodItem,
      {
        shopId: string;
        itemId: string;
        expectedVersion: number;
        /** `null` returns the item to the standard bike-sized unit. */
        deliverySize: WireDeliverySize | null;
      } & ShopCommandArgs
    >({
      query: ({ shopId, itemId, idempotencyKey, ...body }) => ({
        url: `/admin/food/shops/${shopId}/items/${itemId}/delivery-size`,
        method: 'PUT',
        body,
        headers: commandHeaders(idempotencyKey),
      }),
      transformResponse: (response: { item: WireFoodItem }) => response.item,
      invalidatesTags: (_result, _error, args) => [
        entityTag('ShopItem', args.itemId),
        listTag('ShopItem', 'admin', args.shopId),
        listTag('ShopItem', args.shopId),
      ],
    }),
    getFoodTownSettings: build.query<WireFoodTownSettings, string>({
      query: (townId) => ({ url: `/admin/food/towns/${townId}/settings` }),
      transformResponse: (response: { settings: WireFoodTownSettings }) => response.settings,
      providesTags: (_result, _error, townId) => [entityTag('FoodTownSettings', townId)],
    }),
    updateFoodTownSettings: build.mutation<
      WireFoodTownSettings,
      { townId: string; expectedVersion: number; bigOrderItemThreshold: number } & ShopCommandArgs
    >({
      query: ({ townId, idempotencyKey, ...body }) => ({
        url: `/admin/food/towns/${townId}/settings`,
        method: 'PATCH',
        body,
        headers: commandHeaders(idempotencyKey),
      }),
      transformResponse: (response: { settings: WireFoodTownSettings }) => response.settings,
      invalidatesTags: (_result, _error, args) => [entityTag('FoodTownSettings', args.townId)],
    }),
    reviewAdminShop: build.mutation<
      WireShop,
      {
        shopId: string;
        expectedVersion: number;
        decision: 'APPROVED' | 'REJECTED' | 'SUSPENDED';
        reason: string;
        zoneCode?: string;
        estimate?: { minMinutes: number; maxMinutes: number };
      } & ShopCommandArgs
    >({
      query: ({ shopId, idempotencyKey, ...body }) => ({
        url: `/admin/food/shops/${shopId}/review`,
        method: 'POST',
        body,
        headers: commandHeaders(idempotencyKey),
      }),
      transformResponse: (response: { shop: WireShop }) => response.shop,
      invalidatesTags: (_result, _error, args) => [
        entityTag('Shop', args.shopId),
        listTag('Shop', 'admin'),
        readinessTag(args.shopId),
      ],
    }),
    proposeAdminTerms: build.mutation<
      { shop: WireShop; terms: WireSettlementPolicy },
      {
        shopId: string;
        expectedVersion: number;
        basisPoints: number;
        reference: string;
        effectiveFrom: string;
        businessConfirmed: true;
        schedule: NonNullable<WireTermsRequest['schedule']>;
      } & ShopCommandArgs
    >({
      query: ({ shopId, idempotencyKey, ...body }) => ({
        url: `/admin/food/shops/${shopId}/terms`,
        method: 'POST',
        body,
        headers: commandHeaders(idempotencyKey),
      }),
      invalidatesTags: (_result, _error, args) => [
        entityTag('Shop', args.shopId),
        listTag('ShopTerms', args.shopId),
      ],
    }),
    listAdminClaims: build.query<
      ShopPage<WireClaim>,
      { limit?: number; skip?: number; townId?: string; status?: string }
    >({
      query: ({ limit, skip, townId, status } = {}) => ({
        url: '/admin/food/claims',
        params: queryParams({ ...pageParams(limit, skip), townId, status }),
      }),
      providesTags: (result) => [
        listTag('ShopClaim', 'admin'),
        ...(result?.items ?? []).map((claim) => entityTag('ShopClaim', claim._id)),
      ],
    }),
    reviewAdminClaim: build.mutation<
      WireClaim,
      {
        claimId: string;
        expectedVersion: number;
        decision: 'APPROVED' | 'REJECTED';
        reason: string;
      } & ShopCommandArgs
    >({
      query: ({ claimId, idempotencyKey, ...body }) => ({
        url: `/admin/food/claims/${claimId}/review`,
        method: 'POST',
        body,
        headers: commandHeaders(idempotencyKey),
      }),
      transformResponse: (response: { claim: WireClaim }) => response.claim,
      invalidatesTags: (_result, _error, args) => [
        entityTag('ShopClaim', args.claimId),
        listTag('ShopClaim', 'admin'),
      ],
    }),
    revokeShopMembership: build.mutation<
      WireMembership,
      {
        shopId: string;
        membershipId: string;
        expectedVersion: number;
        reason: string;
      } & ShopCommandArgs
    >({
      query: ({ shopId, membershipId, idempotencyKey, ...body }) => ({
        url: `/admin/food/shops/${shopId}/memberships/${membershipId}/revoke`,
        method: 'POST',
        body,
        headers: commandHeaders(idempotencyKey),
      }),
      transformResponse: (response: { membership: WireMembership }) => response.membership,
      invalidatesTags: (_result, _error, args) => [
        entityTag('Shop', args.shopId),
        entityTag('ShopMembership', args.membershipId),
      ],
    }),
    createPackingProfile: build.mutation<
      WirePackingProfile,
      Record<string, unknown> & ShopCommandArgs
    >({
      query: ({ idempotencyKey, ...body }) => ({
        url: '/admin/food/packing-profiles',
        method: 'POST',
        body,
        headers: commandHeaders(idempotencyKey),
      }),
      transformResponse: (response: { profile: WirePackingProfile }) => response.profile,
      invalidatesTags: [allOf('PackingProfile')],
    }),
  }),
});

export const {
  useGetShopCsrfQuery,
  useLazyGetShopCsrfQuery,
  useGetShopMeQuery,
  useShopActivityMutation,
  useListShopTownsQuery,
  useRequestShopContactOtpMutation,
  useVerifyShopContactOtpMutation,
  useListShopsQuery,
  useGetShopQuery,
  useCreateShopMutation,
  useUpdateShopMutation,
  useGetCurrentShopTermsQuery,
  useCreateSimpleShopMutation,
  useGetShopOverviewQuery,
  useAgreeShopTermsMutation,
  useListShopItemsQuery,
  useCreateShopItemMutation,
  useUpdateShopItemMutation,
  useArchiveShopItemMutation,
  useListPackingProfilesQuery,
  useGetShopTermsQuery,
  useRequestShopTermsMutation,
  useUploadShopImageMutation,
  useListShopClaimsQuery,
  useSubmitShopClaimMutation,
  useListAdminShopsQuery,
  useGetAdminShopQuery,
  useListAdminShopItemsQuery,
  useSetAdminShopPickupMutation,
  useSetAdminItemDeliverySizeMutation,
  useGetFoodTownSettingsQuery,
  useUpdateFoodTownSettingsMutation,
  useReviewAdminShopMutation,
  useProposeAdminTermsMutation,
  useListAdminClaimsQuery,
  useReviewAdminClaimMutation,
  useRevokeShopMembershipMutation,
  useCreatePackingProfileMutation,
} = shopApi;
