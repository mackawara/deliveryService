import { baseApi } from '@/api/baseApi';
import type { AppArea } from '@/auth/returnPath';

/** What the one login answers once a code is verified. */
export interface MockAccess {
  destinations: AppArea[];
  homes: Partial<Record<AppArea, string>>;
}

/**
 * The two calls the one login page makes, for the mock-mode stand-in only.
 *
 * The real page is served by the API and makes these calls itself, so the application
 * has no sign-in endpoints of its own. They are injected from here, alongside the
 * stand-in page, and so never reach a production bundle.
 */
export const mockLoginApi = baseApi.injectEndpoints({
  endpoints: (build) => ({
    mockRequestCode: build.mutation<{ challengeId: string }, { phone: string; requestKey: string }>(
      {
        query: (body) => ({
          url: '/auth/otp/request',
          method: 'POST',
          body: { ...body, consent: true },
        }),
      },
    ),
    mockVerifyCode: build.mutation<MockAccess, { challengeId: string; code: string }>({
      query: (body) => ({ url: '/auth/otp/verify', method: 'POST', body }),
    }),
  }),
});

export const { useMockRequestCodeMutation, useMockVerifyCodeMutation } = mockLoginApi;
