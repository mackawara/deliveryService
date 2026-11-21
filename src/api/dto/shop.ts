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
  /** Absent until the owner (or an admin) sets the pin: it never blocks signup (issue 34). */
  pickup?: WirePickup;
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
  /** The public /terms version the owner agreed to, and when (issue 34). */
  termsAgreement?: WireTermsAgreement;
}

export interface WireTermsAgreement {
  version: string;
  agreedAt: IsoDateTime;
}

/** The public shop terms currently in force; `null` closes shop signup. */
export interface WireCurrentShopTerms {
  version: string;
  url: string;
}

/** Known approval checks. Unknown codes from a newer API still render by their reason. */
export type ShopReadinessCode = 'PICKUP_POINT' | 'VISIBLE_ITEM' | 'TERMS_AGREED';

export interface WireReadinessCheck {
  code: ShopReadinessCode | (string & {});
  done: boolean;
  /** Plain words for the owner or admin, written by the API. */
  reason: string;
}

/** Known optional improvements. Unknown codes still render by their message. */
export type ShopSuggestionCode =
  | 'ADD_PICKUP_PIN'
  | 'ADD_PICKUP_ADDRESS'
  | 'ADD_ITEM_PHOTO'
  | 'ADD_ITEM_DESCRIPTION'
  | 'ADD_ITEM_CATEGORY';

export interface WireSuggestion {
  code: ShopSuggestionCode | (string & {});
  /** Present when the suggestion is about one item. */
  itemId?: string;
  message: string;
}

/** `GET /shop/shops/:id` with the issue 34 lists. */
export interface WireShopOverview {
  shop: WireShop;
  readiness: WireReadinessCheck[];
  suggestions: WireSuggestion[];
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

/** Explicit size; absent means one standard bike-sized unit (issue 34). */
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
  deliverySize?: WireDeliverySize;
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
  /** Present once the issue 34 API is deployed. */
  readiness?: WireReadinessCheck[];
  suggestions?: WireSuggestion[];
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

/** Issue 34 signup: the login number becomes the verified contact. */
export interface CreateSimpleShopBody {
  name: string;
  townId: string;
  termsVersion: string;
  agreeToTerms: true;
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
  /** Optional since issue 34: food is assumed to fit on a bike. */
  deliverySize?: WireDeliverySize;
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

export interface PickupBody {
  lat: number;
  lng: number;
  address: string;
}

/** Town food settings an admin controls (issue 34). */
export interface WireFoodTownSettings {
  townId: string;
  /** Orders with more items than this are held for an operator. Default 10. */
  bigOrderItemThreshold: number;
  version: number;
}

export interface ShopCommandArgs {
  idempotencyKey?: string;
}
