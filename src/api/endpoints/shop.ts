import { baseApi } from '@/api/baseApi';
import { clearShopCsrfToken, setShopCsrfToken } from '@/api/csrf';
import { queryParams } from '@/api/adapters';
import type {
  CreateItemBody,
  CreateShopBody,
  ShopCommandArgs,
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
import type {
  OtpRequestBody,
  OtpResendBody,
  OtpVerifyBody,
  WireCsrf,
  WireOtpChallenge,
  WireOtpVerified,
} from '@/api/dto/session';
import { allOf, entityTag, listTag } from '@/api/tags';
import { newIdempotencyKey } from '@/lib/idempotency';

const commandHeaders = (key?: string): Record<string, string> => ({
  'Idempotency-Key': key ?? newIdempotencyKey(),
});

function pageParams(limit = 25, skip = 0) {
  return queryParams({ limit, skip });
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
          // The login form presents the connection error.
        }
      },
    }),

    requestShopOtp: build.mutation<WireOtpChallenge, OtpRequestBody>({
      query: (body) => ({ url: '/shop/auth/otp/request', method: 'POST', body }),
    }),
    resendShopOtp: build.mutation<WireOtpChallenge, OtpResendBody>({
      query: (body) => ({ url: '/shop/auth/otp/resend', method: 'POST', body }),
    }),
    verifyShopOtp: build.mutation<WireOtpVerified, OtpVerifyBody>({
      query: (body) => ({ url: '/shop/auth/otp/verify', method: 'POST', body }),
      async onQueryStarted(_arg, { queryFulfilled }) {
        try {
          const { data } = await queryFulfilled;
          setShopCsrfToken(data.csrfToken);
        } catch {
          // Keep the pre-login token so an invalid code can be retried.
        }
      },
      invalidatesTags: ['Shop'],
    }),
    getShopMe: build.query<WireShopMe, void>({
      query: () => ({ url: '/shop/me' }),
      providesTags: ['Shop'],
    }),
    shopActivity: build.mutation<WireShopMe['session'], void>({
      query: () => ({ url: '/shop/auth/session/activity', method: 'POST' }),
    }),
    shopLogout: build.mutation<void, void>({
      query: () => ({ url: '/shop/auth/logout', method: 'POST' }),
      async onQueryStarted(_arg, { queryFulfilled }) {
        try {
          await queryFulfilled;
        } finally {
          clearShopCsrfToken();
        }
      },
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
      invalidatesTags: (_result, _error, args) => [listTag('ShopItem', args.shopId)],
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
        ...(args.itemId ? [entityTag('ShopItem', args.itemId)] : []),
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
      providesTags: (_result, _error, shopId) => [entityTag('Shop', shopId)],
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
      invalidatesTags: (_result, _error, args) => [entityTag('Shop', args.shopId)],
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
  useRequestShopOtpMutation,
  useResendShopOtpMutation,
  useVerifyShopOtpMutation,
  useGetShopMeQuery,
  useShopActivityMutation,
  useShopLogoutMutation,
  useListShopsQuery,
  useGetShopQuery,
  useCreateShopMutation,
  useUpdateShopMutation,
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
  useReviewAdminShopMutation,
  useProposeAdminTermsMutation,
  useListAdminClaimsQuery,
  useReviewAdminClaimMutation,
  useRevokeShopMembershipMutation,
  useCreatePackingProfileMutation,
} = shopApi;
