import { clampPageQuery, queryParams, toPage } from '@/api/adapters';
import { baseApi } from '@/api/baseApi';
import type { Page, PageQuery, WireList } from '@/api/dto/common';
import type {
  WireCustomerDetail,
  WireCustomerRiskResponse,
  WireCustomerRow,
} from '@/api/dto/customer';
import { allOf, entityTag, listTag } from '@/api/tags';

/**
 * Customer search and history (specification section 4.5).
 *
 * The backend requires a phone or a town filter, and projects rows to `id` rather than
 * `_id`. A phone search stays in page state so it never appears in a shareable URL.
 */
export interface CustomerSearchArgs extends PageQuery {
  phone?: string | null;
  townId?: string | null;
}

export const customersApi = baseApi.injectEndpoints({
  endpoints: (build) => ({
    searchCustomers: build.query<Page<WireCustomerRow>, CustomerSearchArgs>({
      query: (args) => {
        const page = clampPageQuery(args);
        return {
          url: '/admin/customers',
          params: queryParams({
            phone: args.phone ?? undefined,
            townId: args.townId ?? undefined,
            ...page,
          }),
        };
      },
      transformResponse: (response: WireList<WireCustomerRow>, _meta, args) =>
        toPage(response.items ?? [], clampPageQuery(args)),
      providesTags: (result, _error, args) => [
        // The phone term is part of the cache key but never part of a URL.
        listTag('Customer', args.townId, args.phone),
        allOf('Customer'),
        ...(result?.items ?? []).map((row) => entityTag('Customer', row.id)),
      ],
    }),

    getCustomer: build.query<WireCustomerDetail, string>({
      query: (id) => ({ url: `/admin/customers/${id}` }),
      providesTags: (_result, _error, id) => [entityTag('Customer', id)],
    }),

    /** Operator evidence only; nothing here restricts a customer. */
    getCustomerRisk: build.query<
      WireCustomerRiskResponse,
      { id: string; townId?: string | null; windowDays?: number }
    >({
      query: ({ id, townId, windowDays }) => ({
        url: `/admin/customers/${id}/risk`,
        params: queryParams({ townId: townId ?? undefined, windowDays }),
      }),
      providesTags: (_result, _error, args) => [entityTag('Customer', args.id)],
    }),
  }),
});

export const { useSearchCustomersQuery, useGetCustomerQuery, useGetCustomerRiskQuery } =
  customersApi;
