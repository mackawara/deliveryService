import { fetchBaseQuery, type BaseQueryFn, type FetchArgs } from '@reduxjs/toolkit/query/react';

import { getCsrfToken, setCsrfToken } from '@/api/csrf';
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

let csrfInFlight: Promise<void> | null = null;

/**
 * The CSRF token is fetched when the app loads. If that request failed (the API was
 * unreachable, for example) or the token was cleared, it is fetched again before the
 * next state-changing request rather than sending that request without one. Concurrent
 * callers share one fetch, so they cannot race each other's pre-login cookie.
 */
async function ensureCsrfToken(
  api: Parameters<typeof rawBaseQuery>[1],
  extraOptions: Parameters<typeof rawBaseQuery>[2],
): Promise<void> {
  csrfInFlight ??= (async () => {
    const result = await rawBaseQuery(
      { url: '/auth/csrf', headers: { 'Cache-Control': 'no-store' } },
      api,
      extraOptions,
    );
    const token = (result.data as { csrfToken?: unknown } | undefined)?.csrfToken;
    if (typeof token === 'string') setCsrfToken(token);
  })().finally(() => {
    csrfInFlight = null;
  });
  await csrfInFlight;
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
  // Only a missing token is awaited. With one held, the request starts synchronously and
  // reads the token at once; sign-out relies on that, since it clears the token straight
  // after starting the logout request. A failed fetch leaves the token unset, and the
  // request then fails with the server's own answer, which the caller reports.
  if (api.type === 'mutation' && !getCsrfToken()) await ensureCsrfToken(api, extraOptions);
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
