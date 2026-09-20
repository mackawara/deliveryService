/**
 * Staff login number helpers. The server normalizes to E.164 and owns validation;
 * these helpers only improve usability and never decide eligibility.
 */
export function stripPhoneFormatting(input: string): string {
  return input.replace(/[^\d+]/g, '');
}

/**
 * Best-effort E.164 shaping for display and submission. A local number starting with
 * 0 is combined with the selected country code; anything else is passed through with
 * formatting removed so the server can reject it authoritatively.
 */
export function toSubmittablePhone(countryCode: string, localInput: string): string {
  const cleanedCountry = stripPhoneFormatting(countryCode);
  const cleaned = stripPhoneFormatting(localInput);
  if (cleaned.startsWith('+')) return cleaned;
  const withoutLeadingZero = cleaned.replace(/^0+/, '');
  return `${cleanedCountry}${withoutLeadingZero}`;
}

/** Local-format plausibility check: enough digits to be worth sending. */
export function looksLikePhone(countryCode: string, localInput: string): boolean {
  const submittable = toSubmittablePhone(countryCode, localInput);
  return /^\+\d{8,15}$/.test(submittable);
}

/**
 * Masks a number for display when the server has not already supplied a masked form.
 * Keeps the country code and the last two digits.
 */
export function maskPhone(phone: string | null | undefined): string {
  if (!phone) return '—';
  const cleaned = stripPhoneFormatting(phone);
  if (cleaned.length <= 4) return '•'.repeat(cleaned.length);
  const prefix = cleaned.startsWith('+') ? cleaned.slice(0, 4) : cleaned.slice(0, 2);
  const suffix = cleaned.slice(-2);
  const hiddenCount = Math.max(2, cleaned.length - prefix.length - suffix.length);
  return `${prefix}${'•'.repeat(hiddenCount)}${suffix}`;
}

export const COUNTRY_CODES = [
  { code: '+263', label: 'Zimbabwe (+263)' },
  { code: '+27', label: 'South Africa (+27)' },
  { code: '+260', label: 'Zambia (+260)' },
  { code: '+267', label: 'Botswana (+267)' },
  { code: '+44', label: 'United Kingdom (+44)' },
  { code: '+1', label: 'United States (+1)' },
] as const;
