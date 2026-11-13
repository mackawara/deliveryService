import { expect, type Page } from '@playwright/test';

/** The fixed code the mock API accepts; a real deployment sends a WhatsApp code. */
export const MOCK_CODE = '123456';

/** Numbers the mock API gives each kind of account (see `mockRolesFor`). */
export const MOCK_NUMBERS = {
  staff: '0772000001',
  owner: '0772000002',
  both: '0772000003',
} as const;

/**
 * Signs in through the mock-mode stand-in for the one login. In a deployment `/login`
 * is served by the API; with the mock API a development-only page takes its place.
 */
export async function signIn(
  page: Page,
  account: keyof typeof MOCK_NUMBERS = 'staff',
  address = '/login',
): Promise<void> {
  await page.goto(address);
  await submitCode(page, account);
}

/** Completes the stand-in login form on whatever `/login` address the page is at. */
export async function submitCode(page: Page, account: keyof typeof MOCK_NUMBERS): Promise<void> {
  await expect(page.getByRole('heading', { name: 'Mock sign-in' })).toBeVisible();
  await page.getByRole('textbox', { name: /WhatsApp number/i }).fill(MOCK_NUMBERS[account]);
  await page.getByRole('button', { name: /Send code/i }).click();
  await page.getByRole('textbox', { name: /Login code/i }).fill(MOCK_CODE);
  await page.getByRole('button', { name: /Log in/i }).click();
}

/** Ends one mock session the way an idle timeout would, without the app's involvement. */
export async function expireSession(page: Page, role: 'staff' | 'owner'): Promise<void> {
  await page.evaluate(async (expiredRole) => {
    await fetch(`/api/v1/__mock/expire?role=${expiredRole}`, { method: 'POST' });
  }, role);
}
