import type { WireFoodItem, WireShop, UpdateShopBody, WireSettlementPolicy } from '@/api/dto/shop';

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

export function currentProposal(
  shop: WireShop,
  terms: WireSettlementPolicy[],
): WireSettlementPolicy | undefined {
  return terms.find((terms) => terms._id === shop.proposedTermsId);
}
export function profilePatch(
  record: WireShop,
  draft: {
    name: string;
    branchName: string;
    phone: string;
    lat: string;
    lng: string;
    address: string;
  },
): Omit<UpdateShopBody, 'expectedVersion'> {
  return {
    ...(draft.name.trim() !== record.name ? { name: draft.name.trim() } : {}),
    ...(draft.branchName.trim() !== (record.branchName ?? '')
      ? { branchName: draft.branchName.trim() }
      : {}),
    ...(draft.phone.trim() !== record.contactPhone ? { contactPhone: draft.phone.trim() } : {}),
    ...(Number(draft.lat) !== record.pickup.point.coordinates[1] ||
    Number(draft.lng) !== record.pickup.point.coordinates[0] ||
    draft.address.trim() !== record.pickup.addressLine
      ? {
          pickup: { lat: Number(draft.lat), lng: Number(draft.lng), address: draft.address.trim() },
        }
      : {}),
  };
}
