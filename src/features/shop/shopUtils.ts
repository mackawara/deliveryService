import type { WireFoodItem, WireShop } from '@/api/dto/shop';

export function imageSource(base64?: string): string | undefined {
  return base64 ? `data:image/jpeg;base64,${base64}` : undefined;
}

export function shopImage(shop: WireShop): string | undefined {
  return imageSource(shop.thumbnailBase64);
}

export function itemImage(item: WireFoodItem): string | undefined {
  return imageSource(item.thumbnailBase64);
}

export function centsToUsd(cents: number): string {
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(cents / 100);
}

export function readImageBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const value = typeof reader.result === 'string' ? reader.result : '';
      const comma = value.indexOf(',');
      resolve(comma >= 0 ? value.slice(comma + 1) : value);
    };
    reader.onerror = () => reject(new Error('The image could not be read.'));
    reader.readAsDataURL(file);
  });
}
