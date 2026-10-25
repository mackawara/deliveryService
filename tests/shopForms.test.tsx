import { useState } from 'react';
import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { http, HttpResponse } from 'msw';
import { createAppStore } from '@/app/store';
import { shopApi } from '@/api/endpoints/shop';
import { OwnerAuthContext } from '@/auth/OwnerAuthProvider';
import { ShopSetupPage } from '@/features/shop/ShopSetupPage';
import { PickupPicker } from '@/features/shop/PickupPicker';
import { SettlementFields } from '@/features/shop/SettlementFields';
import {
  scheduleDraft,
  scheduleLabel,
  schedulePayload,
  validSchedule,
} from '@/features/shop/settlement';
import { currentProposal, profilePatch } from '@/features/shop/shopUtils';
import type { WireShop, WireSettlementPolicy } from '@/api/dto/shop';
import { mockServer } from '@/mocks/server';
import { renderRoutes, renderWithProviders } from './testUtils';

vi.mock('@/lib/googleMaps', () => ({ loadGoogleMaps: () => Promise.reject(new Error('offline')) }));
const schedule = {
  frequency: 'WEEKLY' as const,
  timezone: 'Africa/Harare',
  cutoffTime: '21:30',
  periodAnchor: 0,
};
const commission = {
  kind: 'BASIS_POINTS' as const,
  basisPoints: 1250,
  rounding: 'HALF_UP' as const,
  reference: 'AGREED',
  effectiveFrom: '2026-10-20T00:00:00Z',
  version: 1,
};
const shop: WireShop = {
  _id: 'branch-1',
  townId: 'town-1',
  name: 'Lunch Spot',
  branchName: 'Centre',
  contactPhone: '+263772555010',
  pickup: {
    point: { type: 'Point', coordinates: [26.45, -18.42] },
    addressLine: 'Main Street',
    zoneCode: 'A',
  },
  status: 'ACTIVE',
  ownerManaged: true,
  approvalState: 'APPROVED',
  isOpen: false,
  version: 8,
  createdAt: '2026-10-20T00:00:00Z',
  updatedAt: '2026-10-20T00:00:00Z',
  commissionPolicy: commission,
  settlementPolicy: { ...schedule, effectiveFrom: commission.effectiveFrom, version: 1 },
  proposedTermsId: 'newest',
};
const proposal = (id: string, version: number): WireSettlementPolicy => ({
  _id: id,
  shopId: shop._id,
  version,
  commissionPolicy: { ...commission, version },
  settlementPolicy: { ...shop.settlementPolicy, version },
});

describe('shop form regressions', () => {
  it('selects the exact proposal ID from nested API terms and preserves history order', () => {
    const history = [proposal('newest', 3), proposal('older', 2), proposal('oldest', 1)];
    expect(currentProposal(shop, history)).toBe(history[0]);
    expect(currentProposal({ ...shop, proposedTermsId: 'missing' }, history)).toBeUndefined();
    expect(history.map((entry) => entry.version)).toEqual([3, 2, 1]);
    expect(scheduleLabel(history[0].settlementPolicy)).toContain('Sunday');
  });
  it('builds partial profile patches, including clearing the branch label', () => {
    const draft = {
      name: shop.name,
      branchName: shop.branchName!,
      phone: shop.contactPhone,
      lat: '-18.4200',
      lng: '26.4500',
      address: shop.pickup.addressLine,
    };
    expect(profilePatch(shop, draft)).toEqual({});
    expect(profilePatch(shop, { ...draft, name: 'Lunch Spot New', branchName: '' })).toEqual({
      name: 'Lunch Spot New',
      branchName: '',
    });
    expect(profilePatch(shop, { ...draft, address: 'Next entrance' })).toEqual({
      pickup: { lat: -18.42, lng: 26.45, address: 'Next entrance' },
    });
  });
  it.each([
    ['WEEKLY', '0', 0],
    ['WEEKLY', '6', 6],
    ['MONTHLY', '1', 1],
    ['MONTHLY', '28', 28],
  ] as const)(
    'builds %s anchor %s without losing timezone/cutoff',
    (frequency, anchor, expected) => {
      expect(
        schedulePayload({ frequency, anchor, timezone: 'Africa/Harare', cutoffTime: '21:30' }),
      ).toEqual({
        frequency,
        periodAnchor: expected,
        timezone: 'Africa/Harare',
        cutoffTime: '21:30',
      });
    },
  );
  it('requires valid anchors, omits them for daily, and validates the timezone and cutoff', () => {
    for (const [frequency, anchor] of [
      ['WEEKLY', ''],
      ['WEEKLY', '7'],
      ['WEEKLY', '-1'],
      ['MONTHLY', '0'],
      ['MONTHLY', '29'],
      ['MONTHLY', '1.5'],
    ] as const)
      expect(
        validSchedule({ frequency, anchor, timezone: 'Africa/Harare', cutoffTime: '21:30' }),
      ).toBe(false);
    expect(
      schedulePayload({
        frequency: 'DAILY',
        anchor: '6',
        timezone: 'Africa/Harare',
        cutoffTime: '21:30',
      }),
    ).not.toHaveProperty('periodAnchor');
    expect(validSchedule({ ...scheduleDraft(), timezone: 'Unknown/Place' })).toBe(false);
    expect(validSchedule({ ...scheduleDraft(), cutoffTime: '25:00' })).toBe(false);
  });
  it('exposes labelled weekly and monthly anchor controls', async () => {
    const user = userEvent.setup();
    function Form() {
      const [value, setValue] = useState(scheduleDraft());
      return <SettlementFields value={value} onChange={setValue} />;
    }
    renderWithProviders(<Form />);
    await user.click(screen.getByLabelText('Settlement frequency'));
    await user.click(screen.getByRole('option', { name: 'WEEKLY' }));
    await user.click(screen.getByLabelText(/Settlement weekday/));
    await user.click(screen.getByRole('option', { name: 'Sunday' }));
    expect(screen.getByLabelText(/Settlement weekday/)).toHaveTextContent('Sunday');
    await user.click(screen.getByLabelText('Settlement frequency'));
    await user.click(screen.getByRole('option', { name: 'MONTHLY' }));
    expect(screen.getByLabelText(/Settlement day of month/)).toBeInTheDocument();
  });
  it('lets an owner use a pasted pickup pin when maps fail', async () => {
    const user = userEvent.setup();
    function Form() {
      const [value, setValue] = useState({ lat: '', lng: '', address: '' });
      return <PickupPicker value={value} onChange={setValue} />;
    }
    renderWithProviders(<Form />);
    expect(await screen.findByText(/The map is unavailable/)).toBeInTheDocument();
    await user.type(
      screen.getByLabelText('Coordinates or map link'),
      'https://maps.google.com/?q=-18.42,26.45',
    );
    await user.click(screen.getByRole('button', { name: 'Use pasted pin' }));
    expect(screen.getByText('Pickup pin: -18.42, 26.45')).toBeInTheDocument();
    await user.type(screen.getByLabelText(/Short pickup address/), '4 Main Street');
    expect(screen.getByLabelText(/Short pickup address/)).toHaveValue('4 Main Street');
  });
  it('recovers setup drafts by owner without exposing a staff town ID input', async () => {
    const user = userEvent.setup();
    mockServer.use(
      http.get('/api/v1/shop/towns', () =>
        HttpResponse.json({
          items: [
            {
              _id: 'town-1',
              name: 'Hwange',
              serviceArea: {
                type: 'Polygon',
                coordinates: [
                  [
                    [26.4, -18.5],
                    [26.6, -18.5],
                    [26.6, -18.3],
                    [26.4, -18.5],
                  ],
                ],
              },
            },
          ],
        }),
      ),
    );
    const owner = (id: string) => ({
      status: 'authenticated' as const,
      session: {
        owner: { id, phone: '+263772555001', version: 1 },
        memberships: [],
        capabilities: [],
        session: { expiresAt: '2026-10-26T00:00:00Z', idleExpiresAt: '2026-10-26T00:00:00Z' },
      },
      error: undefined,
      refresh: () => {},
      signOut: async () => {},
      signingOut: false,
    });
    const mount = (id: string) =>
      renderRoutes({
        routes: [
          {
            path: '/shop/setup',
            element: (
              <OwnerAuthContext.Provider value={owner(id)}>
                <ShopSetupPage />
              </OwnerAuthContext.Provider>
            ),
          },
        ],
        initialEntries: ['/shop/setup'],
      });
    const first = mount('owner-a');
    await user.type(await screen.findByLabelText(/Business name/), 'Recover me');
    expect(screen.queryByLabelText('Town ID')).not.toBeInTheDocument();
    first.unmount();
    const second = mount('owner-a');
    expect(await screen.findByLabelText(/Business name/)).toHaveValue('Recover me');
    second.unmount();
    mount('owner-b');
    expect(await screen.findByLabelText(/Business name/)).toHaveValue('');
    expect(sessionStorage.getItem('shop-setup:v1:owner-a')).not.toMatch(/consent|challenge|code/);
  });
  it('invalidates the subscribed branch item list after photo upload', async () => {
    let base64 = 'first';
    let reads = 0;
    mockServer.use(
      http.get('/api/v1/shop/shops/branch-1/items', () => {
        reads++;
        return HttpResponse.json({
          items: [{ _id: 'item-1', thumbnailBase64: base64 }],
          limit: 25,
          skip: 0,
        });
      }),
      http.post('/api/v1/shop/shops/branch-1/images', () => {
        base64 = 'second';
        return HttpResponse.json({ mediaId: 'new-photo', base64, version: 2 });
      }),
    );
    const store = createAppStore();
    const subscription = store.dispatch(
      shopApi.endpoints.listShopItems.initiate({ shopId: 'branch-1' }),
    );
    await subscription.unwrap();
    await store
      .dispatch(
        shopApi.endpoints.uploadShopImage.initiate({
          shopId: 'branch-1',
          itemId: 'item-1',
          expectedVersion: 1,
          base64: 'source',
        }),
      )
      .unwrap();
    await waitFor(() =>
      expect(
        shopApi.endpoints.listShopItems.select({ shopId: 'branch-1' })(store.getState()).data
          ?.items[0].thumbnailBase64,
      ).toBe('second'),
    );
    expect(reads).toBe(2);
    subscription.unsubscribe();
  });
});
