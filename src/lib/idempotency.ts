/**
 * Idempotency-Key helpers (specification section 6).
 *
 * One UUID is generated per logical guarded action. The same key is reused only when
 * retrying the identical payload to resolve an uncertain outcome; a deliberate new
 * action always takes a new key.
 */
export function newIdempotencyKey(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }
  // Fallback for environments without crypto.randomUUID; still high entropy enough
  // to deduplicate a single user action.
  const bytes = new Uint8Array(16);
  if (typeof crypto !== 'undefined' && typeof crypto.getRandomValues === 'function') {
    crypto.getRandomValues(bytes);
  } else {
    for (let index = 0; index < bytes.length; index += 1) {
      bytes[index] = Math.floor(Math.random() * 256);
    }
  }
  bytes[6] = (bytes[6]! & 0x0f) | 0x40;
  bytes[8] = (bytes[8]! & 0x3f) | 0x80;
  const hex = Array.from(bytes, (byte) => byte.toString(16).padStart(2, '0')).join('');
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

/**
 * Holds one key for the lifetime of a single user-initiated action. `next()` starts a
 * deliberate new action, `current()` reuses the key while resolving an unconfirmed one.
 */
export class ActionKey {
  private key: string | null = null;

  next(): string {
    this.key = newIdempotencyKey();
    return this.key;
  }

  current(): string {
    if (this.key === null) return this.next();
    return this.key;
  }

  reset(): void {
    this.key = null;
  }
}
