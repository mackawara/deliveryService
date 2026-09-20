import { describe, expect, it } from 'vitest';

import { ActionKey, newIdempotencyKey } from '@/lib/idempotency';

describe('idempotency keys', () => {
  it('generates a distinct UUID per call', () => {
    const first = newIdempotencyKey();
    const second = newIdempotencyKey();
    expect(first).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/);
    expect(first).not.toBe(second);
  });

  it('reuses one key while resolving an uncertain outcome', () => {
    const key = new ActionKey();
    const issued = key.next();
    expect(key.current()).toBe(issued);
    expect(key.current()).toBe(issued);
  });

  it('issues a new key for a deliberate new action', () => {
    const key = new ActionKey();
    const first = key.next();
    const second = key.next();
    expect(second).not.toBe(first);
  });

  it('starts a fresh key after a reset', () => {
    const key = new ActionKey();
    const first = key.next();
    key.reset();
    expect(key.current()).not.toBe(first);
  });
});
