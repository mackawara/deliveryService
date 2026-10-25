import { baseApi } from '@/api/baseApi';
import type {
  ShopOrder,
  ShopOrderCommand,
  ShopOrderFilter,
  ShopOrderPage,
  ShopOrderResult,
  ShopOrderScope,
} from '@/api/dto/shopOrder';

/** A delayed read or original-result replay cannot roll back a newer channel outcome. */
export function newerShopOrder(current: ShopOrder, incoming: ShopOrder): ShopOrder {
  if (incoming.version !== current.version)
    return incoming.version > current.version ? incoming : current;
  if (incoming.delivery.version < current.delivery.version) return current;
  return Date.parse(incoming.serverNow) >= Date.parse(current.serverNow) ? incoming : current;
}
const tag = (scope: ShopOrderScope) => ({
  type: 'ShopOrder' as const,
  id: `${scope.ownerId}:${scope.shopId}`,
});
export const shopOrdersApi = baseApi.injectEndpoints({
  endpoints: (build) => ({
    listShopOrders: build.query<
      ShopOrderPage,
      ShopOrderScope & { status?: ShopOrderFilter; cursor?: string; limit?: number }
    >({
      query: ({ shopId, status = 'ACTIVE', cursor, limit = 25 }) => ({
        url: '/shop/food-orders',
        params: { shopId, status, ...(cursor ? { cursor } : {}), limit },
      }),
      keepUnusedDataFor: 0,
      providesTags: (_result, _error, scope) => [tag(scope)],
      merge: (current, incoming) => {
        if (Date.parse(incoming.serverNow) < Date.parse(current.serverNow)) return current;
        const previous = new Map(current.items.map((order) => [order.id, order]));
        incoming.items = incoming.items.map((order) =>
          previous.has(order.id) ? newerShopOrder(previous.get(order.id)!, order) : order,
        );
        return incoming;
      },
    }),
    getShopOrder: build.query<ShopOrderResult, ShopOrderScope & { id: string }>({
      query: ({ id }) => ({ url: `/shop/food-orders/${encodeURIComponent(id)}` }),
      keepUnusedDataFor: 0,
      providesTags: (_result, _error, scope) => [tag(scope)],
      merge: (current, incoming) => ({
        ...incoming,
        order: newerShopOrder(current.order, incoming.order),
      }),
    }),
    commandShopOrder: build.mutation<ShopOrderResult, ShopOrderCommand>({
      query: ({ id, action, idempotencyKey, payload }) => ({
        url: `/shop/food-orders/${encodeURIComponent(id)}/${action}`,
        method: 'POST',
        body: payload,
        headers: { 'Idempotency-Key': idempotencyKey },
      }),
      // Even an ambiguous failure may have committed. Refetch rather than applying an optimistic state.
      invalidatesTags: (_result, _error, scope) => [tag(scope)],
    }),
  }),
});
export const { useListShopOrdersQuery, useGetShopOrderQuery, useCommandShopOrderMutation } =
  shopOrdersApi;
