/**
 * Normalized API failures (specification section 6).
 *
 * The backend returns `{ code, message, fieldErrors?, correlationId }` with 401/403/
 * 404/409/422/429/5xx status codes. Every screen reacts to the normalized shape, so
 * 401, 409, 422, 429, offline and server failures never look the same.
 */
import type { FetchBaseQueryError } from '@reduxjs/toolkit/query/react';

export type ApiErrorKind =
  | 'offline'
  | 'timeout'
  | 'unauthenticated'
  | 'forbidden'
  | 'notFound'
  | 'conflict'
  | 'validation'
  | 'rateLimited'
  | 'server'
  | 'client'
  | 'unknown';

export interface FieldError {
  field: string;
  message: string;
}

export interface NormalizedApiError {
  kind: ApiErrorKind;
  /** HTTP status when the request reached the server. */
  status?: number;
  /** Machine readable backend code, e.g. `VERSION_CONFLICT`. */
  code?: string;
  /** Safe, displayable message. */
  message: string;
  fieldErrors?: FieldError[];
  /** Safe identifier a user can quote to support; never a raw payload. */
  correlationId?: string;
  /** Seconds the server asked the client to wait, from `Retry-After`. */
  retryAfterSeconds?: number;
}

const DEFAULT_MESSAGES: Record<ApiErrorKind, string> = {
  offline: 'No connection to the delivery service. Check the network and try again.',
  timeout: 'The delivery service did not answer in time.',
  unauthenticated: 'Your session has ended. Sign in again to continue.',
  forbidden: 'Your access does not permit this action.',
  notFound: 'That record is not available to you.',
  conflict: 'This record changed since it was loaded.',
  validation: 'Some fields are not valid.',
  rateLimited: 'Too many requests. Wait a moment and try again.',
  server: 'The delivery service had a problem completing this request.',
  client: 'That request could not be completed.',
  unknown: 'Something went wrong.',
};

function kindForStatus(status: number): ApiErrorKind {
  if (status === 401) return 'unauthenticated';
  if (status === 403) return 'forbidden';
  if (status === 404) return 'notFound';
  if (status === 409) return 'conflict';
  if (status === 422) return 'validation';
  if (status === 429) return 'rateLimited';
  if (status >= 500) return 'server';
  return 'client';
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

function readFieldErrors(payload: Record<string, unknown>): FieldError[] | undefined {
  const raw = payload.fieldErrors;
  if (!Array.isArray(raw)) return undefined;
  const parsed = raw.flatMap((entry) =>
    isRecord(entry) && typeof entry.field === 'string' && typeof entry.message === 'string'
      ? [{ field: entry.field, message: entry.message }]
      : [],
  );
  return parsed.length > 0 ? parsed : undefined;
}

function readRetryAfter(meta: { response?: Response } | undefined): number | undefined {
  const header = meta?.response?.headers?.get('retry-after');
  if (!header) return undefined;
  const seconds = Number.parseInt(header, 10);
  return Number.isFinite(seconds) ? seconds : undefined;
}

/** Converts an RTK Query error into the shape every screen reacts to. */
export function normalizeApiError(
  error: FetchBaseQueryError | undefined,
  meta?: { response?: Response },
): NormalizedApiError {
  if (!error) return { kind: 'unknown', message: DEFAULT_MESSAGES.unknown };

  if (typeof error.status === 'number') {
    const kind = kindForStatus(error.status);
    const payload = isRecord(error.data) ? error.data : {};
    return {
      kind,
      status: error.status,
      code: typeof payload.code === 'string' ? payload.code : undefined,
      message: typeof payload.message === 'string' ? payload.message : DEFAULT_MESSAGES[kind],
      fieldErrors: readFieldErrors(payload),
      correlationId: typeof payload.correlationId === 'string' ? payload.correlationId : undefined,
      retryAfterSeconds: readRetryAfter(meta),
    };
  }

  if (error.status === 'TIMEOUT_ERROR') {
    return { kind: 'timeout', message: DEFAULT_MESSAGES.timeout };
  }
  if (error.status === 'FETCH_ERROR') {
    return { kind: 'offline', message: DEFAULT_MESSAGES.offline };
  }
  // PARSING_ERROR and CUSTOM_ERROR: the request reached the server but the body was unusable.
  return {
    kind: 'server',
    status: 'originalStatus' in error ? error.originalStatus : undefined,
    message: DEFAULT_MESSAGES.server,
  };
}

export function isNormalizedApiError(value: unknown): value is NormalizedApiError {
  return isRecord(value) && typeof value.kind === 'string' && typeof value.message === 'string';
}

/** Maps normalized field errors onto a form's field names. */
export function fieldErrorMap(error: NormalizedApiError | undefined): Record<string, string> {
  const map: Record<string, string> = {};
  for (const entry of error?.fieldErrors ?? []) {
    map[entry.field] = entry.message;
  }
  return map;
}
