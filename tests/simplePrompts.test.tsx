import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { HttpResponse, http } from 'msw';

import type { WireReadinessCheck, WireSuggestion } from '@/api/dto/shop';
import { SimpleCatalogueWithPrompts } from '@/features/shop/simple/CataloguePrompts';
import { ShopProgress } from '@/features/shop/simple/ShopProgress';
import { shopProgress } from '@/features/shop/simple/progress';
import {
  groupSuggestions,
  popupSuggestion,
  readSnoozed,
  snooze,
} from '@/features/shop/simple/suggestions';
import { mockServer } from '@/mocks/server';
import { PNG, serveCatalogue } from './simpleShopApiMock';
import { PICKUP, THUMBNAIL, computeOverview, simpleItem, simpleShop } from './simpleShopFixture';
import { asOwner, withSimpleSetupFlag } from './simpleShopTestUtils';
import { renderRoutes } from './testUtils';

withSimpleSetupFlag({ beforeEach, afterEach });

const item = (id: string, code: string): WireSuggestion => ({ code, itemId: id, message: code });

describe('suggestion rules', () => {
  it('counts outstanding suggestions per kind, most useful first', () => {
    const groups = groupSuggestions([
      item('a', 'ADD_ITEM_CATEGORY'),
      item('a', 'ADD_ITEM_PHOTO'),
      item('b', 'ADD_ITEM_PHOTO'),
      item('c', 'ADD_ITEM_PHOTO'),
      { code: 'ADD_PICKUP_PIN', message: 'pin' },
      { code: 'SOMETHING_NEW', message: 'Add opening hours' },
    ]);
    expect(groups.map((group) => group.label)).toEqual([
      'Pin your shop on the map',
      '3 items need a photo',
      '1 item has no category',
      'Add opening hours',
    ]);
  });

  it('offers one item prompt at a time and respects "Not now" for that item only', () => {
    const list = [
      item('a', 'ADD_ITEM_CATEGORY'),
      item('a', 'ADD_ITEM_DESCRIPTION'),
      item('b', 'ADD_ITEM_PHOTO'),
    ];
    expect(popupSuggestion(list, 'a', new Set())?.code).toBe('ADD_ITEM_DESCRIPTION');
    const snoozed = snooze('owner-a', 'shop-new', list[1]);
    expect(popupSuggestion(list, 'a', snoozed)?.code).toBe('ADD_ITEM_CATEGORY');
    expect(popupSuggestion(list, 'b', snoozed)?.code).toBe('ADD_ITEM_PHOTO');
    expect(readSnoozed('owner-a', 'shop-new')).toEqual(new Set(['ADD_ITEM_DESCRIPTION:a']));
    expect(readSnoozed('owner-b', 'shop-new').size).toBe(0);
    expect(popupSuggestion([], 'a', new Set())).toBeUndefined();
  });
});

const ready = (codes: Record<string, boolean>): WireReadinessCheck[] =>
  Object.entries(codes).map(([code, done]) => ({ code, done, reason: `${code} reason` }));

describe('progress strip rules', () => {
  it('starts at items, accepts items and pin in either order, then waits for approval', () => {
    const shop = simpleShop();
    const fresh = shopProgress(
      shop,
      ready({ PICKUP_POINT: false, VISIBLE_ITEM: false, TERMS_AGREED: true }),
    );
    expect(fresh.steps.map((step) => [step.label, step.done])).toEqual([
      ['Shop created', true],
      ['Add items with photos', false],
      ['Pin your shop', false],
      ['Waiting for approval', false],
    ]);
    expect(fresh.next?.to).toBe('/shop/shop-new/catalogue');
    expect(
      shopProgress(shop, ready({ PICKUP_POINT: true, VISIBLE_ITEM: false, TERMS_AGREED: true }))
        .next?.key,
    ).toBe('VISIBLE_ITEM');
    expect(
      shopProgress(shop, ready({ PICKUP_POINT: false, VISIBLE_ITEM: true, TERMS_AGREED: true }))
        .next,
    ).toMatchObject({ key: 'PICKUP_POINT', to: '/shop/shop-new/pin' });
    expect(
      shopProgress(shop, ready({ PICKUP_POINT: true, VISIBLE_ITEM: true, TERMS_AGREED: true })).next
        ?.key,
    ).toBe('APPROVAL');
    expect(shopProgress(simpleShop({ approvalState: 'APPROVED' }), []).live).toBe(true);
  });

  it('shows terms and any new API check as steps before approval', () => {
    const progress = shopProgress(
      simpleShop(),
      ready({ PICKUP_POINT: true, VISIBLE_ITEM: true, TERMS_AGREED: false, OPENING_HOURS: false }),
    );
    expect(progress.steps.map((step) => step.label)).toEqual([
      'Shop created',
      'Add items with photos',
      'Pin your shop',
      'Agree to the terms',
      'OPENING_HOURS reason',
      'Waiting for approval',
    ]);
    expect(progress.next?.key).toBe('TERMS_AGREED');
  });
});

function mountProgress(shop = simpleShop(), items = [simpleItem()]) {
  mockServer.use(
    http.get(`/api/v1/shop/shops/${shop._id}`, () =>
      HttpResponse.json(computeOverview(shop, items)),
    ),
  );
  return renderRoutes({
    routes: [{ path: '*', element: <ShopProgress shop={shop} /> }],
    initialEntries: ['/shop/shop-new/catalogue'],
  });
}

describe('progress strip', () => {
  it('names the next step and links to where it is done', async () => {
    mountProgress();
    const strip = await screen.findByRole('region', { name: 'Your progress' });
    expect(within(strip).getByText(/Next, step 2: Add items with photos/)).toBeInTheDocument();
    expect(within(strip).getByRole('link', { name: 'Add items with photos' })).toHaveAttribute(
      'href',
      '/shop/shop-new/catalogue',
    );
    expect(strip.querySelector('[aria-current="step"]')).toHaveTextContent(
      '2. Add items with photos',
    );
  });

  it('tells the owner what to do while waiting for approval', async () => {
    mountProgress(simpleShop({ pickup: PICKUP }), [simpleItem({ thumbnail: THUMBNAIL })]);
    expect(await screen.findByText(/we will tell you on\s+WhatsApp/)).toBeInTheDocument();
    expect(screen.queryByText(/awaiting approval/i)).not.toBeInTheDocument();
  });

  it('says the shop is live once approved', async () => {
    mountProgress(simpleShop({ approvalState: 'APPROVED', pickup: PICKUP }));
    expect(await screen.findByText('Your shop is live')).toBeInTheDocument();
  });

  it('shows the reason when the shop was not approved', async () => {
    mountProgress(
      simpleShop({ approvalState: 'REJECTED', approvalReason: 'The pin is outside town.' }),
    );
    expect(await screen.findByText('The pin is outside town.')).toBeInTheDocument();
  });
});

function mountCatalogue() {
  renderRoutes({
    routes: [
      { path: '/shop/:shopId/catalogue', element: asOwner(<SimpleCatalogueWithPrompts />) },
      { path: '/shop/:shopId/pin', element: <p>Pin page</p> },
    ],
    initialEntries: ['/shop/shop-new/catalogue'],
  });
}

async function addItem(user: ReturnType<typeof userEvent.setup>, button = 'Save') {
  const dialog = screen.getByRole('dialog', { name: 'Add an item' });
  await user.type(within(dialog).getByLabelText(/Item name/), 'Chips');
  await user.type(within(dialog).getByLabelText(/Price/), '2');
  await user.click(within(dialog).getByRole('button', { name: button }));
}

describe('prompts that encourage more detail', () => {
  beforeEach(() => {
    sessionStorage.clear();
    localStorage.clear();
  });

  it('suggests a missing photo once after saving, and completes it in place', async () => {
    const user = userEvent.setup();
    const calls = serveCatalogue();
    mountCatalogue();
    await user.click(await screen.findByRole('button', { name: 'Add your first item' }));
    await addItem(user);
    const popup = await screen.findByRole('dialog', { name: 'Add a photo of Chips?' });
    expect(popup).toHaveAttribute('aria-modal', 'false');
    await user.upload(within(popup).getByLabelText('Photo for Chips'), PNG);
    await waitFor(() =>
      expect(screen.queryByRole('dialog', { name: /Chips\?/ })).not.toBeInTheDocument(),
    );
    expect(calls.at(-1)).toMatchObject({ body: { itemId: 'item-1', expectedVersion: 1 } });
    // At most one popup per save: the description prompt does not follow on its own.
    await new Promise((resolve) => setTimeout(resolve, 50));
    expect(screen.queryByRole('dialog', { name: /Describe/ })).not.toBeInTheDocument();
  });

  it('snoozes with "Not now" and lists what is outstanding in "Make your shop better"', async () => {
    const user = userEvent.setup();
    serveCatalogue();
    mountCatalogue();
    await user.click(await screen.findByRole('button', { name: 'Add your first item' }));
    await addItem(user);
    const popup = await screen.findByRole('dialog', { name: 'Add a photo of Chips?' });
    await user.click(within(popup).getByRole('button', { name: 'Not now' }));
    expect(screen.queryByRole('dialog', { name: /Chips\?/ })).not.toBeInTheDocument();
    expect(readSnoozed('owner-a', 'shop-new').has('ADD_ITEM_PHOTO:item-1')).toBe(true);

    const card = screen.getByRole('region', { name: 'Make your shop better' });
    expect(within(card).getByText('Pin your shop on the map')).toBeInTheDocument();
    expect(within(card).getByText('1 item needs a photo')).toBeInTheDocument();
    expect(within(card).getByText('1 item could use a description')).toBeInTheDocument();
    expect(within(card).getByText('1 item has no category')).toBeInTheDocument();
  });

  it('opens a suggestion from the card and saves a category in place', async () => {
    const user = userEvent.setup();
    const calls = serveCatalogue([simpleItem({ thumbnail: THUMBNAIL, description: 'Hot' })]);
    mountCatalogue();
    const card = await screen.findByRole('region', { name: 'Make your shop better' });
    const row = within(card).getByText('1 item has no category').closest('li')!;
    await user.click(within(row).getByRole('button', { name: 'Fix one' }));
    const popup = await screen.findByRole('dialog', { name: /category for Sadza and beef/ });
    await user.click(within(popup).getByRole('button', { name: 'Mains' }));
    await user.click(within(popup).getByRole('button', { name: 'Save' }));
    await waitFor(() =>
      expect(within(card).queryByText('1 item has no category')).not.toBeInTheDocument(),
    );
    expect(calls).toEqual([
      expect.objectContaining({
        method: 'PATCH',
        body: { expectedVersion: 1, category: 'Mains' },
      }),
    ]);
    expect(screen.queryByRole('dialog', { name: /category/ })).not.toBeInTheDocument();
  });

  it('stays out of the way of "Save and add another"', async () => {
    const user = userEvent.setup();
    serveCatalogue();
    mountCatalogue();
    await user.click(await screen.findByRole('button', { name: 'Add your first item' }));
    await addItem(user, 'Save and add another');
    await waitFor(() =>
      // The item dialog is modal, so the rest of the page is hidden from the accessibility tree.
      expect(
        screen.getByRole('region', { name: 'Make your shop better', hidden: true }),
      ).toBeInTheDocument(),
    );
    expect(screen.queryByRole('dialog', { name: /Chips\?/, hidden: true })).not.toBeInTheDocument();
    expect(screen.getByRole('dialog', { name: 'Add an item' })).toBeInTheDocument();
  });

  it('hides the card when nothing is outstanding', async () => {
    serveCatalogue(
      [simpleItem({ thumbnail: THUMBNAIL, description: 'Hot', category: 'Mains' })],
      simpleShop({ pickup: PICKUP }),
    );
    mountCatalogue();
    expect(await screen.findByText('Sadza and beef')).toBeInTheDocument();
    await new Promise((resolve) => setTimeout(resolve, 50));
    expect(screen.queryByRole('region', { name: 'Make your shop better' })).not.toBeInTheDocument();
  });
});
