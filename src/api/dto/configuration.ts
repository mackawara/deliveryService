import type {
  Actor,
  DimensionsCm,
  GeoArea,
  HandlingCode,
  IsoDateTime,
  WireDocument,
  WireVersioned,
} from '@/api/dto/common';

export interface OperatingHours {
  /** 0 = Sunday. */
  day: number;
  opensAt: string;
  closesAt: string;
}

export interface TownPolicy {
  cancellationPolicy?: string;
  waitingAllowancePolicy?: string;
  retryAndReturnPolicy?: string;
  liabilityTerms?: string;
  prohibitedGoodsPolicy?: string;
  supportHours?: string;
  responseExpectations?: string;
  taxTreatment?: string;
}

export const TOWN_POLICY_FIELDS: Array<{ key: keyof TownPolicy; label: string }> = [
  { key: 'cancellationPolicy', label: 'Cancellation policy' },
  { key: 'waitingAllowancePolicy', label: 'Waiting allowance policy' },
  { key: 'retryAndReturnPolicy', label: 'Retry and return policy' },
  { key: 'liabilityTerms', label: 'Liability terms' },
  { key: 'prohibitedGoodsPolicy', label: 'Prohibited goods policy' },
  { key: 'supportHours', label: 'Support hours' },
  { key: 'responseExpectations', label: 'Response expectations' },
  { key: 'taxTreatment', label: 'Tax treatment' },
];

export interface TownFeatures {
  bookingEnabled: boolean;
  cashOnDelivery: boolean;
  ecocash: boolean;
  paynowCheckout: boolean;
  independentDriverSignup: boolean;
}

export interface WireTown extends WireDocument, WireVersioned {
  slug: string;
  name: string;
  timezone: string;
  currency: 'USD';
  serviceArea: GeoArea;
  operatingHours: OperatingHours[];
  policy: TownPolicy;
  features: TownFeatures;
  riskControls?: { codExposure?: { maxOpenBookings?: number; maxOpenValueCents?: number } };
  supportContact?: string;
  status: 'ACTIVE' | 'DISABLED';
}

/** `GET /admin/towns` wraps each town with its launch readiness. */
export interface WireTownRow {
  town: WireTown;
  launchReadiness: { ready: boolean; missing: string[] };
}

export interface WireZone extends WireDocument, WireVersioned {
  townId: string;
  code: string;
  label: string;
  aliases: string[];
  polygon: GeoArea;
  /** Lower number wins when boundaries overlap. */
  priority: number;
  status: 'ACTIVE' | 'DISABLED';
}

export interface ZonePairRate {
  fromZoneCode: string;
  toZoneCode: string;
  parcelClass: string;
  priceCents: number;
}

export interface RateExtra {
  code: string;
  label: string;
  priceCents: number;
  requiresCustomerAcceptance: boolean;
}

export interface WireRateCard extends WireDocument, WireVersioned {
  townId: string;
  status: 'DRAFT' | 'PUBLISHED' | 'SUPERSEDED';
  currency: 'USD';
  effectiveFrom?: IsoDateTime;
  effectiveTo?: IsoDateTime;
  zonePairRates: ZonePairRate[];
  extras: RateExtra[];
  taxTreatment?: string;
  createdBy: Actor;
  publishedAt?: IsoDateTime;
  publishedBy?: Actor;
}

export interface WirePublishResult {
  rateCard: WireRateCard;
  /** Zone pairs or parcel classes the published card does not price. */
  coverageGaps: string[];
}

export interface WireParcelPreset extends WireDocument, WireVersioned {
  townId: string;
  code: string;
  label: string;
  examples: string[];
  parcelClass: string;
  maxWeightKg: number;
  maxDimensionsCm: DimensionsCm;
  supportedHandling: HandlingCode[];
  status: 'ACTIVE' | 'RETIRED';
}
