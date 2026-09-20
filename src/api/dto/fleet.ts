import type {
  Actor,
  DimensionsCm,
  DistanceKind,
  GeoPoint,
  HandlingCode,
  IsoDateTime,
  VehicleClass,
  WireDocument,
  WireVersioned,
} from '@/api/dto/common';

export const DRIVER_APPROVAL_STATES = [
  'APPLICATION',
  'PHONE_VERIFIED',
  'DOCUMENTS_UNDER_REVIEW',
  'VEHICLE_CHECKED',
  'APPROVED',
  'REJECTED',
  'ACTIVATED',
] as const;
export type DriverApprovalState = (typeof DRIVER_APPROVAL_STATES)[number];

export const DRIVER_STATUSES = ['ACTIVE', 'SUSPENDED', 'INACTIVE'] as const;
export type DriverStatus = (typeof DRIVER_STATUSES)[number];

export interface WireDriver extends WireDocument, WireVersioned {
  townId: string;
  name: string;
  normalizedPhone: string;
  whatsappId: string;
  staffReference?: string;
  ownershipModel: 'COMPANY' | 'INDEPENDENT';
  allowedVehicleClasses: VehicleClass[];
  assignedVehicleId?: string;
  status: DriverStatus;
  approvalState: DriverApprovalState;
  checks: {
    licenseExpiresAt?: IsoDateTime;
    vehicleCheckedAt?: IsoDateTime;
    documentsVerifiedAt?: IsoDateTime;
  };
  suspension?: { reason: string; by: Actor; at: IsoDateTime };
  rejection?: { reason: string; by: Actor; at: IsoDateTime; appealNote?: string };
}

export const AVAILABILITY_STATES = [
  'OFF_DUTY',
  'AVAILABLE',
  'BREAK',
  'RESERVED',
  'BUSY',
  'UNAVAILABLE',
] as const;
export type AvailabilityState = (typeof AVAILABILITY_STATES)[number];

/** Availability an operator may request; Busy and Reserved are operational states. */
export const REQUESTABLE_AVAILABILITY = ['AVAILABLE', 'BREAK', 'OFF_DUTY'] as const;
export type RequestableAvailability = (typeof REQUESTABLE_AVAILABILITY)[number];

export interface WirePresence extends WireDocument, WireVersioned {
  driverId: string;
  townId: string;
  availability: AvailabilityState;
  requestedPostJobStatus?: 'BREAK' | 'OFF_DUTY';
  shift: { startedAt?: IsoDateTime; endedAt?: IsoDateTime };
  vehicleId?: string;
  position?: GeoPoint;
  positionSource?: 'DRIVER_PIN' | 'OPERATOR_CONFIRMED';
  positionReceivedAt?: IsoDateTime;
  positionObservedAt?: IsoDateTime;
  currentBookingId?: string;
  currentAssignmentId?: string;
  lastIdleSince?: IsoDateTime;
  unavailableReason?: string;
  lastStatusChangeBy?: Actor;
}

/** `GET /admin/drivers` wraps each row as `{ driver, presence }`. */
export interface WireDriverRow {
  driver: WireDriver;
  presence: WirePresence | null;
}

export interface WireVehicle extends WireDocument, WireVersioned {
  townId: string;
  registration: string;
  vehicleClass: VehicleClass;
  label?: string;
  capacity: {
    maxWeightKg: number;
    cargoDimensionsCm: DimensionsCm;
    accessOpeningCm: { widthCm: number; heightCm: number };
  };
  handlingCapabilities: HandlingCode[];
  serviceStatus: 'IN_SERVICE' | 'MAINTENANCE' | 'OUT_OF_SERVICE';
  linkedDriverId?: string;
}

/** A dispatch candidate row; the result is returned directly, not wrapped in `items`. */
export interface WireCandidate {
  driverId: string;
  driverName: string;
  vehicleId: string;
  registration: string;
  vehicleClass: VehicleClass;
  availability: AvailabilityState;
  /** Spherical geographic distance to pickup; never a road distance or an ETA. */
  distanceMeters: number | null;
  distanceKind: DistanceKind;
  locationAgeSeconds: number | null;
  positionSource?: 'DRIVER_PIN' | 'OPERATOR_CONFIRMED';
  locationFresh: boolean;
  idleSeconds: number | null;
  suitability: { fits: boolean; inspectionRequired: boolean; reasons: string[] };
  presenceVersion: number;
}

export interface WireCandidateResult {
  ranked: WireCandidate[];
  staleLocation: WireCandidate[];
  unsuitable: WireCandidate[];
  pickupPointAvailable: boolean;
}

export interface WireAvailabilityResult {
  presence: WirePresence;
  applied: boolean;
  /** A break or end-shift asked for during a job takes effect after it completes. */
  deferred: boolean;
}
