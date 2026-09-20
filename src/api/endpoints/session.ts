import { baseApi } from '@/api/baseApi';
import { clearCsrfToken, setCsrfToken } from '@/api/csrf';
import type {
  OtpRequestBody,
  OtpResendBody,
  OtpVerifyBody,
  WireActivityResult,
  WireCsrf,
  WireOtpChallenge,
  WireOtpVerified,
  WireStaffSession,
} from '@/api/dto/session';
import type { StaffSession } from '@/lib/permissions';

/**
 * WhatsApp OTP and session endpoints (specification section 5.4).
 *
 * Authentication calls use RTK Query like every other request. OTP arguments are never
 * logged, and the login form keeps the code in local state rather than the store.
 */
export const sessionApi = baseApi.injectEndpoints({
  endpoints: (build) => ({
    /** Initializes or reuses the pre-login context and stores its CSRF token. */
    getCsrf: build.query<WireCsrf, void>({
      query: () => ({ url: '/auth/csrf', headers: { 'Cache-Control': 'no-store' } }),
      async onQueryStarted(_arg, { queryFulfilled }) {
        try {
          const { data } = await queryFulfilled;
          setCsrfToken(data.csrfToken);
        } catch {
          // The login form reports the failure; no token is kept.
        }
      },
    }),

    /** Generic 202 for unknown, disabled and eligible numbers alike. */
    requestOtp: build.mutation<WireOtpChallenge, OtpRequestBody>({
      query: (body) => ({ url: '/auth/otp/request', method: 'POST', body }),
    }),

    resendOtp: build.mutation<WireOtpChallenge, OtpResendBody>({
      query: (body) => ({ url: '/auth/otp/resend', method: 'POST', body }),
    }),

    /** Consumes the challenge once, sets the session cookie and rotates the CSRF token. */
    verifyOtp: build.mutation<WireOtpVerified, OtpVerifyBody>({
      query: (body) => ({ url: '/auth/otp/verify', method: 'POST', body }),
      async onQueryStarted(_arg, { queryFulfilled }) {
        try {
          const { data } = await queryFulfilled;
          setCsrfToken(data.csrfToken);
        } catch {
          // A failed verification keeps the pre-login token; the form shows the error.
        }
      },
      invalidatesTags: ['Session'],
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

    logout: build.mutation<void, void>({
      query: () => ({ url: '/auth/logout', method: 'POST' }),
      async onQueryStarted(_arg, { queryFulfilled }) {
        try {
          await queryFulfilled;
        } catch {
          // The caller reports an unconfirmed revocation; this handler only clears
          // local data, so the rejection stops here.
        } finally {
          // Local data is cleared even when the remote revocation could not be confirmed.
          clearCsrfToken();
        }
      },
    }),
  }),
});

export const {
  useGetCsrfQuery,
  useLazyGetCsrfQuery,
  useRequestOtpMutation,
  useResendOtpMutation,
  useVerifyOtpMutation,
  useGetMeQuery,
  useRecordActivityMutation,
  useLogoutMutation,
} = sessionApi;
