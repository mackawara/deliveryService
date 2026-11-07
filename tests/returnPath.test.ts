import { describe, expect, it } from 'vitest';

import { loginUrlFor, safeReturnPath } from '@/auth/returnPath';

describe('staff dashboard return path', () => {
  it.each([null, undefined, '/', '/?from=old-bookmark', '//outside.example', '/login'])(
    'uses the staff overview for an absent, public or unsafe target %s',
    (target) => {
      expect(safeReturnPath(target)).toBe('/dashboard');
    },
  );

  it('preserves the requested staff deep link and its filters', () => {
    expect(safeReturnPath('/bookings?status=CONFIRMED')).toBe('/bookings?status=CONFIRMED');
    expect(loginUrlFor('/bookings', '?status=CONFIRMED')).toBe(
      '/login?returnTo=%2Fbookings%3Fstatus%3DCONFIRMED',
    );
  });

  it('keeps the existing food-shop login target separate', () => {
    expect(safeReturnPath('/shop/example/catalogue')).toBe('/shop/example/catalogue');
  });
});
