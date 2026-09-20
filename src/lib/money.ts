/**
 * USD money helpers. Amounts are stored and transmitted as integer cents
 * (specification section 1); decimal input is parsed without floating-point
 * accumulation and unknown values render as unavailable rather than 0.
 */
export const UNAVAILABLE = '—';

const formatter = new Intl.NumberFormat('en-US', {
  style: 'currency',
  currency: 'USD',
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

/** Formats integer cents as USD. Returns the unavailable marker for null/undefined. */
export function formatCents(cents: number | null | undefined): string {
  if (cents === null || cents === undefined || !Number.isFinite(cents)) return UNAVAILABLE;
  return formatter.format(cents / 100);
}

/** Formats integer cents without a currency symbol, for dense table cells. */
export function formatCentsPlain(cents: number | null | undefined): string {
  if (cents === null || cents === undefined || !Number.isFinite(cents)) return UNAVAILABLE;
  const negative = cents < 0;
  const absolute = Math.abs(cents);
  const whole = Math.trunc(absolute / 100);
  const fraction = String(absolute % 100).padStart(2, '0');
  return `${negative ? '-' : ''}${whole.toLocaleString('en-US')}.${fraction}`;
}

export type MoneyParseResult =
  { ok: true; cents: number } | { ok: false; reason: 'empty' | 'format' | 'precision' | 'range' };

const AMOUNT_PATTERN = /^-?\d{0,12}(?:\.\d{0,})?$/;

/**
 * Parses a decimal USD string into integer cents using string arithmetic, so
 * "0.07" never becomes 6.999999999999999 cents.
 */
export function parseUsdToCents(input: string): MoneyParseResult {
  const raw = input.trim().replace(/[$,\s]/g, '');
  if (raw === '' || raw === '-') return { ok: false, reason: 'empty' };
  if (!AMOUNT_PATTERN.test(raw)) return { ok: false, reason: 'format' };

  const negative = raw.startsWith('-');
  const unsigned = negative ? raw.slice(1) : raw;
  const [wholePart = '', fractionPart = ''] = unsigned.split('.');
  if (fractionPart.length > 2) return { ok: false, reason: 'precision' };

  const whole = wholePart === '' ? 0 : Number.parseInt(wholePart, 10);
  const fraction = Number.parseInt(fractionPart.padEnd(2, '0') || '0', 10);
  if (!Number.isSafeInteger(whole) || Number.isNaN(fraction)) return { ok: false, reason: 'range' };

  const cents = whole * 100 + fraction;
  if (!Number.isSafeInteger(cents)) return { ok: false, reason: 'range' };
  return { ok: true, cents: negative ? -cents : cents };
}

/** Renders integer cents back into an editable decimal string. */
export function centsToInput(cents: number | null | undefined): string {
  if (cents === null || cents === undefined || !Number.isFinite(cents)) return '';
  const negative = cents < 0;
  const absolute = Math.abs(Math.trunc(cents));
  return `${negative ? '-' : ''}${Math.trunc(absolute / 100)}.${String(absolute % 100).padStart(2, '0')}`;
}

/** Sums integer cents; any non-finite entry makes the total unknown. */
export function sumCents(values: Array<number | null | undefined>): number | null {
  let total = 0;
  for (const value of values) {
    if (value === null || value === undefined || !Number.isFinite(value)) return null;
    total += value;
  }
  return total;
}
