import { HttpResponse, http, type HttpHandler } from 'msw';

import type {
  WireFoodItem,
  WireMembership,
  WireReadinessCheck,
  WireShop,
  WireSuggestion,
} from '@/api/dto/shop';

/**
 * Mock of the issue 34 simple setup contract (docs/shop-simple-setup-contract.md), so the
 * first-run path works in development and in the browser test before the API ships.
 * State is kept in sessionStorage, so it survives the switch between owner and admin.
 */
const BASE = '/api/v1';
const STORE = 'mock-simple-shop:v1';
export const MOCK_SHOP_TERMS = { version: 'mock-terms-1', url: '/terms' };
const OWNER_ID = 'mock-owner';
const PHOTO =
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=';

interface SimpleState {
  shops: WireShop[];
  items: WireFoodItem[];
  settings: Record<string, { townId: string; bigOrderItemThreshold: number; version: number }>;
}

let memory: SimpleState = { shops: [], items: [], settings: {} };

function load(): SimpleState {
  try {
    const saved = globalThis.sessionStorage?.getItem(STORE);
    if (saved) memory = JSON.parse(saved) as SimpleState;
  } catch {
    /* Memory only. */
  }
  return memory;
}

function save(next: SimpleState): void {
  memory = next;
  try {
    globalThis.sessionStorage?.setItem(STORE, JSON.stringify(next));
  } catch {
    /* Memory only. */
  }
}

export function resetSimpleShopMock(): void {
  memory = { shops: [], items: [], settings: {} };
  try {
    globalThis.sessionStorage?.removeItem(STORE);
  } catch {
    /* Memory only. */
  }
}

export function simpleShopMemberships(): WireMembership[] {
  return load().shops.map((shop) => ({
    _id: `m-${shop._id}`,
    ownerId: OWNER_ID,
    shopId: shop._id,
    townId: shop.townId,
    role: 'OWNER',
    status: 'ACTIVE',
    version: 1,
    createdAt: shop.createdAt,
    updatedAt: shop.createdAt,
  }));
}

export function simpleShopList(): WireShop[] {
  return load().shops;
}

const now = () => new Date().toISOString();

function overview(shop: WireShop, items: WireFoodItem[]) {
  const active = items.filter((item) => item.shopId === shop._id && item.status === 'ACTIVE');
  const readiness: WireReadinessCheck[] = [
    {
      code: 'PICKUP_POINT',
      done: Boolean(shop.pickup),
      reason: 'Riders need this to find your shop. Customers cannot order until it is set.',
    },
    {
      code: 'VISIBLE_ITEM',
      done: active.some((item) => item.inStock && item.thumbnail),
      reason: 'Customers only see items that have a photo and are in stock.',
    },
    {
      code: 'TERMS_AGREED',
      done: shop.termsAgreement?.version === MOCK_SHOP_TERMS.version,
      reason: 'Agree to the current terms and conditions.',
    },
  ];
  const suggestions: WireSuggestion[] = [];
  if (!shop.pickup) suggestions.push({ code: 'ADD_PICKUP_PIN', message: 'Add your pickup pin.' });
  for (const item of active) {
    if (!item.thumbnail)
      suggestions.push({ code: 'ADD_ITEM_PHOTO', itemId: item._id, message: 'Add a photo.' });
    if (!item.description)
      suggestions.push({ code: 'ADD_ITEM_DESCRIPTION', itemId: item._id, message: 'Describe it.' });
    if (!item.category)
      suggestions.push({ code: 'ADD_ITEM_CATEGORY', itemId: item._id, message: 'Categorise it.' });
  }
  return { readiness, suggestions };
}

function notFound() {
  return HttpResponse.json(
    { code: 'NOT_FOUND', message: 'Not found.', correlationId: 'mock-simple' },
    { status: 404 },
  );
}

function updateShop(id: string, change: (shop: WireShop) => WireShop): WireShop | undefined {
  const state = load();
  const found = state.shops.find((shop) => shop._id === id);
  if (!found) return undefined;
  const next = { ...change(found), version: found.version + 1, updatedAt: now() };
  save({ ...state, shops: state.shops.map((shop) => (shop._id === id ? next : shop)) });
  return next;
}

function updateItem(id: string, change: (item: WireFoodItem) => WireFoodItem) {
  const state = load();
  const found = state.items.find((item) => item._id === id);
  if (!found) return undefined;
  const next = { ...change(found), version: found.version + 1, updatedAt: now() };
  save({ ...state, items: state.items.map((item) => (item._id === id ? next : item)) });
  return next;
}

function pickupFrom(body: { lat: number; lng: number; address: string }) {
  return {
    point: { type: 'Point' as const, coordinates: [body.lng, body.lat] as [number, number] },
    addressLine: body.address,
    zoneCode: 'CENTRE',
  };
}

type Guard = (cookies: Record<string, string>) => Response | null;

/** Handlers for the simple setup; `owner` and `staff` guard the two sessions. */
export function simpleShopHandlers(owner: Guard, staff: Guard): HttpHandler[] {
  return [
    http.get(`${BASE}/shop/terms`, () => HttpResponse.json({ terms: MOCK_SHOP_TERMS })),

    http.post(`${BASE}/shop/shops`, async ({ request, cookies }) => {
      const blocked = owner(cookies);
      if (blocked) return blocked;
      const body = (await request.json()) as Record<string, unknown>;
      if (body.agreeToTerms !== true || body.termsVersion !== MOCK_SHOP_TERMS.version)
        return HttpResponse.json(
          { code: 'TERMS_REQUIRED', message: 'Agree to the current terms.', correlationId: 'm' },
          { status: 422 },
        );
      const state = load();
      const created = now();
      const shop: WireShop = {
        _id: `shop-${state.shops.length + 1}`,
        name: String(body.name),
        contactPhone: '+263772000002',
        townId: String(body.townId),
        status: 'ACTIVE',
        approvalState: 'PENDING',
        ownerManaged: true,
        isOpen: false,
        provenance: 'SELF_SERVICE',
        whatsappOptIn: true,
        whatsappConsent: {
          phone: '+263772000002',
          policy: 'food-shop-orders-v1',
          verifiedAt: created,
        },
        termsAgreement: { version: MOCK_SHOP_TERMS.version, agreedAt: created },
        commissionPolicy: {
          kind: 'BASIS_POINTS',
          basisPoints: 0,
          rounding: 'HALF_UP',
          reference: 'DEFAULT',
          effectiveFrom: created,
          version: 0,
        },
        settlementPolicy: {
          frequency: 'DAILY',
          timezone: 'Africa/Harare',
          cutoffTime: '22:00',
          version: 0,
          effectiveFrom: created,
        },
        version: 1,
        createdAt: created,
        updatedAt: created,
      };
      save({ ...state, shops: [...state.shops, shop] });
      return HttpResponse.json({ shop });
    }),

    http.get(`${BASE}/shop/shops/:shopId`, ({ params, cookies }) => {
      const blocked = owner(cookies);
      if (blocked) return blocked;
      const state = load();
      const shop = state.shops.find((entry) => entry._id === params.shopId);
      return shop ? HttpResponse.json({ shop, ...overview(shop, state.items) }) : notFound();
    }),

    http.patch(`${BASE}/shop/shops/:shopId`, async ({ request, params, cookies }) => {
      const blocked = owner(cookies);
      if (blocked) return blocked;
      const {
        expectedVersion: _version,
        pickup,
        ...rest
      } = (await request.json()) as Record<string, unknown>;
      const shop = updateShop(String(params.shopId), (current) => ({
        ...current,
        ...(rest as Partial<WireShop>),
        ...(pickup ? { pickup: pickupFrom(pickup as never) } : {}),
      }));
      return shop ? HttpResponse.json({ shop }) : notFound();
    }),

    http.get(`${BASE}/shop/shops/:shopId/items`, ({ params, cookies }) => {
      const blocked = owner(cookies);
      if (blocked) return blocked;
      const items = load().items.filter((item) => item.shopId === params.shopId);
      return HttpResponse.json({ items, limit: 100, skip: 0 });
    }),

    http.post(`${BASE}/shop/shops/:shopId/items`, async ({ request, params, cookies }) => {
      const blocked = owner(cookies);
      if (blocked) return blocked;
      const body = (await request.json()) as Partial<WireFoodItem>;
      const state = load();
      const created = now();
      const item: WireFoodItem = {
        _id: `item-${state.items.length + 1}`,
        shopId: String(params.shopId),
        name: String(body.name),
        priceCents: Number(body.priceCents),
        displayOrder: state.items.length,
        inStock: true,
        status: 'ACTIVE',
        version: 1,
        createdAt: created,
        updatedAt: created,
      };
      save({ ...state, items: [...state.items, item] });
      return HttpResponse.json({ item });
    }),

    http.patch(`${BASE}/shop/shops/:shopId/items/:itemId`, async ({ request, params, cookies }) => {
      const blocked = owner(cookies);
      if (blocked) return blocked;
      const { expectedVersion: _version, ...patch } =
        (await request.json()) as Partial<WireFoodItem> & {
          expectedVersion: number;
        };
      const item = updateItem(String(params.itemId), (current) => ({ ...current, ...patch }));
      return item ? HttpResponse.json({ item }) : notFound();
    }),

    http.post(`${BASE}/shop/shops/:shopId/images`, async ({ request, cookies }) => {
      const blocked = owner(cookies);
      if (blocked) return blocked;
      const body = (await request.json()) as { itemId?: string };
      const thumbnail = {
        recipe: 'flow-thumb-v1',
        sourceChecksum: 'mock',
        contentType: 'image/jpeg' as const,
        width: 160,
        height: 160,
        bytes: 100,
        generatedAt: now(),
      };
      const target = body.itemId
        ? updateItem(body.itemId, (item) => ({ ...item, thumbnail, thumbnailBase64: PHOTO }))
        : undefined;
      if (body.itemId && !target) return notFound();
      return HttpResponse.json({
        mediaId: 'mock-media',
        thumbnail,
        base64: PHOTO,
        version: target?.version ?? 1,
      });
    }),

    // -- admin ---------------------------------------------------------------
    http.get(`${BASE}/admin/food/shops`, ({ request, cookies }) => {
      const blocked = staff(cookies);
      if (blocked) return blocked;
      const state = new URL(request.url).searchParams.get('approvalState');
      const items = load().shops.filter((shop) => !state || shop.approvalState === state);
      return HttpResponse.json({ items, limit: 25, skip: 0 });
    }),

    http.get(`${BASE}/admin/food/shops/:id`, ({ params, cookies }) => {
      const blocked = staff(cookies);
      if (blocked) return blocked;
      const state = load();
      const shop = state.shops.find((entry) => entry._id === params.id);
      return shop
        ? HttpResponse.json({
            shop,
            memberships: simpleShopMemberships().filter((m) => m.shopId === shop._id),
            terms: [],
            requests: [],
            ...overview(shop, state.items),
          })
        : notFound();
    }),

    http.get(`${BASE}/admin/food/shops/:id/items`, ({ params, cookies }) => {
      const blocked = staff(cookies);
      if (blocked) return blocked;
      const items = load().items.filter((item) => item.shopId === params.id);
      return HttpResponse.json({ items, limit: 100, skip: 0 });
    }),

    http.put(`${BASE}/admin/food/shops/:id/pickup`, async ({ request, params, cookies }) => {
      const blocked = staff(cookies);
      if (blocked) return blocked;
      const body = (await request.json()) as {
        pickup: { lat: number; lng: number; address: string };
      };
      const shop = updateShop(String(params.id), (current) => ({
        ...current,
        pickup: pickupFrom(body.pickup),
      }));
      return shop ? HttpResponse.json({ shop }) : notFound();
    }),

    http.post(`${BASE}/admin/food/shops/:id/review`, async ({ request, params, cookies }) => {
      const blocked = staff(cookies);
      if (blocked) return blocked;
      const body = (await request.json()) as {
        decision: WireShop['approvalState'];
        reason: string;
      };
      const state = load();
      const current = state.shops.find((shop) => shop._id === params.id);
      if (!current) return notFound();
      const missing = overview(current, state.items).readiness.find((check) => !check.done);
      if (body.decision === 'APPROVED' && missing)
        return HttpResponse.json(
          { code: 'SHOP_NOT_READY', message: missing.reason, correlationId: 'mock-simple' },
          { status: 422 },
        );
      const shop = updateShop(String(params.id), (entry) => ({
        ...entry,
        approvalState: body.decision,
        approvalReason: body.reason,
        approvalUpdatedAt: now(),
      }));
      return HttpResponse.json({ shop });
    }),

    http.put(
      `${BASE}/admin/food/shops/:id/items/:itemId/delivery-size`,
      async ({ request, params, cookies }) => {
        const blocked = staff(cookies);
        if (blocked) return blocked;
        const body = (await request.json()) as {
          deliverySize: WireFoodItem['deliverySize'] | null;
        };
        const item = updateItem(String(params.itemId), (current) => ({
          ...current,
          deliverySize: body.deliverySize ?? undefined,
        }));
        return item ? HttpResponse.json({ item }) : notFound();
      },
    ),

    http.get(`${BASE}/admin/food/towns/:townId/settings`, ({ params, cookies }) => {
      const blocked = staff(cookies);
      if (blocked) return blocked;
      const townId = String(params.townId);
      const settings = load().settings[townId] ?? { townId, bigOrderItemThreshold: 10, version: 1 };
      return HttpResponse.json({ settings });
    }),

    http.patch(
      `${BASE}/admin/food/towns/:townId/settings`,
      async ({ request, params, cookies }) => {
        const blocked = staff(cookies);
        if (blocked) return blocked;
        const townId = String(params.townId);
        const body = (await request.json()) as { bigOrderItemThreshold: number };
        const state = load();
        const previous = state.settings[townId]?.version ?? 1;
        const settings = {
          townId,
          bigOrderItemThreshold: body.bigOrderItemThreshold,
          version: previous + 1,
        };
        save({ ...state, settings: { ...state.settings, [townId]: settings } });
        return HttpResponse.json({ settings });
      },
    ),
  ];
}
