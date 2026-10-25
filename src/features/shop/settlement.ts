import type { SettlementFrequency, ShopSchedule } from '@/api/dto/shop';

export interface ScheduleDraft {
  frequency: SettlementFrequency;
  timezone: string;
  cutoffTime: string;
  anchor: string;
}
export function scheduleDraft(schedule?: ShopSchedule): ScheduleDraft {
  return {
    frequency: schedule?.frequency ?? 'DAILY',
    timezone: schedule?.timezone ?? 'Africa/Harare',
    cutoffTime: schedule?.cutoffTime ?? '22:00',
    anchor: String(schedule?.periodAnchor ?? ''),
  };
}
export function schedulePayload(draft: ScheduleDraft): ShopSchedule {
  const { frequency, cutoffTime } = draft;
  const timezone = draft.timezone.trim();
  try {
    new Intl.DateTimeFormat('en', { timeZone: timezone }).format();
  } catch {
    throw new Error('Choose a valid timezone.');
  }
  if (!/^([01]\d|2[0-3]):[0-5]\d$/.test(cutoffTime)) throw new Error('Enter a valid cut-off time.');
  if (frequency === 'DAILY') return { frequency, timezone, cutoffTime };
  const periodAnchor = Number(draft.anchor);
  const min = frequency === 'WEEKLY' ? 0 : 1;
  const max = frequency === 'WEEKLY' ? 6 : 28;
  if (
    !draft.anchor.trim() ||
    !Number.isInteger(periodAnchor) ||
    periodAnchor < min ||
    periodAnchor > max
  )
    throw new Error(`Choose an anchor between ${min} and ${max}.`);
  return { frequency, timezone, cutoffTime, periodAnchor };
}
export function validSchedule(draft: ScheduleDraft): boolean {
  try {
    schedulePayload(draft);
    return true;
  } catch {
    return false;
  }
}
export const weekdays = [
  'Sunday',
  'Monday',
  'Tuesday',
  'Wednesday',
  'Thursday',
  'Friday',
  'Saturday',
];
export function scheduleLabel(schedule: ShopSchedule): string {
  const anchor =
    schedule.frequency === 'WEEKLY'
      ? ` · ${weekdays[schedule.periodAnchor ?? -1] ?? 'weekday required'}`
      : schedule.frequency === 'MONTHLY'
        ? ` · day ${schedule.periodAnchor}`
        : '';
  return `${schedule.frequency}${anchor} · cutoff ${schedule.cutoffTime} · ${schedule.timezone}`;
}
