/**
 * Wire DTOs (specification section 9).
 *
 * These describe the JSON the backend actually sends: MongoDB documents carry `_id`
 * and every `Date` arrives as an ISO string. They are deliberately not copies of the
 * backend's interfaces, which use `Date` objects. Entities are normalized to `id` at
 * the API boundary by the adapters in `src/api/adapters.ts`.
 */

export type IsoDateTime = string;

export interface WireDocument {
  _id: string;
}

export interface WireVersioned {
  version: number;
  createdAt: IsoDateTime;
  updatedAt: IsoDateTime;
}

export type ActorType = 'CUSTOMER' | 'DRIVER' | 'OPERATOR' | 'FINANCE' | 'ADMIN' | 'SYSTEM';

export interface Actor {
  type: ActorType;
  id: string;
  label?: string;
}

export type Position = [longitude: number, latitude: number];

export interface GeoPoint {
  type: 'Point';
  coordinates: Position;
}

export interface GeoPolygon {
  type: 'Polygon';
  coordinates: Position[][];
}

export interface GeoMultiPolygon {
  type: 'MultiPolygon';
  coordinates: Position[][][];
}

export type GeoArea = GeoPolygon | GeoMultiPolygon;

/** Every distance the service reports is a spherical geographic distance. */
export type DistanceKind = 'GEOGRAPHIC';

export interface DimensionsCm {
  lengthCm: number;
  widthCm: number;
  heightCm: number;
}

export const HANDLING_CODES = ['FRAGILE', 'LIQUID', 'KEEP_UPRIGHT', 'LOADING_HELP'] as const;
export type HandlingCode = (typeof HANDLING_CODES)[number];

export const VEHICLE_CLASSES = ['MOTORCYCLE', 'CAR', 'VAN', 'TRUCK'] as const;
export type VehicleClass = (typeof VEHICLE_CLASSES)[number];

/** Offset pagination: `limit` ≤ 100 and `skip` ≤ 10,000 (specification section 2). */
export const MAX_PAGE_SIZE = 100;
export const MAX_SKIP = 10_000;
export const DEFAULT_PAGE_SIZE = 25;

export interface PageQuery {
  limit?: number;
  skip?: number;
}

/**
 * The backend's list envelope. Most lists carry no total or has-more metadata, so the
 * UI shows a loaded range and a next-page probe instead of a fictitious total.
 */
export interface WireList<T> {
  items: T[];
  limit?: number;
  skip?: number;
}

/** A loaded page with the paging context the UI needs, and never an invented total. */
export interface Page<T> {
  items: T[];
  limit: number;
  skip: number;
  /** A full-sized page permits a next-page probe, which may come back empty. */
  hasProbableNextPage: boolean;
}

export type EntityOf<T extends WireDocument> = Omit<T, '_id'> & { id: string };
