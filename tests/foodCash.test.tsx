import { act, fireEvent, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { HttpResponse, http } from 'msw';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type { DriverCashBalance, FoodCashEntry } from '@/api/dto/foodFinance';
import { baseApi } from '@/api/baseApi';
import { AuthContext } from '@/auth/AuthProvider';
import { appConfig } from '@/config';
import { FoodCashPanel } from '@/features/finance/FoodCashPanel';
import type { StaffSession } from '@/lib/permissions';
import { mockServer } from '@/mocks/server';
import { renderRoutes } from './testUtils';

const session: StaffSession = {
  user: { id: 'finance-1', name: 'Finance', maskedPhone: '…0101' },
  roles: ['finance'],
  capabilities: ['cash.remit', 'food.settlements.read', 'food.settlements.adjust'],
  townAccess: { allTowns: false, towns: [{ id: 'town-1', name: 'Hwange' }] },
  session: { expiresAt: '2027-01-01T00:00:00Z', idleExpiresAt: '2027-01-01T00:00:00Z' },
};
const collection: FoodCashEntry = {
  _id: 'collection-1',
  version: 3,
  createdAt: '2026-10-28T08:00:00Z',
  updatedAt: '2026-10-28T08:00:00Z',
  occurredAt: '2026-10-28T08:00:00Z',
  bookingId: 'booking-1',
  townId: 'town-1',
  driverId: 'rider-1',
  entryType: 'COLLECTION',
  state: 'COLLECTED_BY_DRIVER',
  amountDueCents: 1000,
  amountReceivedCents: 1000,
  payerRole: 'SENDER',
  recordedBy: { type: 'OPERATOR', id: 'operator-1' },
  linkedEntryIds: [],
  foodOrderIds: ['food-order-1'],
  receiptReference: 'collection-receipt',
};
const mismatch: FoodCashEntry = {
  ...collection,
  _id: 'discrepancy-1',
  entryType: 'DISCREPANCY',
  state: 'DISCREPANCY',
  amountReceivedCents: 800,
  handInId: 'hand-in-1',
  recordedBy: { type: 'FINANCE', id: 'finance-1' },
  linkedEntryIds: ['collection-1', 'hand-in-1'],
  discrepancy: {
    handInId: 'hand-in-1',
    status: 'OPEN',
    expectedCents: 1000,
    receivedCents: 800,
    differenceCents: -200,
    currentReceivedCents: 800,
    outstandingCents: 200,
    overageCents: 0,
    reason: 'Original counted shortage',
    evidence: 'Receipt photo A',
  },
};
const driver: DriverCashBalance = {
  driverId: 'rider-1',
  townId: 'town-1',
  expectedCents: 1000,
  receivedCents: 0,
  differenceCents: -1000,
  unremittedCollectionCents: 1000,
  unresolvedShortfallCents: 0,
  outstandingCents: 1000,
  overageCents: 0,
  entries: [collection],
  discrepancies: [],
};

function fixtures(discrepancy: FoodCashEntry | null = null) {
  mockServer.use(
    http.get('/api/v1/admin/food/shop-balances', () =>
      HttpResponse.json({ items: [], nextCursor: null }),
    ),
    http.get('/api/v1/admin/cash-outstanding', () =>
      HttpResponse.json({
        expectedCents: driver.expectedCents,
        receivedCents: driver.receivedCents,
        differenceCents: driver.differenceCents,
        outstandingCents: driver.outstandingCents,
        overageCents: driver.overageCents,
        drivers: [driver],
      }),
    ),
    http.get('/api/v1/admin/cash-discrepancies', () =>
      HttpResponse.json({ items: discrepancy ? [discrepancy] : [] }),
    ),
    http.get('/api/v1/admin/cash-discrepancies/discrepancy-1', () =>
      HttpResponse.json({ entry: discrepancy }),
    ),
  );
}

function renderPanel(activeSession = session) {
  return renderRoutes({
    routes: [
      {
        path: '/finance/cash',
        element: (
          <AuthContext.Provider
            value={{
              status: 'authenticated',
              session: activeSession,
              error: undefined,
              refresh: vi.fn(),
              signOut: async () => {},
              signingOut: false,
            }}
          >
            <FoodCashPanel />
          </AuthContext.Provider>
        ),
      },
    ],
    initialEntries: ['/finance/cash'],
  });
}

async function openHandIn(user: ReturnType<typeof userEvent.setup>) {
  await user.click(await screen.findByRole('combobox', { name: 'Rider for cash hand-in' }));
  await user.click(await screen.findByRole('option', { name: 'Rider rider-1' }));
  await user.click(await screen.findByRole('checkbox', { name: 'Select collection collection-1' }));
  await user.click(screen.getByRole('button', { name: 'Record actual hand-in' }));
  return screen.getByRole('dialog', { name: 'Record actual rider hand-in' });
}

describe('food cash reconciliation', () => {
  const previousFlag = appConfig.enableFoodSettlements;
  beforeEach(() => {
    appConfig.enableFoodSettlements = true;
  });
  afterEach(() => {
    appConfig.enableFoodSettlements = previousFlag;
  });

  it('keeps tools hidden for a disabled build or an account without finance access', () => {
    appConfig.enableFoodSettlements = false;
    const mounted = renderPanel();
    expect(screen.queryByText('Rider cash hand-ins and discrepancies')).not.toBeInTheDocument();
    mounted.unmount();
    appConfig.enableFoodSettlements = true;
    renderPanel({ ...session, roles: ['admin'] });
    expect(screen.queryByText('Rider cash hand-ins and discrepancies')).not.toBeInTheDocument();
  });

  it('does not query cash or expose a hand-in when the deployed settlement API is disabled', async () => {
    const cashRead = vi.fn();
    mockServer.use(
      http.get('/api/v1/admin/food/shop-balances', () =>
        HttpResponse.json(
          { code: 'FOOD_SETTLEMENTS_DISABLED', message: 'Settlement tools are disabled.' },
          { status: 403 },
        ),
      ),
      http.get('/api/v1/admin/cash-outstanding', () => {
        cashRead();
        return HttpResponse.json({});
      }),
    );
    renderPanel();
    expect(
      await screen.findByText(
        'Food cash tools are unavailable until the settlement service is enabled.',
      ),
    ).toBeInTheDocument();
    expect(cashRead).not.toHaveBeenCalled();
    expect(screen.queryByRole('button', { name: 'Record actual hand-in' })).not.toBeInTheDocument();
  });

  it('captures a shortage using immutable collection versions and retains a rejected draft', async () => {
    fixtures();
    const seen = vi.fn();
    mockServer.use(
      http.post('/api/v1/admin/drivers/rider-1/cash-remittances', async ({ request }) => {
        seen({ body: await request.json(), key: request.headers.get('Idempotency-Key') });
        return HttpResponse.json(
          { code: 'VERSION_CONFLICT', message: 'A collection changed.' },
          { status: 409 },
        );
      }),
    );
    renderPanel();
    const user = userEvent.setup();
    const dialog = await openHandIn(user);
    fireEvent.change(within(dialog).getByLabelText(/Actual cash received/), {
      target: { value: '8.00' },
    });
    fireEvent.change(within(dialog).getByLabelText(/Hand-in receipt reference/), {
      target: { value: 'receipt-8' },
    });
    fireEvent.change(within(dialog).getByLabelText(/Hand-in reason/), {
      target: { value: 'Counted cash short' },
    });
    fireEvent.change(within(dialog).getByLabelText(/Hand-in evidence/), {
      target: { value: 'Receipt photo' },
    });
    await user.click(within(dialog).getByRole('checkbox', { name: /I checked the receipts/ }));
    await user.click(within(dialog).getByRole('button', { name: 'Confirm actual hand-in' }));
    expect(await within(dialog).findByText('A collection changed.')).toBeInTheDocument();
    expect(seen).toHaveBeenCalledWith({
      key: expect.any(String),
      body: {
        ledgerEntryIds: ['collection-1'],
        amountReceivedCents: 800,
        collectionVersions: { 'collection-1': 3 },
        receiptReference: 'receipt-8',
        reason: 'Counted cash short',
        evidence: 'Receipt photo',
      },
    });
    expect(within(dialog).getByLabelText(/Actual cash received/)).toHaveValue('8.00');
    expect(within(dialog).getByLabelText(/Hand-in reason/)).toHaveValue('Counted cash short');
    expect(within(dialog).getByRole('button', { name: 'Confirm actual hand-in' })).toBeDisabled();
    expect(seen).toHaveBeenCalledTimes(1);
    expect(within(dialog).queryByText('Actual cash hand-in recorded.')).not.toBeInTheDocument();
  });

  it('hides loaded balances, evidence and an open hand-in when a cash read loses access', async () => {
    fixtures(mismatch);
    const mounted = renderPanel();
    const user = userEvent.setup();
    await openHandIn(user);
    mockServer.use(
      http.get('/api/v1/admin/cash-outstanding', () =>
        HttpResponse.json({ message: 'Cash access revoked.' }, { status: 403 }),
      ),
    );
    act(() => {
      mounted.store.dispatch(baseApi.util.invalidateTags(['FoodCash']));
    });
    expect(
      await screen.findByText(
        'Cash access changed. Previously loaded balances, evidence and forms are hidden.',
      ),
    ).toBeInTheDocument();
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(screen.queryByText('Expected from collections')).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Inspect discrepancy-1' })).not.toBeInTheDocument();
    expect(
      screen.queryByRole('checkbox', { name: 'Select collection collection-1' }),
    ).not.toBeInTheDocument();
  });

  it('replays an unconfirmed over-hand-in with the identical payload and operation key', async () => {
    fixtures();
    const seen: Array<{ key: string | null; body: unknown }> = [];
    mockServer.use(
      http.post('/api/v1/admin/drivers/rider-1/cash-remittances', async ({ request }) => {
        seen.push({ key: request.headers.get('Idempotency-Key'), body: await request.json() });
        if (seen.length === 1)
          return HttpResponse.json({ message: 'Response lost.' }, { status: 503 });
        return HttpResponse.json(
          {
            entry: {
              ...collection,
              _id: 'hand-in-2',
              handIn: { expectedCents: 1000, receivedCents: 1200, differenceCents: 200 },
            },
            discrepancy: {
              ...mismatch,
              discrepancy: {
                ...mismatch.discrepancy,
                receivedCents: 1200,
                differenceCents: 200,
                outstandingCents: 0,
                overageCents: 200,
              },
            },
          },
          { status: 201 },
        );
      }),
    );
    const mounted = renderPanel();
    const user = userEvent.setup();
    const dialog = await openHandIn(user);
    fireEvent.change(within(dialog).getByLabelText(/Actual cash received/), {
      target: { value: '12' },
    });
    fireEvent.change(within(dialog).getByLabelText(/Hand-in receipt reference/), {
      target: { value: 'receipt-over' },
    });
    fireEvent.change(within(dialog).getByLabelText(/Hand-in reason/), {
      target: { value: 'Two extra dollars' },
    });
    await user.click(within(dialog).getByRole('checkbox', { name: /I checked the receipts/ }));
    await user.click(within(dialog).getByRole('button', { name: 'Confirm actual hand-in' }));
    expect(
      await within(dialog).findByRole('button', { name: 'Retry the same request' }),
    ).toBeInTheDocument();
    expect(within(dialog).getByLabelText(/Actual cash received/)).toBeDisabled();
    expect(within(dialog).getByRole('button', { name: 'Cancel' })).toBeDisabled();
    mockServer.use(
      http.get('/api/v1/admin/food/shop-balances', () =>
        HttpResponse.json({ message: 'Service refresh unavailable.' }, { status: 503 }),
      ),
    );
    act(() => {
      mounted.store.dispatch(baseApi.util.invalidateTags(['FoodBalance']));
    });
    expect(await screen.findByText('Service refresh unavailable.')).toBeInTheDocument();
    expect(screen.getByRole('dialog', { name: 'Record actual rider hand-in' })).toBe(dialog);
    await user.click(within(dialog).getByRole('button', { name: 'Retry the same request' }));
    await waitFor(() => expect(seen).toHaveLength(2));
    expect(seen[1]).toEqual(seen[0]);
    expect(seen[0].key).toBeTruthy();
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
  });

  it('appends an audited resolution while keeping the original hand-in evidence visible', async () => {
    fixtures(mismatch);
    let current = structuredClone(mismatch);
    const seen = vi.fn();
    mockServer.use(
      http.get('/api/v1/admin/cash-discrepancies', () => HttpResponse.json({ items: [current] })),
      http.get('/api/v1/admin/cash-discrepancies/discrepancy-1', () =>
        HttpResponse.json({ entry: current }),
      ),
      http.post('/api/v1/admin/cash-discrepancies/discrepancy-1/resolve', async ({ request }) => {
        seen({ body: await request.json(), key: request.headers.get('Idempotency-Key') });
        current = {
          ...current,
          version: 4,
          linkedEntryIds: [...current.linkedEntryIds, 'correction-1'],
          discrepancy: {
            ...current.discrepancy!,
            status: 'RESOLVED',
            currentReceivedCents: 1000,
            outstandingCents: 0,
            resolution: {
              kind: 'CASH_RECEIVED',
              reason: 'Rider handed in the rest',
              evidence: 'Receipt B',
              actor: { type: 'FINANCE', id: 'finance-1' },
              resolvedAt: '2026-10-28T09:00:00Z',
              correctionEntryId: 'correction-1',
            },
          },
        };
        return HttpResponse.json({
          discrepancy: current,
          correction: { ...collection, _id: 'correction-1', entryType: 'CORRECTION' },
        });
      }),
    );
    renderPanel();
    const user = userEvent.setup();
    await user.click(await screen.findByRole('button', { name: 'Inspect discrepancy-1' }));
    await user.click(await screen.findByRole('button', { name: 'Resolve discrepancy' }));
    const dialog = screen.getByRole('dialog', { name: 'Resolve cash discrepancy' });
    expect(within(dialog).getByText('Original evidence: Receipt photo A')).toBeInTheDocument();
    fireEvent.change(within(dialog).getByLabelText(/Cash movement amount/), {
      target: { value: '2' },
    });
    fireEvent.change(within(dialog).getByLabelText(/Resolution reason/), {
      target: { value: 'Rider handed in the rest' },
    });
    fireEvent.change(within(dialog).getByLabelText(/Resolution evidence/), {
      target: { value: 'Receipt B' },
    });
    await user.click(within(dialog).getByRole('checkbox', { name: /I reviewed version 3/ }));
    await user.click(within(dialog).getByRole('button', { name: 'Record audited correction' }));
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
    expect(seen).toHaveBeenCalledWith({
      key: expect.any(String),
      body: {
        expectedVersion: 3,
        resolution: 'CASH_RECEIVED',
        amountCents: 200,
        reason: 'Rider handed in the rest',
        evidence: 'Receipt B',
      },
    });
    await user.click(screen.getByRole('button', { name: 'Inspect discrepancy-1' }));
    const evidenceDialog = await screen.findByRole('dialog', { name: 'Cash hand-in evidence' });
    expect(
      await within(evidenceDialog).findByText('Original reason: Original counted shortage'),
    ).toBeInTheDocument();
    expect(
      within(evidenceDialog).getByText('Original evidence: Receipt photo A'),
    ).toBeInTheDocument();
    expect(
      within(evidenceDialog).getByText(/Correction ledger entry: correction-1/),
    ).toBeInTheDocument();
    expect(
      within(evidenceDialog).queryByRole('button', { name: 'Resolve discrepancy' }),
    ).not.toBeInTheDocument();
  });
});
