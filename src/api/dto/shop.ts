import type { GeoArea, IsoDateTime, WireDocument, WireVersioned } from '@/api/dto/common';

export type ShopApprovalState = 'PENDING' | 'APPROVED' | 'REJECTED' | 'SUSPENDED';
export type ShopStatus = 'ACTIVE' | 'ARCHIVED';
export type ShopMembershipRole = 'OWNER' | 'MANAGER';
export type ShopMembershipStatus = 'ACTIVE' | 'REVOKED';
export type ShopItemStatus = 'ACTIVE' | 'ARCHIVED';
export type SettlementFrequency = 'DAILY' | 'WEEKLY' | 'MONTHLY';

export interface WirePickup {
  point: { type: 'Point'; coordinates: [number, number] };
  addressLine: string;
  zoneCode: string;
}

export type ShopSchedule = { timezone: string; cutoffTime: string } & (
  | { frequency: 'DAILY'; periodAnchor?: never }
  | { frequency: 'WEEKLY' | 'MONTHLY'; periodAnchor: number }
);

export interface WireSettlementPolicy {
  _id: string;
  version: number;
  shopId: string;
  commissionPolicy: WireCommissionPolicy;
  settlementPolicy: ShopSchedule & { version: number; effectiveFrom: IsoDateTime };
  acknowledgedAt?: IsoDateTime;
  acknowledgedByOwnerId?: string;
}

export interface WireCommissionPolicy {
  kind: 'BASIS_POINTS';
  basisPoints: number;
  rounding: 'HALF_UP';
  reference: string;
  effectiveFrom: IsoDateTime;
  version: number;
}

export interface ShopTownChoice {
  _id: string;
  name: string;
  serviceArea: GeoArea;
}

export interface WireThumbnail {
  recipe: string;
  sourceChecksum: string;
  contentType: 'image/jpeg';
  width: number;
  height: number;
  bytes: number;
  generatedAt: IsoDateTime;
}

export interface WireShop extends WireDocument, WireVersioned {
  name: string;
  branchName?: string;
  contactPhone: string;
  townId: string;
  pickup: WirePickup;
  status: ShopStatus;
  approvalState: ShopApprovalState;
  ownerManaged: boolean;
  isOpen: boolean;
  provenance?: 'PILOT' | 'SELF_SERVICE' | 'FIXTURE';
  thumbnail?: WireThumbnail;
  thumbnailBase64?: string;
  commissionPolicy: WireCommissionPolicy;
  settlementPolicy: ShopSchedule & { version: number; effectiveFrom: IsoDateTime };
  proposedTermsId?: string;
  termsVersion?: number;
  whatsappOptIn?: boolean;
  whatsappConsent?: { phone: string; policy: 'food-shop-orders-v1'; verifiedAt: IsoDateTime };
  requestedSettlement?: ShopSchedule;
  approvalReason?: string;
  approvalUpdatedAt?: IsoDateTime;
}

export interface WireMembership extends WireVersioned {
  _id: string;
  ownerId: string;
  shopId: string;
  townId: string;
  role: ShopMembershipRole;
  status: ShopMembershipStatus;
}

export interface WireDimensions {
  length: number;
  width: number;
  height: number;
}

export interface WireDeliverySize {
  weightGrams: number;
  dimensionsCm: WireDimensions;
  capacityUnits?: number;
  profileVersion: number;
}

export interface WireFoodItem extends WireDocument, WireVersioned {
  shopId: string;
  name: string;
  description?: string;
  category?: string;
  priceCents: number;
  displayOrder: number;
  inStock: boolean;
  status: ShopItemStatus;
  deliverySize: WireDeliverySize;
  thumbnail?: WireThumbnail;
  thumbnailBase64?: string;
}

export interface WirePackingProfile extends WireDocument, WireVersioned {
  townId: string;
  profileVersion: number;
  name: string;
  unitDefinition: string;
  status: 'ACTIVE' | 'RETIRED';
  capacityRule?: {
    volumeCm3: number;
    weightGrams: number;
    minimumUnits: number;
  };
}

export interface WireTermsRequest extends WireDocument {
  shopId: string;
  schedule?: ShopSchedule;
  acknowledgeTermsId?: string;
  createdAt: IsoDateTime;
}

export interface WireClaim extends WireDocument, WireVersioned {
  ownerId: string;
  shopId: string;
  evidence: string;
  status: 'PENDING' | 'APPROVED' | 'REJECTED';
  reason?: string;
}

export interface WireShopMe {
  owner: { id: string; phone: string; version: number };
  memberships: WireMembership[];
  capabilities: string[];
  session: { expiresAt: IsoDateTime; idleExpiresAt: IsoDateTime };
}

export interface WireShopDetail {
  shop: WireShop;
  memberships: WireMembership[];
  terms: WireSettlementPolicy[];
  requests: WireTermsRequest[];
}

export interface ShopPage<T> {
  items: T[];
  limit: number;
  skip: number;
}

export interface CreateShopBody {
  name: string;
  branchName?: string;
  contactPhone: string;
  townId: string;
  pickup: { lat: number; lng: number; address: string };
  requestedSettlement: ShopSchedule;
}

export interface UpdateShopBody {
  expectedVersion: number;
  name?: string;
  branchName?: string;
  contactPhone?: string;
  pickup?: { lat: number; lng: number; address: string };
  isOpen?: boolean;
}

export interface CreateItemBody {
  name: string;
  description?: string;
  category?: string;
  priceCents: number;
  displayOrder?: number;
  inStock?: boolean;
  deliverySize: WireDeliverySize;
}

export interface UpdateItemBody {
  expectedVersion: number;
  name?: string;
  description?: string;
  category?: string;
  priceCents?: number;
  displayOrder?: number;
  inStock?: boolean;
  deliverySize?: WireDeliverySize;
  status?: ShopItemStatus;
}

export interface ShopCommandArgs {
  idempotencyKey?: string;
}
