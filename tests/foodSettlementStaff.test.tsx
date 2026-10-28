import { fireEvent, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { http, HttpResponse } from 'msw';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { Outlet } from 'react-router-dom';

import type { FoodSettlement } from '@/api/dto/foodFinance';
import { AuthContext } from '@/auth/AuthProvider';
import { appConfig } from '@/config';
import { FoodSettlementPage } from '@/features/finance/FoodSettlementPage';
import { FoodSettlementsPage } from '@/features/finance/FoodSettlementsPage';
import { hararePaymentInstant, hararePeriodInstant } from '@/features/finance/foodFinanceTime';
import type { StaffSession } from '@/lib/permissions';
import { mockServer } from '@/mocks/server';
import { foodAgreement, foodBalance, foodDestination, foodSettlement } from './foodFinanceFixture';
import { renderRoutes } from './testUtils';

const initialFlag = appConfig.enableFoodSettlements;
const capabilities = ['read', 'create', 'approve', 'void', 'pay', 'reveal'].map(
  (action) => `food.settlements.${action}`,
);
function staff(role: 'admin' | 'finance' | 'operator'): StaffSession {
  return {
    user: { id: `${role}-1`, name: role, maskedPhone: '••••0010' },
    roles: [role],
    townAccess: { allTowns: false, towns: [{ id: 'town-1', name: 'Hwange' }] },
    capabilities,
    session: { expiresAt: '2030-01-01T00:00:00Z', idleExpiresAt: '2030-01-01T00:00:00Z' },
  };
}
function mount(session = staff('finance'), path = '/finance/food-settlements') {
  return renderRoutes({
    initialEntries: [path],
    routes: [
      {
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
            <Outlet />
          </AuthContext.Provider>
        ),
        children: [
          { path: '/finance/food-settlements', element: <FoodSettlementsPage /> },
          { path: '/finance/food-settlements/:id', element: <FoodSettlementPage /> },
        ],
      },
    ],
  });
}
function reads(statement: () => FoodSettlement | null, shopVersion: () => number = () => 7) {
  mockServer.use(
    http.get('*/api/v1/admin/food/shop-balances', () =>
      HttpResponse.json({ items: [foodBalance], nextCursor: null }),
    ),
    http.get('*/api/v1/admin/food/settlements', () =>
      HttpResponse.json({ items: statement() ? [statement()] : [], nextCursor: null }),
    ),
    http.get('*/api/v1/admin/food/settlements/settlement-1', () =>
      HttpResponse.json({ settlement: statement() }),
    ),
    http.get('*/api/v1/admin/food/shops/shop-1/settlement-agreement', () =>
      HttpResponse.json({ agreement: foodAgreement, shopVersion: shopVersion() }),
    ),
    http.get('*/api/v1/admin/food/shops/shop-1/payout-details', () =>
      HttpResponse.json({ payoutDetails: foodDestination, shopVersion: shopVersion() }),
    ),
  );
}
beforeEach(() => {
  appConfig.enableFoodSettlements = true;
});
afterEach(() => {
  appConfig.enableFoodSettlements = initialFlag;
});

describe('staff food settlements', () => {
  it.each(['admin', 'finance'] as const)(
    'lets a %s-only account generate, inspect, approve and record an external payment',
    async (role) => {
      const user = userEvent.setup();
      let statement: FoodSettlement | null = null;
      const commands: Array<{
        operation: string;
        body: Record<string, unknown>;
        key: string | null;
      }> = [];
      reads(() => statement);
      mockServer.use(
        http.post('*/api/v1/admin/food/settlements', async ({ request }) => {
          commands.push({
            operation: 'draft',
            body: (await request.json()) as Record<string, unknown>,
            key: request.headers.get('Idempotency-Key'),
          });
          statement = { ...structuredClone(foodSettlement), payoutAt: '2026-10-26T22:00:00.000Z' };
          return HttpResponse.json({ settlement: statement }, { status: 201 });
        }),
        http.post('*/api/v1/admin/food/settlements/settlement-1/approve', async ({ request }) => {
          commands.push({
            operation: 'approve',
            body: (await request.json()) as Record<string, unknown>,
            key: request.headers.get('Idempotency-Key'),
          });
          statement = {
            ...statement!,
            status: 'APPROVED',
            version: 2,
            approvedAt: '2026-10-27T08:00:00.000Z',
            approvedBy: { type: role === 'admin' ? 'ADMIN' : 'FINANCE', id: `${role}-1` },
          };
          return HttpResponse.json({ settlement: statement });
        }),
        http.post('*/api/v1/admin/food/settlements/settlement-1/paid', async ({ request }) => {
          const body = (await request.json()) as Record<string, unknown>;
          commands.push({ operation: 'paid', body, key: request.headers.get('Idempotency-Key') });
          statement = {
            ...statement!,
            status: 'PAID',
            version: 3,
            payment: {
              payoutId: 'payout-1',
              amountCents: Number(body.amountCents),
              method: 'ECOCASH',
              paidAt: String(body.paidAt),
              reference: String(body.reference),
              destinationId: 'destination-1',
              destinationVersion: 1,
              recordedBy: { type: 'FINANCE', id: `${role}-1` },
            },
          };
          return HttpResponse.json({ settlement: statement });
        }),
      );
      mount(staff(role));
      await user.click(await screen.findByRole('button', { name: 'Generate draft' }));
      const draftDialog = screen.getByRole('dialog');
      await within(draftDialog).findByText('Settlement agreement');
      fireEvent.change(within(draftDialog).getByLabelText(/Period start/), {
        target: { value: '2026-10-26' },
      });
      fireEvent.change(within(draftDialog).getByLabelText(/Period end/), {
        target: { value: '2026-10-27' },
      });
      await waitFor(() =>
        expect(within(draftDialog).getByRole('button', { name: 'Generate draft' })).toBeEnabled(),
      );
      await user.click(within(draftDialog).getByRole('button', { name: 'Generate draft' }));
      await screen.findByRole('heading', { name: 'Audit detail' });
      await user.click(await screen.findByRole('button', { name: 'Approve statement' }));
      const approval = screen.getByRole('dialog');
      await user.click(within(approval).getByLabelText(/I reviewed the included orders/));
      await user.click(within(approval).getByRole('button', { name: 'Approve statement' }));
      await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
      await user.click(await screen.findByRole('button', { name: 'Record external payment' }));
      const paid = screen.getByRole('dialog');
      fireEvent.change(within(paid).getByLabelText(/Actual external payment amount/), {
        target: { value: '10.80' },
      });
      fireEvent.change(within(paid).getByLabelText(/Actual paid date and time/), {
        target: { value: '2026-10-27T12:00' },
      });
      fireEvent.change(within(paid).getByLabelText(/External payment reference/), {
        target: { value: 'ECO-RECEIPT-001' },
      });
      await user.click(within(paid).getByLabelText(/I completed this external payment/));
      await waitFor(() =>
        expect(within(paid).getByRole('button', { name: 'Record payment' })).toBeEnabled(),
      );
      await user.click(within(paid).getByRole('button', { name: 'Record payment' }));
      await screen.findByText('ECO-RECEIPT-001');
      expect(commands.map((command) => command.operation)).toEqual(['draft', 'approve', 'paid']);
      expect(commands[0].body).toEqual({
        shopId: 'shop-1',
        expectedVersion: 7,
        agreementId: 'agreement-1',
        from: '2026-10-25T22:00:00.000Z',
        to: '2026-10-26T22:00:00.000Z',
      });
      expect(commands[1].body).toEqual({ expectedVersion: 1 });
      expect(commands[2].body).toEqual({
        expectedVersion: 2,
        amountCents: 1080,
        method: 'ECOCASH',
        paidAt: '2026-10-27T10:00:00.000Z',
        reference: 'ECO-RECEIPT-001',
        destinationId: 'destination-1',
        destinationVersion: 1,
      });
      expect(commands.every((command) => !!command.key)).toBe(true);
      expect(new Set(commands.map((command) => command.key)).size).toBe(3);
      expect(screen.getByText('PAID')).toBeInTheDocument();
    },
  );

  it('retains period input on a 409 and uses the refreshed shop version for a deliberate retry', async () => {
    const user = userEvent.setup();
    let version = 7;
    let statement: FoodSettlement | null = null;
    const sent: Array<{ body: Record<string, unknown>; key: string | null }> = [];
    reads(
      () => statement,
      () => version,
    );
    mockServer.use(
      http.post('*/api/v1/admin/food/settlements', async ({ request }) => {
        sent.push({
          body: (await request.json()) as Record<string, unknown>,
          key: request.headers.get('Idempotency-Key'),
        });
        if (sent.length === 1) {
          version = 8;
          return HttpResponse.json(
            { code: 'VERSION_CONFLICT', message: 'Branch terms changed.' },
            { status: 409 },
          );
        }
        statement = structuredClone(foodSettlement);
        return HttpResponse.json({ settlement: statement }, { status: 201 });
      }),
    );
    mount();
    await user.click(await screen.findByRole('button', { name: 'Generate draft' }));
    const dialog = screen.getByRole('dialog');
    await within(dialog).findByText('Settlement agreement');
    fireEvent.change(within(dialog).getByLabelText(/Period start/), {
      target: { value: '2026-10-26' },
    });
    fireEvent.change(within(dialog).getByLabelText(/Period end/), {
      target: { value: '2026-10-27' },
    });
    await waitFor(() =>
      expect(within(dialog).getByRole('button', { name: 'Generate draft' })).toBeEnabled(),
    );
    await user.click(within(dialog).getByRole('button', { name: 'Generate draft' }));
    await within(dialog).findByText('Branch terms changed.');
    expect(within(dialog).getByLabelText(/Period start/)).toHaveValue('2026-10-26');
    expect(within(dialog).getByLabelText(/Period end/)).toHaveValue('2026-10-27');
    await waitFor(() =>
      expect(within(dialog).getByRole('button', { name: 'Generate draft' })).toBeEnabled(),
    );
    await user.click(within(dialog).getByRole('button', { name: 'Generate draft' }));
    await screen.findByRole('heading', { name: 'Audit detail' });
    expect(sent.map((command) => command.body.expectedVersion)).toEqual([7, 8]);
    expect(sent[0].key).not.toBe(sent[1].key);
  });

  it('hides all finance reads and actions from an operator and from a disabled build', () => {
    const requests = vi.fn();
    mockServer.use(
      http.get('*/api/v1/admin/food/*', () => {
        requests();
        return HttpResponse.json({});
      }),
    );
    const first = mount(staff('operator'));
    expect(screen.getByText(/unavailable for this account/)).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Generate draft' })).not.toBeInTheDocument();
    first.unmount();
    appConfig.enableFoodSettlements = false;
    mount(staff('admin'));
    expect(screen.getByText(/unavailable for this account/)).toBeInTheDocument();
    expect(requests).not.toHaveBeenCalled();
  });

  it('renders no protected statement or payment action for an out-of-town record', async () => {
    reads(() => ({ ...foodSettlement, townId: 'other-town', status: 'APPROVED' }));
    mount(staff('finance'), '/finance/food-settlements/settlement-1');
    await screen.findByText(/outside your authorized towns/);
    expect(screen.queryByText('FOOD-001')).not.toBeInTheDocument();
    expect(
      screen.queryByRole('button', { name: 'Record external payment' }),
    ).not.toBeInTheDocument();
  });

  it('keeps the original payment request reachable after an ambiguous response and a refreshed PAID state', async () => {
    const user = userEvent.setup();
    let statement: FoodSettlement = {
      ...structuredClone(foodSettlement),
      status: 'APPROVED',
      version: 2,
      approvedAt: '2026-10-27T08:00:00.000Z',
      payoutAt: '2026-10-26T22:00:00.000Z',
    };
    const sent: Array<{ body: Record<string, unknown>; key: string | null }> = [];
    reads(() => statement);
    mockServer.use(
      http.post('*/api/v1/admin/food/settlements/settlement-1/paid', async ({ request }) => {
        const body = (await request.json()) as Record<string, unknown>;
        sent.push({ body, key: request.headers.get('Idempotency-Key') });
        statement = {
          ...statement,
          status: 'PAID',
          version: 3,
          payment: {
            payoutId: 'payout-1',
            amountCents: 1080,
            method: 'ECOCASH',
            paidAt: String(body.paidAt),
            reference: String(body.reference),
            destinationId: 'destination-1',
            destinationVersion: 1,
            recordedBy: { type: 'FINANCE', id: 'finance-1' },
          },
        };
        return sent.length === 1
          ? HttpResponse.json({ message: 'Acknowledgement unavailable.' }, { status: 500 })
          : HttpResponse.json({ settlement: statement });
      }),
    );
    mount(staff('finance'), '/finance/food-settlements/settlement-1');
    await user.click(await screen.findByRole('button', { name: 'Record external payment' }));
    const dialog = screen.getByRole('dialog');
    fireEvent.change(within(dialog).getByLabelText(/Actual external payment amount/), {
      target: { value: '10.80' },
    });
    fireEvent.change(within(dialog).getByLabelText(/Actual paid date and time/), {
      target: { value: '2026-10-27T12:00' },
    });
    fireEvent.change(within(dialog).getByLabelText(/External payment reference/), {
      target: { value: 'ORIGINAL-REFERENCE' },
    });
    await user.click(within(dialog).getByLabelText(/I completed this external payment/));
    await user.click(within(dialog).getByRole('button', { name: 'Record payment' }));
    await within(dialog).findByText('Acknowledgement unavailable.');
    await screen.findByText('PAID');
    await user.click(within(dialog).getByRole('button', { name: 'Cancel' }));
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
    await user.click(
      await screen.findByRole('button', { name: 'Review original payment request' }),
    );
    const reopened = screen.getByRole('dialog');
    fireEvent.change(within(reopened).getByLabelText(/External payment reference/), {
      target: { value: 'CHANGED-INPUT' },
    });
    expect(within(reopened).getByRole('button', { name: 'Record payment' })).toBeDisabled();
    await user.click(within(reopened).getByRole('button', { name: 'Retry the same request' }));
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
    expect(sent).toHaveLength(2);
    expect(sent[1]).toEqual(sent[0]);
    expect(sent[1].body.reference).toBe('ORIGINAL-REFERENCE');
  });

  it('reveals the frozen destination only in an audited temporary dialog', async () => {
    const user = userEvent.setup();
    const statement: FoodSettlement = {
      ...foodSettlement,
      status: 'APPROVED',
      approvedAt: '2026-10-27T08:00:00.000Z',
    };
    reads(() => statement);
    const viewed: Array<Record<string, unknown>> = [];
    mockServer.use(
      http.post(
        '*/api/v1/admin/food/settlements/settlement-1/payout-destination/reveal',
        async ({ request }) => {
          viewed.push((await request.json()) as Record<string, unknown>);
          return HttpResponse.json({
            destination: { ...foodDestination, accountIdentifier: '+263772555010' },
            amountCents: 1080,
          });
        },
      ),
    );
    const rendered = mount(staff('finance'), '/finance/food-settlements/settlement-1');
    await user.click(await screen.findByRole('button', { name: 'View frozen payout details' }));
    const reasonDialog = screen.getByRole('dialog');
    fireEvent.change(within(reasonDialog).getByLabelText(/Reason for viewing payout details/), {
      target: { value: 'Check approved transfer destination' },
    });
    await user.click(within(reasonDialog).getByRole('button', { name: 'View destination' }));
    await screen.findByText('+263772555010');
    await user.click(screen.getByRole('button', { name: 'Hide destination' }));
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
    expect(screen.queryByText('+263772555010')).not.toBeInTheDocument();
    expect(JSON.stringify(rendered.store.getState().deliveryApi)).not.toContain('+263772555010');
    expect(viewed).toEqual([{ expectedVersion: 1, reason: 'Check approved transfer destination' }]);
  });

  it('hides cached statement content, open forms and actions when refresh rejects access', async () => {
    const user = userEvent.setup();
    let permitted = true;
    mockServer.use(
      http.get('*/api/v1/admin/food/settlements/settlement-1', () =>
        permitted
          ? HttpResponse.json({ settlement: foodSettlement })
          : HttpResponse.json(
              { code: 'ACCESS_REVOKED', message: 'Town access was removed.' },
              { status: 403 },
            ),
      ),
    );
    mount(staff('finance'), '/finance/food-settlements/settlement-1');
    await user.click(await screen.findByRole('button', { name: 'Approve statement' }));
    await user.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Cancel' }));
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
    permitted = false;
    await user.click(screen.getByRole('button', { name: 'Refresh' }));
    await screen.findByText('Town access was removed.');
    expect(screen.queryByText('FOOD-001')).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Approve statement' })).not.toBeInTheDocument();
  });

  it('parses Harare period and payment times independently of the browser timezone', () => {
    expect(hararePeriodInstant('2026-10-26')).toBe('2026-10-25T22:00:00.000Z');
    expect(hararePeriodInstant('2026-02-30')).toBeNull();
    expect(hararePeriodInstant('')).toBeNull();
    expect(hararePaymentInstant('2026-10-27T12:35')).toBe('2026-10-27T10:35:00.000Z');
    expect(hararePaymentInstant('2026-02-30T12:35')).toBeNull();
    expect(hararePaymentInstant('2026-10-27T25:00')).toBeNull();
  });
});
