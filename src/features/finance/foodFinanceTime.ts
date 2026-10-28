/** Finance periods use Harare midnight, irrespective of the browser's timezone. */
export function hararePeriodInstant(value: string): string | null {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return null;
  const instant = new Date(`${value}T00:00:00+02:00`);
  if (!Number.isFinite(instant.getTime())) return null;
  const roundTrip = new Date(instant.getTime() + 2 * 60 * 60 * 1000).toISOString().slice(0, 10);
  return roundTrip === value ? instant.toISOString() : null;
}

/** Native datetime-local values always mean Harare time in this finance flow. */
export function hararePaymentInstant(value: string): string | null {
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(value)) return null;
  const instant = new Date(`${value}:00+02:00`);
  if (!Number.isFinite(instant.getTime())) return null;
  return new Date(instant.getTime() + 2 * 60 * 60 * 1000).toISOString().slice(0, 16) === value
    ? instant.toISOString()
    : null;
}
