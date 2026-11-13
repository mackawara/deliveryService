import {
  fetchBaseQuery,
  type BaseQueryFn,
  type FetchArgs,
  type FetchBaseQueryMeta,
} from '@reduxjs/toolkit/query/react';

import { getCsrfToken, getShopCsrfToken, setCsrfToken, setShopCsrfToken } from '@/api/csrf';
import { normalizeApiError, type NormalizedApiError } from '@/api/errors';
import { appConfig } from '@/config';

/**
 * Session probes own their 401: an unauthenticated answer is how they report "signed
 * out", so it must not start a session-expired transition.
 */
const SESSION_PROBES = new Set([
  'getCsrf',
  'getAccess',
  'getMe',
  'logout',
  'getShopCsrf',
  'getShopMe',
]);

/**
 * A shop-owner request is recognised by its path, not by a list of endpoint names:
 * everything under `/shop` belongs to the owner session. A new owner endpoint is then
 * covered without anyone remembering to register it, and an owner whose session ends
 * can never be sent through the staff transition.
 */
export function isShopRequest(args: string | FetchArgs): boolean {
  const url = typeof args === 'string' ? args : args.url;
  const path = url.split('?')[0] ?? '';
  return path === '/shop' || path.startsWith('/shop/');
}

function hasCsrfHeader(args: string | FetchArgs): boolean {
  if (typeof args === 'string' || !args.headers) return false;
  return new Headers(args.headers as HeadersInit).has('X-CSRF-Token');
}

const rawBaseQuery = fetchBaseQuery({
  baseUrl: appConfig.apiBaseUrl,
  // The browser sends the HttpOnly session cookies; no bearer token or staff API key
  // is ever stored in Redux or browser storage (specification section 5.3).
  credentials: 'include',
  timeout: 30_000,
  prepareHeaders: (headers) => {
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
let onOwnerAccessExpired: SessionExpiryListener = () => {};
export function setOwnerAccessExpiryListener(listener: SessionExpiryListener) {
  onOwnerAccessExpired = listener;
}

export function setSessionExpiryListener(listener: SessionExpiryListener): void {
  onSessionExpired = listener;
}

let csrfInFlight: Promise<void> | null = null;
let shopCsrfInFlight: Promise<void> | null = null;

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

async function ensureShopCsrfToken(
  api: Parameters<typeof rawBaseQuery>[1],
  extraOptions: Parameters<typeof rawBaseQuery>[2],
): Promise<void> {
  shopCsrfInFlight ??= (async () => {
    const result = await rawBaseQuery(
      { url: '/shop/auth/csrf', headers: { 'Cache-Control': 'no-store' } },
      api,
      extraOptions,
    );
    const token = (result.data as { csrfToken?: unknown } | undefined)?.csrfToken;
    if (typeof token === 'string') setShopCsrfToken(token);
  })().finally(() => {
    shopCsrfInFlight = null;
  });
  await shopCsrfInFlight;
}

/**
 * Application base query: normalizes every failure, keeps cookies on the request and
 * reports session expiry once for concurrent 401s.
 */
export const appBaseQuery: BaseQueryFn<
  string | FetchArgs,
  unknown,
  NormalizedApiError,
  // RTK's default empty options shape keeps endpoint extraOptions optional.
  // eslint-disable-next-line @typescript-eslint/no-empty-object-type
  {},
  FetchBaseQueryMeta
> = async (args, api, extraOptions) => {
  const shop = isShopRequest(args);
  let request = args;
  // Staff and owner sessions have separate CSRF tokens; the path decides which one a
  // state-changing request carries. A request that names its own token keeps it.
  if (api.type === 'mutation' && !hasCsrfHeader(args)) {
    // Only a missing token is awaited. With one held, the request is built synchronously.
    // A failed fetch leaves the token unset, and the request then fails with the
    // server's own answer, which the caller reports.
    if (shop) {
      if (!getShopCsrfToken()) await ensureShopCsrfToken(api, extraOptions);
    } else if (!getCsrfToken()) {
      await ensureCsrfToken(api, extraOptions);
    }
    const token = shop ? getShopCsrfToken() : getCsrfToken();
    if (token) {
      const base: FetchArgs = typeof args === 'string' ? { url: args } : args;
      const headers = new Headers(base.headers as HeadersInit | undefined);
      headers.set('X-CSRF-Token', token);
      request = { ...base, headers };
    }
  }
  const result = await rawBaseQuery(request, api, extraOptions);

  if (result.error) {
    const normalized = normalizeApiError(result.error, result.meta);
    const probe = SESSION_PROBES.has(api.endpoint);
    if (shop) {
      // An owner's lost session or revoked branch access never signs staff out.
      if (!probe && ['unauthenticated', 'forbidden'].includes(normalized.kind))
        setTimeout(onOwnerAccessExpired, 0);
    } else if (!probe && normalized.kind === 'unauthenticated') {
      onSessionExpired();
    }
    return { error: normalized, meta: result.meta };
  }

  return { data: result.data, meta: result.meta };
};
