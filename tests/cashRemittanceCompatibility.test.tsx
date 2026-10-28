import { fireEvent, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { HttpResponse, http } from 'msw';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { AuthContext } from '@/auth/AuthProvider';
import { appConfig } from '@/config';
import { CashPage } from '@/features/finance/CashPage';
import type { StaffSession } from '@/lib/permissions';
import { cashEntries } from '@/mocks/fixtures';
import { mockServer } from '@/mocks/server';
import { renderRoutes } from './testUtils';

const session: StaffSession = {
  user: { id: 'finance-1', name: 'Finance', maskedPhone: '…0101' },
  roles: ['finance'],
  capabilities: ['cash.remit'],
  townAccess: { allTowns: false, towns: [{ id: 'town-hwange', name: 'Hwange' }] },
  session: { expiresAt: '2027-01-01T00:00:00Z', idleExpiresAt: '2027-01-01T00:00:00Z' },
};

describe('existing cash remittance API compatibility', () => {
  const previousFlag = appConfig.enableFoodSettlements;
  beforeEach(() => {
    appConfig.enableFoodSettlements = false;
  });
  afterEach(() => {
    appConfig.enableFoodSettlements = previousFlag;
  });

  it('sends the selected collection version with the settlement UI disabled', async () => {
    const selected = {
      ...cashEntries[0],
      _id: 'cash-1',
      version: 7,
      townId: 'town-hwange',
      driverId: 'driver-1',
      amountDueCents: 300,
      amountReceivedCents: 500,
      changeGivenCents: 200,
      entryType: 'COLLECTION',
      state: 'COLLECTED_BY_DRIVER',
    };
    const recorded = vi.fn();
    mockServer.use(
      http.get('/api/v1/admin/cash-ledger', () =>
        HttpResponse.json({
          items: [selected, { ...selected, _id: 'cash-2', version: 19 }],
        }),
      ),
      http.post('/api/v1/admin/drivers/driver-1/cash-remittances', async ({ request }) => {
        recorded({ body: await request.json(), key: request.headers.get('Idempotency-Key') });
        return HttpResponse.json({ entry: { ...selected, state: 'REMITTED' } }, { status: 201 });
      }),
    );
    renderRoutes({
      routes: [
        {
          path: '/finance/cash',
          element: (
            <AuthContext.Provider
              value={{
                status: 'authenticated',
                session,
                error: undefined,
                refresh: vi.fn(),
                signOut: async () => {},
                signingOut: false,
              }}
            >
              <CashPage />
            </AuthContext.Provider>
          ),
        },
      ],
      initialEntries: ['/finance/cash?town=town-hwange&driver=driver-1'],
    });
    const user = userEvent.setup();
    await user.click(await screen.findByRole('checkbox', { name: 'Select ledger entry cash-1' }));
    await user.click(screen.getByRole('button', { name: 'Record remittance' }));
    const dialog = screen.getByRole('dialog', { name: 'Record a cash remittance' });
    expect(within(dialog).getByLabelText(/Amount handed in/)).toHaveValue('3.00');
    fireEvent.change(within(dialog).getByLabelText(/Receipt reference/), {
      target: { value: 'receipt-existing-cash' },
    });
    await user.click(within(dialog).getByRole('button', { name: 'Record remittance' }));

    await waitFor(() => expect(recorded).toHaveBeenCalledOnce());
    expect(recorded).toHaveBeenCalledWith({
      key: expect.any(String),
      body: {
        ledgerEntryIds: ['cash-1'],
        collectionVersions: { 'cash-1': 7 },
        amountCents: 300,
        receiptReference: 'receipt-existing-cash',
      },
    });
    expect(screen.queryByText('Rider cash hand-ins and discrepancies')).not.toBeInTheDocument();
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
  });
});
