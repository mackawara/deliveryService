import { TOWN_POLICY_FIELDS } from '@/api/dto/configuration';

export interface ReadinessItem {
  key: string;
  label: string;
  /** Where the missing item is configured, when that is another page. */
  path?: string;
}

const LABELS: Record<string, Omit<ReadinessItem, 'key'>> = {
  operatingHours: { label: 'Operating hours' },
  zones: { label: 'At least one zone', path: '/configuration/zones' },
  parcelPresets: { label: 'At least one parcel preset', path: '/configuration/parcels' },
  publishedRateCard: { label: 'A published rate card in force', path: '/configuration/rates' },
  fleet: { label: 'An active driver with an in-service vehicle', path: '/drivers' },
  'features.bookingEnabled': { label: 'Bookings switched on' },
};

for (const field of TOWN_POLICY_FIELDS) {
  LABELS[`policy.${field.key}`] = { label: field.label };
}

/**
 * Turns the server's launch-readiness keys into a checklist. Unknown keys are shown as
 * they arrive, so a new server-side requirement is never hidden.
 */
export function describeReadiness(missing: string[]): ReadinessItem[] {
  return missing.map((key) => ({ key, ...(LABELS[key] ?? { label: key }) }));
}
