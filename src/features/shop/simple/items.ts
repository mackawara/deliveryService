import type { WireFoodItem } from '@/api/dto/shop';

/** An item without a photo is saved but hidden from customers (issue 34). */
export function hasPhoto(item: Pick<WireFoodItem, 'thumbnail' | 'thumbnailBase64'>): boolean {
  return Boolean(item.thumbnail || item.thumbnailBase64);
}

/**
 * Reads a USD price typed on a phone keypad ("4.5", "4,50", "$4") as whole cents.
 * Returns undefined for anything that is not a positive amount with at most two decimals.
 */
export function parsePriceCents(input: string): number | undefined {
  const text = input.trim().replace(/^\$/, '').replace(',', '.');
  if (!/^\d+(\.\d{1,2})?$/.test(text)) return undefined;
  const cents = Math.round(Number(text) * 100);
  return cents > 0 ? cents : undefined;
}

export function priceText(cents: number): string {
  return (cents / 100).toFixed(2);
}

export interface ItemDraft {
  name: string;
  price: string;
}

const draftKey = (shopId: string) => `shop-item-draft:v1:${shopId}`;

/** The new-item form survives a dropped connection or a reload. */
export function readItemDraft(shopId: string): ItemDraft {
  try {
    const saved = JSON.parse(sessionStorage.getItem(draftKey(shopId)) ?? 'null');
    if (typeof saved?.name === 'string' && typeof saved?.price === 'string')
      return { name: saved.name, price: saved.price };
  } catch {
    /* Start empty. */
  }
  return { name: '', price: '' };
}

export function writeItemDraft(shopId: string, draft: ItemDraft): void {
  try {
    sessionStorage.setItem(draftKey(shopId), JSON.stringify(draft));
  } catch {
    /* Optional draft storage. */
  }
}

export function clearItemDraft(shopId: string): void {
  try {
    sessionStorage.removeItem(draftKey(shopId));
  } catch {
    /* Optional draft storage. */
  }
}
