import { fetchBaseQuery, type BaseQueryFn, type FetchArgs } from '@reduxjs/toolkit/query/react';

import { getCsrfToken } from '@/api/csrf';
import { normalizeApiError, type NormalizedApiError } from '@/api/errors';
import { appConfig } from '@/config';

/** Endpoints that own their own 401 presentation and must not trigger a session transition. */
const AUTH_ENDPOINTS = new Set([
  'getCsrf',
  'requestOtp',
  'resendOtp',
  'verifyOtp',
  'logout',
  'getMe',
]);

const rawBaseQuery = fetchBaseQuery({
  baseUrl: appConfig.apiBaseUrl,
  // The browser sends the HttpOnly session cookie; no bearer token or staff API key
  // is ever stored in Redux or browser storage (specification section 5.3).
  credentials: 'include',
  timeout: 30_000,
  prepareHeaders: (headers, api) => {
    if (api.type === 'mutation') {
      const token = getCsrfToken();
      if (token) headers.set('X-CSRF-Token', token);
    }
    if (!headers.has('Accept')) headers.set('Accept', 'application/json');
    return headers;
  },
});

/**
 * Signalled when a protected request is rejected as unauthenticated. The session slice
 * turns concurrent failures into a single login transition (specification section 6).
 */
export type SessionExpiryListener = () => void;

let onSessionExpired: SessionExpiryListener = () => {};

export function setSessionExpiryListener(listener: SessionExpiryListener): void {
  onSessionExpired = listener;
}

/**
 * Application base query: normalizes every failure, keeps cookies on the request and
 * reports session expiry once for concurrent 401s.
 */
export const appBaseQuery: BaseQueryFn<string | FetchArgs, unknown, NormalizedApiError> = async (
  args,
  api,
  extraOptions,
) => {
  const result = await rawBaseQuery(args, api, extraOptions);

  if (result.error) {
    const normalized = normalizeApiError(result.error, result.meta);
    if (normalized.kind === 'unauthenticated' && !AUTH_ENDPOINTS.has(api.endpoint)) {
      onSessionExpired();
    }
    return { error: normalized, meta: result.meta };
  }

  return { data: result.data, meta: result.meta };
};
