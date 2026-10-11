import { TOWN_POLICY_FIELDS, type OperatingHours, type TownPolicy } from '@/api/dto/configuration';

/** Store only deliberate differences, so future standards still reach inherited fields. */
export function policyOverrides(policy: TownPolicy, standard: TownPolicy): TownPolicy {
  return Object.fromEntries(
    TOWN_POLICY_FIELDS.flatMap(({ key }) => {
      const value = policy[key]?.trim();
      return value && value !== standard[key]?.trim() ? [[key, value]] : [];
    }),
  );
}

function scheduleKey(hours: OperatingHours[]): string {
  return JSON.stringify(
    hours
      .map(({ day, opensAt, closesAt }) => ({ day, opensAt, closesAt }))
      .sort(
        (a, b) =>
          a.day - b.day ||
          a.opensAt.localeCompare(b.opensAt) ||
          a.closesAt.localeCompare(b.closesAt),
      ),
  );
}

/** The API uses an empty array to restore the standard schedule. */
export function hoursOverrides(
  hours: OperatingHours[],
  standard: OperatingHours[],
): OperatingHours[] {
  return scheduleKey(hours) === scheduleKey(standard) ? [] : hours;
}
