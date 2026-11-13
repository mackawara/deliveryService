import { expect } from 'vitest';

import { shopApi } from '@/api/endpoints/shop';
import type { createAppStore } from '@/app/store';

const API = 'http://localhost:3000/api/v1';

/**
 * Signs a shop owner in the way the one login page does.
 *
 * That page is served by the API, outside the dashboard, so the dashboard has no
 * sign-in endpoints of its own. These are the page's calls, made through each suite's
 * bridge to the real Express app, which carries the cookies. The dashboard then loads
 * as it would after the login page hands over: it asks for the owner session's token.
 */
export async function signInOwner(
  store: ReturnType<typeof createAppStore>,
  phone: string,
  /** Reads the code the API delivered over WhatsApp for this request. */
  readCode: () => Promise<string>,
): Promise<void> {
  const call = async (path: string, body?: unknown, csrfToken?: string) => {
    const response = await globalThis.fetch(`${API}${path}`, {
      method: body === undefined ? 'GET' : 'POST',
      headers: {
        ...(body === undefined ? {} : { 'content-type': 'application/json' }),
        ...(csrfToken ? { 'x-csrf-token': csrfToken } : {}),
      },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    return { status: response.status, body: (await response.json()) as Record<string, unknown> };
  };

  const csrf = await call('/auth/csrf');
  const token = csrf.body.csrfToken as string;
  const challenge = await call(
    '/auth/otp/request',
    { phone, consent: true, requestKey: crypto.randomUUID() },
    token,
  );
  expect(challenge.status, JSON.stringify(challenge.body)).toBe(202);
  const verified = await call(
    '/auth/otp/verify',
    { challengeId: challenge.body.challengeId, code: await readCode() },
    token,
  );
  expect(verified.status, JSON.stringify(verified.body)).toBe(200);
  expect(verified.body.destinations).toContain('SHOP');

  await store
    .dispatch(shopApi.endpoints.getShopCsrf.initiate(undefined, { forceRefetch: true }))
    .unwrap();
}
