/**
 * Authentication and staff DTOs.
 *
 * These describe the endpoints proposed in specification section 5.4. They do not
 * exist in the inspected API-key implementation and are listed as P0 backend work in
 * section 11; the frontend calls them through RTK Query exactly as specified.
 */
import type { IsoDateTime, WireVersioned } from '@/api/dto/common';
import type { StaffRole } from '@/lib/permissions';

export interface WireCsrf {
  csrfToken: string;
}

export interface OtpRequestBody {
  /** Normalized server-side to E.164; the client only shapes it for usability. */
  phone: string;
  /** Explicit opt-in captured on the login form. */
  consent: boolean;
  /** Makes a network retry idempotent so one tap never sends two messages. */
  requestKey: string;
}

/**
 * The same response shape is returned for unknown, disabled and eligible numbers, so
 * the interface can never disclose staff membership.
 */
export interface WireOtpChallenge {
  challengeId: string;
  expiresAt: IsoDateTime;
  resendAt: IsoDateTime;
}

export interface OtpResendBody {
  challengeId: string;
  requestKey: string;
}

export interface OtpVerifyBody {
  challengeId: string;
  code: string;
}

export interface WireOtpVerified {
  /** Rotated on login; it is not the session secret. */
  csrfToken: string;
  /** Present once the cookie is set, so the client can show expiry immediately. */
  session?: WireSessionWindow;
}

export interface WireSessionWindow {
  expiresAt: IsoDateTime;
  idleExpiresAt: IsoDateTime;
}

/** `GET /api/v1/admin/me`. */
export interface WireStaffSession {
  user: { id: string; name: string; maskedPhone: string };
  roles: StaffRole[];
  /** Explicit: an empty town list must never imply unrestricted access. */
  townAccess: { allTowns: boolean; towns: Array<{ id: string; name: string }> };
  capabilities: string[];
  session: WireSessionWindow;
}

export interface WireActivityResult {
  session: WireSessionWindow;
}

export const STAFF_STATUSES = ['ACTIVE', 'SUSPENDED'] as const;
export type StaffStatus = (typeof STAFF_STATUSES)[number];

export interface WireStaffMember extends WireVersioned {
  id: string;
  name: string;
  maskedPhone: string;
  roles: StaffRole[];
  townAccess: { allTowns: boolean; towns: Array<{ id: string; name: string }> };
  capabilities: string[];
  status: StaffStatus;
  lastSignInAt?: IsoDateTime;
}

export interface CreateStaffBody {
  name: string;
  phone: string;
  roles: StaffRole[];
  allTowns: boolean;
  townIds: string[];
}

export interface UpdateStaffBody {
  roles?: StaffRole[];
  allTowns?: boolean;
  townIds?: string[];
  status?: StaffStatus;
  reason: string;
  expectedVersion?: number;
}

export interface PhoneChangeBody {
  newPhone: string;
  reason: string;
}

export interface WirePhoneChange {
  changeId: string;
  maskedNewPhone: string;
  expiresAt: IsoDateTime;
}

export interface PhoneChangeVerifyBody {
  changeId: string;
  code: string;
}
