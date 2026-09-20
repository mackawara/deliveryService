import { HttpResponse, http, type HttpHandler } from 'msw';

import * as fixtures from '@/mocks/fixtures';

/**
 * Mock delivery-service API for development and tests.
 *
 * It implements the documented contracts from specification sections 5.4 and 9,
 * including the endpoints listed as backend additions, so screens can be exercised and
 * tested before the backend work lands. It is never enabled in a production build.
 */
const BASE = '/api/v1';

interface Challenge {
  challengeId: string;
  phone: string;
  attempts: number;
  expiresAt: number;
  resendAt: number;
  consumed: boolean;
}

const state = {
  csrfToken: 'mock-csrf-pre-login',
  authenticated: false,
  /**
   * Browser runs keep the session in a cookie so a reload behaves like the real
   * server-managed session. Test runs drive the flag directly through `resetMockState`,
   * so cookies are ignored there and every test starts from a known state.
   */
  cookieSessionsEnabled: true,
  challenges: new Map<string, Challenge>(),
  requestKeys: new Map<string, string>(),
  sessionExpiresAt: 0,
  idleExpiresAt: 0,
};

/** Resets mock state between tests. */
export function resetMockState(options: { authenticated?: boolean } = {}): void {
  state.csrfToken = 'mock-csrf-pre-login';
  state.authenticated = options.authenticated ?? false;
  state.cookieSessionsEnabled = false;
  state.challenges.clear();
  state.requestKeys.clear();
  refreshSessionWindow();
}

function refreshSessionWindow(): void {
  state.sessionExpiresAt = Date.now() + 8 * 60 * 60_000;
  state.idleExpiresAt = Date.now() + 30 * 60_000;
}

function unauthenticated() {
  return HttpResponse.json(
    {
      code: 'UNAUTHENTICATED',
      message: 'Authentication required.',
      correlationId: 'mock-correlation',
    },
    { status: 401 },
  );
}

function notImplemented(endpoint: string) {
  return HttpResponse.json(
    {
      code: 'NOT_IMPLEMENTED',
      message: `${endpoint} is a proposed backend addition (specification section 11).`,
      correlationId: 'mock-correlation',
    },
    { status: 404 },
  );
}

function page<T>(items: T[], url: URL): { items: T[]; limit: number; skip: number } {
  const limit = Math.min(Number.parseInt(url.searchParams.get('limit') ?? '25', 10) || 25, 100);
  const skip = Math.max(Number.parseInt(url.searchParams.get('skip') ?? '0', 10) || 0, 0);
  return { items: items.slice(skip, skip + limit), limit, skip };
}

/**
 * The mock session survives a page reload through a cookie, the way the real
 * server-managed session cookie does. In-memory state covers the node test server,
 * where handlers are reset between tests.
 */
function hasSessionCookie(cookies: Record<string, string>): boolean {
  // Service workers cannot read the Cookie header, so MSW hands parsed cookies to the
  // resolver instead.
  return state.cookieSessionsEnabled && cookies.mock_session === '1';
}

function requireSession(cookies: Record<string, string>): Response | null {
  return state.authenticated || hasSessionCookie(cookies) ? null : unauthenticated();
}

export const handlers: HttpHandler[] = [
  // -- authentication ------------------------------------------------------
  http.get(`${BASE}/auth/csrf`, () => HttpResponse.json({ csrfToken: state.csrfToken })),

  http.post(`${BASE}/auth/otp/request`, async ({ request }) => {
    const body = (await request.json()) as {
      phone?: string;
      consent?: boolean;
      requestKey?: string;
    };
    if (!body.consent) {
      return HttpResponse.json(
        {
          code: 'VALIDATION_FAILED',
          message: 'Consent is required before a login code can be sent.',
          fieldErrors: [{ field: 'consent', message: 'required' }],
          correlationId: 'mock-correlation',
        },
        { status: 422 },
      );
    }

    // Idempotent per request key: a network retry never sends a second message.
    const existingId = body.requestKey ? state.requestKeys.get(body.requestKey) : undefined;
    const existing = existingId ? state.challenges.get(existingId) : undefined;
    if (existing) {
      return HttpResponse.json(
        {
          challengeId: existing.challengeId,
          expiresAt: new Date(existing.expiresAt).toISOString(),
          resendAt: new Date(existing.resendAt).toISOString(),
        },
        { status: 202 },
      );
    }

    const challenge: Challenge = {
      challengeId: `challenge-${state.challenges.size + 1}`,
      phone: body.phone ?? '',
      attempts: 0,
      expiresAt: Date.now() + 5 * 60_000,
      resendAt: Date.now() + 60_000,
      consumed: false,
    };
    state.challenges.set(challenge.challengeId, challenge);
    if (body.requestKey) state.requestKeys.set(body.requestKey, challenge.challengeId);

    // The same response shape is returned for unknown, disabled and eligible numbers.
    return HttpResponse.json(
      {
        challengeId: challenge.challengeId,
        expiresAt: new Date(challenge.expiresAt).toISOString(),
        resendAt: new Date(challenge.resendAt).toISOString(),
      },
      { status: 202 },
    );
  }),

  http.post(`${BASE}/auth/otp/resend`, async ({ request }) => {
    const body = (await request.json()) as { challengeId?: string; requestKey?: string };
    const previous = body.challengeId ? state.challenges.get(body.challengeId) : undefined;
    if (!previous) {
      return HttpResponse.json(
        {
          code: 'CHALLENGE_NOT_FOUND',
          message: 'Request a new code.',
          correlationId: 'mock-correlation',
        },
        { status: 422 },
      );
    }
    if (Date.now() < previous.resendAt) {
      return HttpResponse.json(
        {
          code: 'RATE_LIMITED',
          message: 'Wait before requesting another code.',
          correlationId: 'mock-correlation',
        },
        { status: 429, headers: { 'Retry-After': '60' } },
      );
    }
    // The latest successfully queued challenge replaces the previous one.
    const replacement: Challenge = {
      challengeId: `challenge-${state.challenges.size + 1}`,
      phone: previous.phone,
      // Resending does not reset the abuse budget.
      attempts: previous.attempts,
      expiresAt: Date.now() + 5 * 60_000,
      resendAt: Date.now() + 60_000,
      consumed: false,
    };
    state.challenges.delete(previous.challengeId);
    state.challenges.set(replacement.challengeId, replacement);
    return HttpResponse.json({
      challengeId: replacement.challengeId,
      expiresAt: new Date(replacement.expiresAt).toISOString(),
      resendAt: new Date(replacement.resendAt).toISOString(),
    });
  }),

  http.post(`${BASE}/auth/otp/verify`, async ({ request }) => {
    const body = (await request.json()) as { challengeId?: string; code?: string };
    const challenge = body.challengeId ? state.challenges.get(body.challengeId) : undefined;
    const invalid = HttpResponse.json(
      {
        code: 'CHALLENGE_INVALID',
        message: 'That code is not valid or has expired.',
        correlationId: 'mock-correlation',
      },
      { status: 422 },
    );

    if (!challenge || challenge.consumed || Date.now() > challenge.expiresAt) return invalid;
    challenge.attempts += 1;
    if (challenge.attempts > 5) {
      return HttpResponse.json(
        {
          code: 'TOO_MANY_ATTEMPTS',
          message: 'Request a new code.',
          correlationId: 'mock-correlation',
        },
        { status: 429 },
      );
    }
    if (body.code !== fixtures.MOCK_OTP_CODE) return invalid;

    // Consume once; a replay cannot issue another session.
    challenge.consumed = true;
    state.authenticated = true;
    state.csrfToken = 'mock-csrf-authenticated';
    refreshSessionWindow();
    return HttpResponse.json(
      {
        csrfToken: state.csrfToken,
        session: {
          expiresAt: new Date(state.sessionExpiresAt).toISOString(),
          idleExpiresAt: new Date(state.idleExpiresAt).toISOString(),
        },
      },
      { headers: { 'Set-Cookie': 'mock_session=1; Path=/; SameSite=Lax' } },
    );
  }),

  http.post(`${BASE}/auth/session/activity`, ({ cookies }) => {
    if (!state.authenticated && !hasSessionCookie(cookies)) return unauthenticated();
    state.idleExpiresAt = Date.now() + 30 * 60_000;
    return HttpResponse.json({
      session: {
        expiresAt: new Date(state.sessionExpiresAt).toISOString(),
        idleExpiresAt: new Date(state.idleExpiresAt).toISOString(),
      },
    });
  }),

  http.post(`${BASE}/auth/logout`, () => {
    state.authenticated = false;
    state.csrfToken = 'mock-csrf-pre-login';
    return new HttpResponse(null, {
      status: 204,
      headers: { 'Set-Cookie': 'mock_session=; Path=/; Max-Age=0; SameSite=Lax' },
    });
  }),

  http.get(`${BASE}/admin/me`, ({ cookies }) => {
    if (!state.authenticated && !hasSessionCookie(cookies)) return unauthenticated();
    return HttpResponse.json({
      ...fixtures.staffSession,
      session: {
        expiresAt: new Date(state.sessionExpiresAt).toISOString(),
        idleExpiresAt: new Date(state.idleExpiresAt).toISOString(),
      },
    });
  }),

  // -- staff ---------------------------------------------------------------
  http.get(
    `${BASE}/admin/staff`,
    ({ cookies }) => requireSession(cookies) ?? HttpResponse.json({ items: fixtures.staffMembers }),
  ),

  // -- bookings ------------------------------------------------------------
  http.get(`${BASE}/admin/bookings`, ({ request, cookies }) => {
    const blocked = requireSession(cookies);
    if (blocked) return blocked;
    const url = new URL(request.url);
    const status = url.searchParams.get('status');
    const townId = url.searchParams.get('townId');
    const filtered = fixtures.bookings.filter(
      (item) => (!status || item.status === status) && (!townId || item.townId === townId),
    );
    return HttpResponse.json(page(filtered, url));
  }),

  http.get(`${BASE}/admin/bookings/:id`, ({ params, cookies }) => {
    const blocked = requireSession(cookies);
    if (blocked) return blocked;
    const found = fixtures.bookings.find((item) => item._id === params.id);
    if (!found) {
      return HttpResponse.json(
        {
          code: 'BOOKING_NOT_FOUND',
          message: 'Booking not found.',
          correlationId: 'mock-correlation',
        },
        { status: 404 },
      );
    }
    return HttpResponse.json({
      booking: found,
      custodyHistory: fixtures.deliveryEvents.filter((event) => event.bookingId === found._id),
      assignments: fixtures.assignments.filter((assignment) => assignment.bookingId === found._id),
      payments: fixtures.payments.filter((payment) => payment.bookingId === found._id),
      cash: fixtures.cashEntries.filter((entry) => entry.bookingId === found._id),
      quotes: fixtures.quotes.filter((quote) => quote.bookingId === found._id),
    });
  }),

  http.get(
    `${BASE}/admin/bookings/:id/candidates`,
    ({ cookies }) => requireSession(cookies) ?? HttpResponse.json(fixtures.candidateResult),
  ),

  http.post(`${BASE}/admin/bookings/:id/offers`, ({ request, cookies }) => {
    const blocked = requireSession(cookies);
    if (blocked) return blocked;
    if (!request.headers.get('idempotency-key')) {
      return HttpResponse.json(
        {
          code: 'IDEMPOTENCY_KEY_REQUIRED',
          message: 'This operation needs an Idempotency-Key header.',
          correlationId: 'mock-correlation',
        },
        { status: 422 },
      );
    }
    return HttpResponse.json(
      {
        assignmentId: 'assignment-new',
        state: 'OFFERED',
        offerExpiresAt: new Date(Date.now() + 5 * 60_000).toISOString(),
        version: 1,
      },
      { status: 201 },
    );
  }),

  http.patch(`${BASE}/admin/bookings/:id`, ({ params, cookies }) => {
    const blocked = requireSession(cookies);
    if (blocked) return blocked;
    const found = fixtures.bookings.find((item) => item._id === params.id);
    return HttpResponse.json({ booking: found ?? fixtures.bookings[0] });
  }),

  // -- fleet ---------------------------------------------------------------
  http.get(`${BASE}/admin/drivers`, ({ request, cookies }) => {
    const blocked = requireSession(cookies);
    if (blocked) return blocked;
    const url = new URL(request.url);
    const rows = fixtures.drivers.map((driver) => ({
      driver,
      presence: fixtures.presences.find((presence) => presence.driverId === driver._id) ?? null,
    }));
    return HttpResponse.json(page(rows, url));
  }),

  http.get(`${BASE}/admin/vehicles`, ({ request, cookies }) => {
    const blocked = requireSession(cookies);
    if (blocked) return blocked;
    return HttpResponse.json(page(fixtures.vehicles, new URL(request.url)));
  }),

  // -- customers -----------------------------------------------------------
  http.get(`${BASE}/admin/customers`, ({ request, cookies }) => {
    const blocked = requireSession(cookies);
    if (blocked) return blocked;
    const url = new URL(request.url);
    if (!url.searchParams.get('phone') && !url.searchParams.get('townId')) {
      return HttpResponse.json(
        {
          code: 'SEARCH_FILTER_REQUIRED',
          message: 'Search by phone or town.',
          fieldErrors: [{ field: 'phone', message: 'required' }],
          correlationId: 'mock-correlation',
        },
        { status: 422 },
      );
    }
    return HttpResponse.json({ items: fixtures.customerRows });
  }),

  http.get(`${BASE}/admin/customers/:id/risk`, ({ params, cookies }) => {
    const blocked = requireSession(cookies);
    if (blocked) return blocked;
    const detail = fixtures.customerDetails[String(params.id)];
    if (!detail?.risk) return notImplemented('Risk profile for this customer');
    return HttpResponse.json({
      profile: detail.risk,
      recentBookings: fixtures.bookings.slice(0, 3).map((item) => ({
        id: item._id,
        waybill: item.waybill,
        status: item.status,
        paymentMethod: item.payment.method,
        paymentState: item.payment.state,
        amountDueCents: item.payment.amountDueCents,
        createdAt: item.createdAt,
      })),
    });
  }),

  http.get(`${BASE}/admin/customers/:id`, ({ params, cookies }) => {
    const blocked = requireSession(cookies);
    if (blocked) return blocked;
    const detail = fixtures.customerDetails[String(params.id)];
    if (!detail) {
      return HttpResponse.json(
        {
          code: 'CUSTOMER_NOT_FOUND',
          message: 'Customer not found.',
          correlationId: 'mock-correlation',
        },
        { status: 404 },
      );
    }
    return HttpResponse.json(detail);
  }),

  // -- support -------------------------------------------------------------
  http.get(`${BASE}/admin/enquiries`, ({ request, cookies }) => {
    const blocked = requireSession(cookies);
    if (blocked) return blocked;
    const url = new URL(request.url);
    const status = url.searchParams.get('status');
    const filtered = fixtures.enquiries.filter((item) => !status || item.status === status);
    return HttpResponse.json(page(filtered, url));
  }),

  http.post(`${BASE}/admin/enquiries/:id/replies`, async ({ params, request, cookies }) => {
    const blocked = requireSession(cookies);
    if (blocked) return blocked;
    const body = (await request.json()) as { body?: string };
    const found =
      fixtures.enquiries.find((item) => item._id === params.id) ?? fixtures.enquiries[0]!;
    return HttpResponse.json(
      {
        enquiry: {
          ...found,
          version: found.version + 1,
          replies: [
            ...found.replies,
            {
              id: `reply-${found.replies.length + 1}`,
              body: body.body ?? '',
              author: { type: 'OPERATOR', id: 'staff-1', label: 'Tariro M' },
              sentAt: new Date().toISOString(),
              channel: 'WHATSAPP',
            },
          ],
        },
      },
      { status: 201 },
    );
  }),

  // -- finance -------------------------------------------------------------
  http.get(`${BASE}/admin/payments`, ({ request, cookies }) => {
    const blocked = requireSession(cookies);
    if (blocked) return blocked;
    const url = new URL(request.url);
    const status = url.searchParams.get('status');
    const filtered = fixtures.payments.filter((item) => !status || item.status === status);
    return HttpResponse.json(page(filtered, url));
  }),

  http.post(
    `${BASE}/admin/payments/:id/reconcile`,
    ({ cookies }) =>
      requireSession(cookies) ??
      HttpResponse.json({ applied: false, reason: 'NO_PROVIDER_POLL_URL', status: 'UNKNOWN' }),
  ),

  http.get(`${BASE}/admin/cash-ledger`, ({ request, cookies }) => {
    const blocked = requireSession(cookies);
    if (blocked) return blocked;
    return HttpResponse.json(page(fixtures.cashEntries, new URL(request.url)));
  }),

  http.get(`${BASE}/admin/refunds`, ({ request, cookies }) => {
    const blocked = requireSession(cookies);
    if (blocked) return blocked;
    return HttpResponse.json(page(fixtures.refunds, new URL(request.url)));
  }),

  // -- restrictions --------------------------------------------------------
  http.get(`${BASE}/admin/restrictions`, ({ request, cookies }) => {
    const blocked = requireSession(cookies);
    if (blocked) return blocked;
    return HttpResponse.json(page(fixtures.restrictions, new URL(request.url)));
  }),

  http.get(`${BASE}/admin/restrictions/:id`, ({ params, cookies }) => {
    const blocked = requireSession(cookies);
    if (blocked) return blocked;
    const restriction = fixtures.restrictions.find((item) => item._id === params.id);
    if (!restriction) {
      return HttpResponse.json(
        {
          code: 'RESTRICTION_NOT_FOUND',
          message: 'Restriction not found.',
          correlationId: 'mock-correlation',
        },
        { status: 404 },
      );
    }
    return HttpResponse.json({ restriction, fraudReports: fixtures.fraudReports });
  }),

  // -- configuration -------------------------------------------------------
  http.get(
    `${BASE}/admin/towns`,
    ({ cookies }) =>
      requireSession(cookies) ??
      HttpResponse.json({
        items: fixtures.towns.map((town) => ({
          town,
          launchReadiness:
            town.features.bookingEnabled && town.operatingHours.length > 0
              ? { ready: true, missing: [] }
              : { ready: false, missing: ['operatingHours', 'features.bookingEnabled'] },
        })),
      }),
  ),

  http.get(`${BASE}/admin/zones`, ({ request, cookies }) => {
    const blocked = requireSession(cookies);
    if (blocked) return blocked;
    const townId = new URL(request.url).searchParams.get('townId');
    return HttpResponse.json({
      items: fixtures.zones.filter((zone) => !townId || zone.townId === townId),
    });
  }),

  http.get(`${BASE}/admin/rate-cards`, ({ request, cookies }) => {
    const blocked = requireSession(cookies);
    if (blocked) return blocked;
    const townId = new URL(request.url).searchParams.get('townId');
    return HttpResponse.json({
      items: fixtures.rateCards.filter((card) => !townId || card.townId === townId),
    });
  }),

  http.get(`${BASE}/admin/parcel-presets`, ({ request, cookies }) => {
    const blocked = requireSession(cookies);
    if (blocked) return blocked;
    const townId = new URL(request.url).searchParams.get('townId');
    return HttpResponse.json({
      items: fixtures.parcelPresets.filter((preset) => !townId || preset.townId === townId),
    });
  }),

  // -- operations ----------------------------------------------------------
  http.get(`${BASE}/admin/audit-events`, ({ request, cookies }) => {
    const blocked = requireSession(cookies);
    if (blocked) return blocked;
    return HttpResponse.json(page(fixtures.auditEvents, new URL(request.url)));
  }),

  http.get(
    `${BASE}/admin/operations/alerts`,
    ({ cookies }) =>
      requireSession(cookies) ??
      HttpResponse.json({
        notificationFailures: fixtures.notificationFailures,
        stuckPayments: fixtures.payments.filter((payment) => payment.status === 'UNKNOWN'),
      }),
  ),

  http.get(
    `${BASE}/admin/media/:id/link`,
    ({ params, cookies }) =>
      requireSession(cookies) ??
      HttpResponse.json({
        url: `https://media.example.invalid/${String(params.id)}.jpg`,
        expiresAt: new Date(Date.now() + 10 * 60_000).toISOString(),
        contentType: 'image/jpeg',
        bytes: 184_320,
      }),
  ),

  // The dashboard summary is a documented backend addition; the mock answers the way an
  // unimplemented endpoint does so the fallback presentation can be exercised.
  http.get(
    `${BASE}/admin/overview`,
    ({ cookies }) => requireSession(cookies) ?? notImplemented('GET /api/v1/admin/overview'),
  ),
];
