import type { OperatingHours } from '@/api/dto/configuration';

const TIME_OF_DAY = /^([01]\d|2[0-3]):[0-5]\d$/;

/** Why a window would be refused by the server, or null when it is valid. */
export function hoursProblem(window: OperatingHours): string | null {
  if (!TIME_OF_DAY.test(window.opensAt) || !TIME_OF_DAY.test(window.closesAt)) {
    return 'Enter opening and closing times.';
  }
  if (window.opensAt >= window.closesAt) return 'Must open before it closes.';
  return null;
}

/** True when every open day has a valid window the server will accept. */
export function operatingHoursValid(hours: OperatingHours[]): boolean {
  return hours.every((window) => hoursProblem(window) === null);
}

/** True when the town has more than one window on some day (a split shift). */
export function hasSplitShifts(hours: OperatingHours[]): boolean {
  return new Set(hours.map((window) => window.day)).size !== hours.length;
}
