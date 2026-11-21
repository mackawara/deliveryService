import type { WireReadinessCheck, WireShop } from '@/api/dto/shop';

export interface ProgressStep {
  key: string;
  label: string;
  done: boolean;
  /** Where the owner goes to finish this step. */
  to?: string;
  reason?: string;
}

export interface Progress {
  steps: ProgressStep[];
  next?: ProgressStep;
  live: boolean;
}

const KNOWN: Record<string, { label: string; path?: (shopId: string) => string }> = {
  VISIBLE_ITEM: { label: 'Add items with photos', path: (id) => `/shop/${id}/catalogue` },
  PICKUP_POINT: { label: 'Pin your shop', path: (id) => `/shop/${id}/pin` },
  TERMS_AGREED: { label: 'Agree to the terms' },
};

/**
 * The progress strip, built only from the API readiness list and the approval state.
 * Items and pin can be done in either order; any other check the API adds still shows,
 * with its own reason, before approval.
 */
export function shopProgress(shop: WireShop, readiness: WireReadinessCheck[]): Progress {
  const check = (code: string) => readiness.find((entry) => entry.code === code);
  const step = (code: string): ProgressStep => {
    const entry = check(code);
    const known = KNOWN[code];
    return {
      key: code,
      label: known?.label ?? entry?.reason ?? code,
      done: entry?.done ?? false,
      to: known?.path?.(shop._id),
      reason: entry?.reason,
    };
  };
  const live = shop.approvalState === 'APPROVED';
  const extra = readiness
    .filter((entry) => !['VISIBLE_ITEM', 'PICKUP_POINT'].includes(entry.code))
    .filter((entry) => entry.code !== 'TERMS_AGREED' || !entry.done)
    .map((entry) => step(entry.code));
  const steps: ProgressStep[] = [
    { key: 'CREATED', label: 'Shop created', done: true },
    step('VISIBLE_ITEM'),
    step('PICKUP_POINT'),
    ...extra,
    { key: 'APPROVAL', label: 'Waiting for approval', done: live },
  ];
  return { steps, next: steps.find((entry) => !entry.done), live };
}
