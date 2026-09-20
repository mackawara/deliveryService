import { describe, expect, it } from 'vitest';

import {
  centsToInput,
  formatCents,
  formatCentsPlain,
  parseUsdToCents,
  sumCents,
} from '@/lib/money';

describe('money helpers', () => {
  it('formats integer cents as USD', () => {
    expect(formatCents(0)).toBe('$0.00');
    expect(formatCents(1234)).toBe('$12.34');
    expect(formatCents(-500)).toBe('-$5.00');
  });

  it('shows unavailable rather than zero for an unknown amount', () => {
    expect(formatCents(null)).toBe('—');
    expect(formatCents(undefined)).toBe('—');
    expect(formatCentsPlain(null)).toBe('—');
  });

  it('parses decimal input into cents without floating-point drift', () => {
    expect(parseUsdToCents('0.07')).toEqual({ ok: true, cents: 7 });
    expect(parseUsdToCents('12.34')).toEqual({ ok: true, cents: 1234 });
    expect(parseUsdToCents('  $1,234.50 ')).toEqual({ ok: true, cents: 123450 });
    expect(parseUsdToCents('.5')).toEqual({ ok: true, cents: 50 });
    expect(parseUsdToCents('-3.01')).toEqual({ ok: true, cents: -301 });
  });

  it('accumulates repeated cent values exactly', () => {
    let total = 0;
    for (let index = 0; index < 100; index += 1) {
      const parsed = parseUsdToCents('0.07');
      expect(parsed.ok).toBe(true);
      if (parsed.ok) total += parsed.cents;
    }
    expect(total).toBe(700);
    expect(formatCents(total)).toBe('$7.00');
  });

  it('rejects unusable input with a reason', () => {
    expect(parseUsdToCents('')).toEqual({ ok: false, reason: 'empty' });
    expect(parseUsdToCents('abc')).toEqual({ ok: false, reason: 'format' });
    expect(parseUsdToCents('1.234')).toEqual({ ok: false, reason: 'precision' });
  });

  it('round-trips cents through the editable input format', () => {
    expect(centsToInput(1234)).toBe('12.34');
    expect(centsToInput(5)).toBe('0.05');
    expect(centsToInput(null)).toBe('');
  });

  it('treats an unknown entry as an unknown total', () => {
    expect(sumCents([100, 200])).toBe(300);
    expect(sumCents([100, null])).toBeNull();
  });
});
