import { baseApi } from '@/api/baseApi';
import { getCsrfToken, getShopCsrfToken, setCsrfToken } from '@/api/csrf';
import type {
  SessionRole,
  WireAccess,
  WireActivityResult,
  WireCsrf,
  WireStaffSession,
} from '@/api/dto/session';
import type { StaffSession } from '@/lib/permissions';

/**
 * Session endpoints (specification section 5.4).
 *
 * Signing in happens on the one login page, which is served outside this app, so there
 * are no code-request or verify calls here. This app reads who is signed in, keeps the
 * session alive while it is used, and signs out.
 */
export const sessionApi = baseApi.injectEndpoints({
  endpoints: (build) => ({
    /** Stores the CSRF token of the staff session, or a pre-login one when signed out. */
    getCsrf: build.query<WireCsrf, void>({
      query: () => ({ url: '/auth/csrf', headers: { 'Cache-Control': 'no-store' } }),
      async onQueryStarted(_arg, { queryFulfilled }) {
        try {
          const { data } = await queryFulfilled;
          setCsrfToken(data.csrfToken);
        } catch {
          // The next state-changing request fetches it again.
        }
      },
    }),

    /**
     * "Who am I" across both roles: where this browser may go. Never a 401; a
     * signed-out browser gets no destinations. It routes only — each API still checks
     * its own session.
     */
    getAccess: build.query<WireAccess, void>({
      query: () => ({ url: '/auth/session', headers: { 'Cache-Control': 'no-store' } }),
      transformResponse: (response: Partial<WireAccess> | null): WireAccess => ({
        destinations: (response?.destinations ?? []).filter(
          (destination) => destination === 'ADMIN' || destination === 'SHOP',
        ),
      }),
      providesTags: ['Session'],
    }),

    /** Current identity, permissions, town scope and session expiry. */
    getMe: build.query<StaffSession, void>({
      query: () => ({ url: '/admin/me' }),
      transformResponse: (response: WireStaffSession): StaffSession => ({
        user: response.user,
        roles: response.roles ?? [],
        // `allTowns` is explicit: an empty town list never implies unrestricted access.
        townAccess: {
          allTowns: response.townAccess?.allTowns === true,
          towns: response.townAccess?.towns ?? [],
        },
        capabilities: response.capabilities ?? [],
        session: response.session,
      }),
      providesTags: ['Session'],
    }),

    /** Throttled foreground interaction; extends idle expiry within the absolute limit. */
    recordActivity: build.mutation<WireActivityResult, void>({
      query: () => ({ url: '/auth/session/activity', method: 'POST' }),
    }),

    /**
     * The one sign-out: ends every session this browser holds, whichever shell asked.
     * The request carries the CSRF token of the role that is signing out, read as the
     * request is built, so the caller may clear local tokens straight afterwards.
     */
    logout: build.mutation<void, SessionRole>({
      query: (role) => {
        const token = role === 'owner' ? getShopCsrfToken() : getCsrfToken();
        return {
          url: '/auth/logout',
          method: 'POST',
          headers: token ? { 'X-CSRF-Token': token } : undefined,
        };
      },
    }),
  }),
});

export const {
  useGetCsrfQuery,
  useGetAccessQuery,
  useGetMeQuery,
  useRecordActivityMutation,
  useLogoutMutation,
} = sessionApi;
