import type {
  WireFoodItem,
  WireReadinessCheck,
  WireShop,
  WireShopOverview,
  WireSuggestion,
} from '@/api/dto/shop';

/** Contract fixtures for the issue 34 simple setup (docs/shop-simple-setup-contract.md). */
export const SIMPLE_TERMS = { version: '2026-11', url: '/terms' };

const policy = {
  commissionPolicy: {
    kind: 'BASIS_POINTS' as const,
    basisPoints: 1000,
    rounding: 'HALF_UP' as const,
    reference: 'DEFAULT',
    effectiveFrom: '2026-11-20T00:00:00.000Z',
    version: 1,
  },
  settlementPolicy: {
    frequency: 'WEEKLY' as const,
    periodAnchor: 1,
    timezone: 'Africa/Harare',
    cutoffTime: '22:00',
    version: 1,
    effectiveFrom: '2026-11-20T00:00:00.000Z',
  },
};

export const PICKUP = {
  point: { type: 'Point' as const, coordinates: [26.48, -18.36] as [number, number] },
  addressLine: 'Next to the market',
  zoneCode: 'CENTRE',
};

export function simpleShop(overrides: Partial<WireShop> = {}): WireShop {
  return {
    _id: 'shop-new',
    name: 'Mama Rudo Kitchen',
    contactPhone: '+263772000002',
    townId: 'town-hwange',
    status: 'ACTIVE',
    approvalState: 'PENDING',
    ownerManaged: true,
    isOpen: false,
    provenance: 'SELF_SERVICE',
    version: 1,
    createdAt: '2026-11-21T08:00:00.000Z',
    updatedAt: '2026-11-21T08:00:00.000Z',
    termsAgreement: { version: SIMPLE_TERMS.version, agreedAt: '2026-11-21T08:00:00.000Z' },
    ...policy,
    ...overrides,
  };
}

export function simpleItem(overrides: Partial<WireFoodItem> = {}): WireFoodItem {
  return {
    _id: 'item-1',
    shopId: 'shop-new',
    name: 'Sadza and beef',
    priceCents: 450,
    displayOrder: 0,
    inStock: true,
    status: 'ACTIVE',
    version: 1,
    createdAt: '2026-11-21T08:05:00.000Z',
    updatedAt: '2026-11-21T08:05:00.000Z',
    ...overrides,
  };
}

export const THUMBNAIL = {
  recipe: 'flow-thumb-v1',
  sourceChecksum: 'abc',
  contentType: 'image/jpeg' as const,
  width: 160,
  height: 160,
  bytes: 4000,
  generatedAt: '2026-11-21T08:06:00.000Z',
};

/** Readiness and suggestions as the API computes them, for fixtures that change state. */
export function computeOverview(shop: WireShop, items: WireFoodItem[]): WireShopOverview {
  const active = items.filter((item) => item.status === 'ACTIVE');
  const readiness: WireReadinessCheck[] = [
    {
      code: 'PICKUP_POINT',
      done: Boolean(shop.pickup),
      reason: shop.pickup
        ? 'Your shop is on the map.'
        : 'Riders need this to find your shop. Customers cannot order until it is set.',
    },
    {
      code: 'VISIBLE_ITEM',
      done: active.some((item) => item.inStock && item.thumbnail),
      reason: 'Add at least one item with a photo that is in stock.',
    },
    {
      code: 'TERMS_AGREED',
      done: shop.termsAgreement?.version === SIMPLE_TERMS.version,
      reason: 'Agree to the current terms and conditions.',
    },
  ];
  const suggestions: WireSuggestion[] = [];
  if (!shop.pickup)
    suggestions.push({ code: 'ADD_PICKUP_PIN', message: 'Add your pickup pin on the map.' });
  for (const item of active) {
    if (!item.thumbnail)
      suggestions.push({ code: 'ADD_ITEM_PHOTO', itemId: item._id, message: 'Add a photo.' });
    if (!item.description)
      suggestions.push({
        code: 'ADD_ITEM_DESCRIPTION',
        itemId: item._id,
        message: 'Add a short description.',
      });
    if (!item.category)
      suggestions.push({
        code: 'ADD_ITEM_CATEGORY',
        itemId: item._id,
        message: 'Choose a category.',
      });
  }
  return { shop, readiness, suggestions };
}
