export type ShopOrderAction = 'ACCEPT' | 'REJECT' | 'READY';
export type ShopOrderFilter =
  | 'ACTIVE'
  | 'ALL'
  | 'COMPLETED'
  | 'AWAITING_SHOP'
  | 'PREPARING'
  | 'READY'
  | 'REJECTED'
  | 'CANCELLED';
export interface ShopOrder {
  pollingIntervalMs?: number;
  notifications: { pending: number; needsHelp: boolean };
  id: string;
  reference: string;
  shopId: string;
  status: string;
  version: number;
  createdAt: string;
  updatedAt: string;
  placedAt: string;
  acceptanceDeadlineAt: string;
  acceptedAt: string | null;
  prepMinutes: number | null;
  estimatedReadyAt: string | null;
  readyAt: string | null;
  rejectedAt: string | null;
  rejectionReason: string | null;
  cancelledAt: string | null;
  amounts: {
    currency: 'USD';
    foodSubtotalCents: number;
    deliveryFeeCents: number;
    totalCents: number;
  };
  payment: { method: string; state: string };
  delivery: {
    status: string;
    version: number;
    progress: string;
    dispatchEligible: boolean;
    holdCode: string | null;
    estimate: {
      estimatedReadyAt: string | null;
      deliveryWindowStart: string | null;
      deliveryWindowEnd: string | null;
      calculatedAt: string;
      source: string;
      confidence: string;
    } | null;
  };
  itemCount: number;
  availableActions: ShopOrderAction[];
  prepMaxMinutes: number;
  serverNow: string;
  help: string;
  items?: {
    itemId: string;
    name: string;
    category?: string;
    quantity: number;
    unitPriceCents: number;
    lineTotalCents: number;
    deliverySize: {
      weightGrams: number;
      dimensionsCm: { length: number; width: number; height: number };
      capacityUnits: number;
      profileVersion: number;
    };
  }[];
  customer?: { name: string };
  dropoff?: { addressLine: string; zoneCode: string };
  history?: { at: string; type: string; channel: string; actor: { type: string } }[];
}
export interface ShopOrderScope {
  ownerId: string;
  shopId: string;
}
export interface ShopOrderPage {
  items: ShopOrder[];
  nextCursor: string | null;
  serverNow: string;
  pollingIntervalMs: number;
}
export interface ShopOrderResult {
  order: ShopOrder;
  serverNow: string;
}
export interface ShopOrderCommand extends ShopOrderScope {
  id: string;
  action: 'accept' | 'reject' | 'ready';
  idempotencyKey: string;
  payload: { expectedVersion: number; prepMinutes?: number; reasonCode?: string };
}
