import { fireEvent, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { HttpResponse, http } from 'msw';
import { describe, expect, it } from 'vitest';

import type { WireRateCard, WireTown } from '@/api/dto/configuration';
import { routes } from '@/app/router';
import { slugify } from '@/features/configuration/slug';
import { rateCards, staffSession, towns } from '@/mocks/fixtures';
import { resetMockState } from '@/mocks/handlers';
import { mockServer } from '@/mocks/server';
import { renderRoutes } from './testUtils';

const AREA =
  '{"type":"Polygon","coordinates":[[[25.8,-17.95],[25.9,-17.95],[25.9,-17.9],[25.8,-17.9],[25.8,-17.95]]]}';

function townRows(list: WireTown[], missing: string[] = []) {
  return {
    items: list.map((town) => ({
      town,
      launchReadiness: { ready: missing.length === 0, missing },
    })),
  };
}

describe('first town setup', () => {
  it('adds the first town from an empty deployment', async () => {
    resetMockState({ authenticated: true });
    const created: WireTown[] = [];
    let body: Record<string, unknown> | undefined;
    mockServer.use(
      http.get('/api/v1/admin/towns', () => HttpResponse.json(townRows(created, ['zones']))),
      http.post('/api/v1/admin/towns', async ({ request }) => {
        body = (await request.json()) as Record<string, unknown>;
        const town: WireTown = {
          ...towns[0]!,
          _id: 'town-falls',
          version: 1,
          slug: body.slug as string,
          name: body.name as string,
          operatingHours: [],
          policy: {},
          features: { ...towns[0]!.features, bookingEnabled: false },
        };
        created.push(town);
        return HttpResponse.json({ town }, { status: 201 });
      }),
    );
    const user = userEvent.setup();
    renderRoutes({ routes, initialEntries: ['/configuration/towns'] });

    expect(await screen.findByText('No towns configured')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Add town' }));
    const dialog = await screen.findByRole('dialog', { name: 'Add a town' });
    const create = within(dialog).getByRole('button', { name: 'Create town' });
    expect(create).toBeDisabled();

    await user.type(within(dialog).getByRole('textbox', { name: /Town name/ }), 'Victoria Falls');
    expect(within(dialog).getByRole('textbox', { name: /Slug/ })).toHaveValue('victoria-falls');
    await user.click(within(dialog).getByRole('textbox', { name: /Service area/ }));
    await user.paste(AREA);
    expect(
      within(dialog).getByText(/Polygon with 1 ring\(s\) and 5 position\(s\)/),
    ).toBeInTheDocument();

    await user.click(create);
    await waitFor(() => expect(body).toBeDefined());
    expect(body).toMatchObject({
      name: 'Victoria Falls',
      slug: 'victoria-falls',
      timezone: 'Africa/Harare',
      serviceArea: JSON.parse(AREA),
    });
    expect(await screen.findByText('Victoria Falls')).toBeInTheDocument();
  });

  it('offers town creation only to an administrator for all towns', async () => {
    resetMockState({ authenticated: true });
    mockServer.use(
      http.get('/api/v1/admin/me', () =>
        HttpResponse.json({
          ...staffSession,
          roles: ['admin', 'operator'],
          townAccess: { allTowns: false, towns: [{ id: 'town-hwange', name: 'Hwange' }] },
        }),
      ),
    );
    renderRoutes({ routes, initialEntries: ['/configuration/towns'] });
    expect((await screen.findAllByRole('button', { name: 'Edit' })).length).toBeGreaterThan(0);
    expect(screen.queryByRole('button', { name: 'Add town' })).not.toBeInTheDocument();
  });

  it('lists what a town still needs, linking to the page that configures it', async () => {
    resetMockState({ authenticated: true });
    mockServer.use(
      http.get('/api/v1/admin/towns', () =>
        HttpResponse.json(
          townRows([towns[0]!], ['policy.liabilityTerms', 'zones', 'publishedRateCard', 'fleet']),
        ),
      ),
    );
    renderRoutes({ routes, initialEntries: ['/configuration/towns'] });

    expect(await screen.findByText('Liability terms')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'At least one zone' })).toHaveAttribute(
      'href',
      '/configuration/zones?town=town-hwange',
    );
    expect(screen.getByRole('link', { name: 'A published rate card in force' })).toHaveAttribute(
      'href',
      '/configuration/rates?town=town-hwange',
    );
    expect(
      screen.getByRole('link', { name: 'An active driver with an in-service vehicle' }),
    ).toBeInTheDocument();
  });

  it('edits operating hours and exposure limits, refusing a window that closes before it opens', async () => {
    resetMockState({ authenticated: true });
    let body: Record<string, unknown> | undefined;
    mockServer.use(
      http.patch('/api/v1/admin/towns/:id', async ({ request }) => {
        body = (await request.json()) as Record<string, unknown>;
        return HttpResponse.json({ town: towns[0] });
      }),
    );
    const user = userEvent.setup();
    renderRoutes({ routes, initialEntries: ['/configuration/towns'] });

    // The first row is Hwange, whose fixture opens Monday and Tuesday.
    await user.click((await screen.findAllByRole('button', { name: 'Edit' }))[0]!);
    const dialog = await screen.findByRole('dialog');
    const save = within(dialog).getByRole('button', { name: 'Save town' });

    await user.click(within(dialog).getByRole('checkbox', { name: 'Wednesday' }));
    fireEvent.change(within(dialog).getByLabelText('Wednesday closes'), {
      target: { value: '07:00' },
    });
    expect(within(dialog).getByText('Must open before it closes.')).toBeInTheDocument();
    expect(save).toBeDisabled();
    fireEvent.change(within(dialog).getByLabelText('Wednesday closes'), {
      target: { value: '18:30' },
    });
    expect(save).toBeEnabled();

    await user.type(
      within(dialog).getByRole('textbox', { name: 'Open cash bookings per customer' }),
      '2',
    );
    await user.click(save);

    await waitFor(() => expect(body).toBeDefined());
    expect(body!.operatingHours).toEqual([
      { day: 1, opensAt: '08:00', closesAt: '17:00' },
      { day: 2, opensAt: '08:00', closesAt: '17:00' },
      { day: 3, opensAt: '08:00', closesAt: '18:30' },
    ]);
    expect(body!.riskControls).toEqual({ codExposure: { maxOpenBookings: 2 } });
    // The boundary was not touched, so it is not re-sent.
    expect(body!.serviceArea).toBeUndefined();
  });

  it('suggests a slug from a town name', () => {
    expect(slugify('  Victoria Falls ')).toBe('victoria-falls');
    expect(slugify('Lupane / Ŝt. Paul')).toBe('lupane-st-paul');
  });
});

describe('rate cards for a new town', () => {
  const published = rateCards.find((card) => card.status === 'PUBLISHED')!;
  const draft = rateCards.find((card) => card.status === 'DRAFT')!;

  it('saves edits to a published card as a new draft version', async () => {
    resetMockState({ authenticated: true });
    let body: Record<string, unknown> | undefined;
    mockServer.use(
      http.get('/api/v1/admin/rate-cards', () => HttpResponse.json({ items: [published] })),
      http.post('/api/v1/admin/rate-cards', async ({ request }) => {
        body = (await request.json()) as Record<string, unknown>;
        const card: WireRateCard = {
          ...published,
          _id: 'rate-card-new',
          version: 4,
          status: 'DRAFT',
        };
        return HttpResponse.json({ rateCard: card }, { status: 201 });
      }),
    );
    const user = userEvent.setup();
    renderRoutes({ routes, initialEntries: ['/configuration/rates?town=town-hwange'] });

    expect(
      await screen.findByText(/cannot change\. Edits are saved as a new draft/),
    ).toBeInTheDocument();
    const cell = await screen.findByRole('textbox', { name: 'Price CBD to COLLIERY' });
    await user.clear(cell);
    await user.type(cell, '5.25');
    await user.click(screen.getByRole('button', { name: 'Save as new draft' }));

    await waitFor(() => expect(body).toBeDefined());
    expect(body!.townId).toBe('town-hwange');
    expect(body!.extras).toEqual(published.extras);
    expect(body!.zonePairRates).toContainEqual({
      fromZoneCode: 'CBD',
      toZoneCode: 'COLLIERY',
      parcelClass: 'MEDIUM',
      priceCents: 525,
    });
    // The other classes on the published card are carried over unchanged.
    expect(body!.zonePairRates).toContainEqual({
      fromZoneCode: 'CBD',
      toZoneCode: 'EMPUMALANGA',
      parcelClass: 'SMALL',
      priceCents: 350,
    });
  });

  it('creates the first draft for a town that has no rate card', async () => {
    resetMockState({ authenticated: true });
    let body: Record<string, unknown> | undefined;
    mockServer.use(
      http.get('/api/v1/admin/rate-cards', () => HttpResponse.json({ items: [] })),
      http.post('/api/v1/admin/rate-cards', async ({ request }) => {
        body = (await request.json()) as Record<string, unknown>;
        return HttpResponse.json(
          { rateCard: { ...draft, _id: 'rate-card-first' } },
          { status: 201 },
        );
      }),
    );
    const user = userEvent.setup();
    renderRoutes({ routes, initialEntries: ['/configuration/rates?town=town-hwange'] });

    expect(await screen.findByText(/no rate card yet/)).toBeInTheDocument();
    await user.type(screen.getByRole('textbox', { name: 'Price CBD to CBD' }), '2');
    await user.type(screen.getByRole('textbox', { name: 'Tax treatment' }), 'Prices include VAT.');
    await user.click(screen.getByRole('button', { name: 'Save as new draft' }));

    await waitFor(() => expect(body).toBeDefined());
    expect(body).toEqual({
      townId: 'town-hwange',
      zonePairRates: [
        { fromZoneCode: 'CBD', toZoneCode: 'CBD', parcelClass: 'MEDIUM', priceCents: 200 },
      ],
      extras: [],
      taxTreatment: 'Prices include VAT.',
    });
  });

  it('warns about placeholders on a draft and removes a combination whose cell is cleared', async () => {
    resetMockState({ authenticated: true });
    const seeded: WireRateCard = {
      ...draft,
      zonePairRates: [
        { fromZoneCode: 'CBD', toZoneCode: 'CBD', parcelClass: 'MEDIUM', priceCents: 0 },
        { fromZoneCode: 'CBD', toZoneCode: 'COLLIERY', parcelClass: 'MEDIUM', priceCents: 400 },
      ],
      taxTreatment: 'PLACEHOLDER: state the applicable tax treatment before launch.',
    };
    let body: Record<string, unknown> | undefined;
    mockServer.use(
      http.get('/api/v1/admin/rate-cards', () => HttpResponse.json({ items: [seeded] })),
      http.patch('/api/v1/admin/rate-cards/:id', async ({ request }) => {
        body = (await request.json()) as Record<string, unknown>;
        return HttpResponse.json({ rateCard: seeded });
      }),
    );
    const user = userEvent.setup();
    renderRoutes({ routes, initialEntries: ['/configuration/rates?town=town-hwange'] });

    expect(await screen.findByText(/1 price\(s\) are \$0\.00/)).toBeInTheDocument();
    expect(screen.getByText(/the tax treatment is a placeholder/)).toBeInTheDocument();

    await user.clear(screen.getByRole('textbox', { name: 'Price CBD to CBD' }));
    await user.click(screen.getByRole('button', { name: 'Save draft' }));

    await waitFor(() => expect(body).toBeDefined());
    expect(body!.zonePairRates).toEqual([
      { fromZoneCode: 'CBD', toZoneCode: 'COLLIERY', parcelClass: 'MEDIUM', priceCents: 400 },
    ]);
    expect(body).not.toHaveProperty('taxTreatment');
  });
});
