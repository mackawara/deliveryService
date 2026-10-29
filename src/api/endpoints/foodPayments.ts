import { baseApi } from '@/api/baseApi';
import type { ShopPaymentSettings, UpdateShopPaymentSettings } from '@/api/dto/foodPayments';

const settingsTag = (shopId: string) => ({ type: 'Shop' as const, id: `payments:${shopId}` });
const unwrap = (response: { paymentSettings: ShopPaymentSettings }) => response.paymentSettings;
const newest = (current: ShopPaymentSettings, incoming: ShopPaymentSettings) =>
  incoming.version >= current.version ? incoming : current;

/** Actor/branch scope is part of every cache key; authorization comes from the session cookie. */
export const foodPaymentsApi = baseApi.injectEndpoints({
  endpoints: (build) => ({
    getAdminShopPaymentSettings: build.query<
      ShopPaymentSettings,
      { shopId: string; scopeKey: string }
    >({
      query: ({ shopId }) => ({
        url: `/admin/food/shops/${encodeURIComponent(shopId)}/payment-settings`,
        headers: { 'Cache-Control': 'no-store' },
      }),
      transformResponse: unwrap,
      keepUnusedDataFor: 0,
      providesTags: (_result, _error, { shopId }) => [settingsTag(shopId)],
      merge: newest,
    }),
    getOwnerShopPaymentSettings: build.query<
      ShopPaymentSettings,
      { shopId: string; scopeKey: string }
    >({
      query: ({ shopId }) => ({
        url: `/shop/shops/${encodeURIComponent(shopId)}/payment-settings`,
        headers: { 'Cache-Control': 'no-store' },
      }),
      transformResponse: unwrap,
      keepUnusedDataFor: 0,
      providesTags: (_result, _error, { shopId }) => [settingsTag(shopId)],
      merge: newest,
    }),
    updateShopPaymentSettings: build.mutation<ShopPaymentSettings, UpdateShopPaymentSettings>({
      query: ({ shopId, scopeKey: _scopeKey, idempotencyKey, ...body }) => ({
        url: `/admin/food/shops/${encodeURIComponent(shopId)}/payment-settings`,
        method: 'PATCH',
        body,
        headers: { 'Idempotency-Key': idempotencyKey },
      }),
      transformResponse: unwrap,
      // Even an uncertain response must trigger a fresh read; never assume an edit failed.
      invalidatesTags: (_result, _error, { shopId }) => [settingsTag(shopId)],
    }),
  }),
});

export const {
  useGetAdminShopPaymentSettingsQuery,
  useGetOwnerShopPaymentSettingsQuery,
  useUpdateShopPaymentSettingsMutation,
} = foodPaymentsApi;
