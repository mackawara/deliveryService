import type { Actor, IsoDateTime } from '@/api/dto/common';

/** Safe platform capability summary only; merchant credentials never reach the browser. */
export interface ShopPaymentSettings {
  shopId: string;
  currency: 'USD';
  codEnabled: boolean;
  ecoCashEnabled: boolean;
  status: 'DISABLED' | 'READY' | 'ENABLED' | 'UNAVAILABLE';
  version: number;
  provider: {
    ready: boolean;
    usdSupported: boolean;
    checkedAt?: IsoDateTime;
    blockedReason?: string;
  };
  blockedReason?: string;
  enabledAt?: IsoDateTime;
  enabledBy?: Actor;
}

export interface UpdateShopPaymentSettings {
  shopId: string;
  scopeKey: string;
  ecoCashEnabled: boolean;
  expectedVersion: number;
  reason: string;
  idempotencyKey: string;
}
