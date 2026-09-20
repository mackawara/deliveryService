import { createApi } from '@reduxjs/toolkit/query/react';

import { appBaseQuery } from '@/api/baseQuery';
import { TAG_TYPES } from '@/api/tags';

/**
 * The single delivery-service API (specification section 6).
 *
 * Feature modules attach their endpoints with `injectEndpoints`, so every screen shares
 * one cache, one base query and one set of tags. Components never call fetch or Axios.
 */
export const baseApi = createApi({
  reducerPath: 'deliveryApi',
  baseQuery: appBaseQuery,
  tagTypes: TAG_TYPES,
  // Server data stays in the query cache; nothing is persisted between reloads.
  keepUnusedDataFor: 60,
  refetchOnReconnect: true,
  refetchOnFocus: true,
  endpoints: () => ({}),
});
