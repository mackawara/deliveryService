import { describe, expect, it } from 'vitest';

import { areaOf, isSafeReturnPath, loginUrlFor } from '@/auth/returnPath';

describe('return paths for the one login', () => {
  it.each([
    null,
    undefined,
    '',
    'bookings',
    '//outside.example',
    '/\\outside.example',
    'https://outside.example/bookings',
    'javascript:alert(1)',
    '/login',
    '/login?returnTo=/bookings',
    '/signed-out',
    '/signed-out?remote=unconfirmed',
    '/shop/login',
    '/shop/signup',
    '/shop/dashboard',
  ])('refuses an absent, outside or sign-in target %s', (target) => {
    expect(isSafeReturnPath(target)).toBe(false);
  });

  it.each(['/bookings?status=CONFIRMED', '/dashboard', '/shop', '/shop/branch-1/catalogue'])(
    'keeps the page the person was on: %s',
    (target) => {
      expect(isSafeReturnPath(target)).toBe(true);
    },
  );

  it('builds the login address with the page, its filters and the reason', () => {
    expect(loginUrlFor('/bookings', '?status=CONFIRMED')).toBe(
      '/login?returnTo=%2Fbookings%3Fstatus%3DCONFIRMED',
    );
    expect(loginUrlFor('/shop/branch-1/orders', '', 'expired')).toBe(
      '/login?returnTo=%2Fshop%2Fbranch-1%2Forders&reason=expired',
    );
  });

  it('carries no return path from the root or from a sign-in screen', () => {
    expect(loginUrlFor('/')).toBe('/login');
    expect(loginUrlFor('/signed-out', '?remote=unconfirmed')).toBe('/login');
    expect(loginUrlFor('/shop/login')).toBe('/login');
  });

  it('knows which role a page belongs to', () => {
    expect(areaOf('/shop')).toBe('SHOP');
    expect(areaOf('/shop/branch-1/catalogue')).toBe('SHOP');
    expect(areaOf('/shopping')).toBe('ADMIN');
    expect(areaOf('/dashboard')).toBe('ADMIN');
    expect(areaOf('/admin/food/shops')).toBe('ADMIN');
  });
});
