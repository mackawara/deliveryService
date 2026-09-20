import { describe, expect, it } from 'vitest';

import { fieldErrorMap, normalizeApiError } from '@/api/errors';

describe('API error normalization', () => {
  it('distinguishes each failure class the dashboard reacts to', () => {
    expect(
      normalizeApiError({ status: 401, data: { code: 'UNAUTHENTICATED', message: 'x' } }).kind,
    ).toBe('unauthenticated');
    expect(normalizeApiError({ status: 403, data: {} }).kind).toBe('forbidden');
    expect(normalizeApiError({ status: 404, data: {} }).kind).toBe('notFound');
    expect(normalizeApiError({ status: 409, data: {} }).kind).toBe('conflict');
    expect(normalizeApiError({ status: 422, data: {} }).kind).toBe('validation');
    expect(normalizeApiError({ status: 429, data: {} }).kind).toBe('rateLimited');
    expect(normalizeApiError({ status: 503, data: {} }).kind).toBe('server');
    expect(normalizeApiError({ status: 'FETCH_ERROR', error: 'offline' }).kind).toBe('offline');
    expect(normalizeApiError({ status: 'TIMEOUT_ERROR', error: 'slow' }).kind).toBe('timeout');
  });

  it('keeps the safe message, code and correlation id from the backend', () => {
    const error = normalizeApiError({
      status: 409,
      data: { code: 'VERSION_CONFLICT', message: 'The record changed.', correlationId: 'corr-1' },
    });
    expect(error.code).toBe('VERSION_CONFLICT');
    expect(error.message).toBe('The record changed.');
    expect(error.correlationId).toBe('corr-1');
  });

  it('maps field errors onto form inputs', () => {
    const error = normalizeApiError({
      status: 422,
      data: {
        code: 'VALIDATION_FAILED',
        message: 'Invalid',
        fieldErrors: [{ field: 'phone', message: 'required' }],
      },
    });
    expect(fieldErrorMap(error)).toEqual({ phone: 'required' });
  });

  it('reads the retry delay a rate limiter asked for', () => {
    const error = normalizeApiError(
      { status: 429, data: {} },
      {
        response: new Response(null, { status: 429, headers: { 'Retry-After': '45' } }),
      },
    );
    expect(error.retryAfterSeconds).toBe(45);
  });

  it('falls back to a safe default message when the body has none', () => {
    expect(normalizeApiError({ status: 500, data: null }).message).toContain('problem');
  });
});
