/**
 * Timestamp helpers. API timestamps stay ISO strings in the cache and are rendered
 * in the configured town timezone (specification section 8). Unknown times render as
 * unavailable, never as an epoch or a zero.
 */
import { appConfig } from '@/config';
import { UNAVAILABLE } from '@/lib/money';

export function parseIso(value: string | null | undefined): Date | null {
  if (!value) return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

function formatWith(
  options: Intl.DateTimeFormatOptions,
  value: string | null | undefined,
  timeZone?: string,
) {
  const date = parseIso(value);
  if (!date) return UNAVAILABLE;
  return new Intl.DateTimeFormat('en-GB', {
    ...options,
    timeZone: timeZone ?? appConfig.defaultTimeZone,
  }).format(date);
}

export function formatDateTime(value: string | null | undefined, timeZone?: string): string {
  return formatWith(
    {
      day: '2-digit',
      month: 'short',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
      hour12: false,
    },
    value,
    timeZone,
  );
}

export function formatDate(value: string | null | undefined, timeZone?: string): string {
  return formatWith({ day: '2-digit', month: 'short', year: 'numeric' }, value, timeZone);
}

export function formatTime(value: string | null | undefined, timeZone?: string): string {
  return formatWith({ hour: '2-digit', minute: '2-digit', hour12: false }, value, timeZone);
}

/** Short, human age of a timestamp, e.g. "4 min ago". Unknown input stays unavailable. */
export function formatAge(value: string | null | undefined, now: number = Date.now()): string {
  const date = parseIso(value);
  if (!date) return UNAVAILABLE;
  const seconds = Math.round((now - date.getTime()) / 1000);
  if (seconds < 0) return 'in the future';
  if (seconds < 45) return 'just now';
  const minutes = Math.round(seconds / 60);
  if (minutes < 60) return `${minutes} min ago`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours} h ago`;
  const days = Math.round(hours / 24);
  return `${days} d ago`;
}

/** Formats an already-computed age in seconds, without reading the clock. */
export function formatAgeSeconds(seconds: number | null | undefined): string {
  if (seconds === null || seconds === undefined || !Number.isFinite(seconds)) return UNAVAILABLE;
  if (seconds < 0) return 'in the future';
  if (seconds < 45) return 'just now';
  const minutes = Math.round(seconds / 60);
  if (minutes < 60) return `${minutes} min ago`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours} h ago`;
  return `${Math.round(hours / 24)} d ago`;
}

/** Whole seconds until an ISO deadline; negative once the deadline has passed. */
export function secondsUntil(
  value: string | null | undefined,
  now: number = Date.now(),
): number | null {
  const date = parseIso(value);
  if (!date) return null;
  return Math.round((date.getTime() - now) / 1000);
}

/** Whole seconds since an ISO timestamp; negative for a future timestamp. */
export function secondsSince(
  value: string | null | undefined,
  now: number = Date.now(),
): number | null {
  const date = parseIso(value);
  if (!date) return null;
  return Math.round((now - date.getTime()) / 1000);
}

/** Formats a countdown as m:ss. */
export function formatCountdown(seconds: number | null): string {
  if (seconds === null) return UNAVAILABLE;
  const clamped = Math.max(0, seconds);
  const minutes = Math.floor(clamped / 60);
  const remainder = clamped % 60;
  return `${minutes}:${String(remainder).padStart(2, '0')}`;
}

/** Converts a date-only input (yyyy-mm-dd) into an ISO instant, or null when blank/invalid. */
export function dateInputToIso(value: string, endOfDay = false): string | null {
  if (!value) return null;
  const date = new Date(`${value}T${endOfDay ? '23:59:59.999' : '00:00:00.000'}Z`);
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
}
