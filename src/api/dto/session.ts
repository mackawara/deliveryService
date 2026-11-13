/**
 * Session and staff DTOs (specification section 5.4).
 *
 * Signing in is done on the one login page outside this app; these describe what the
 * dashboard reads once a session exists.
 */
import type { IsoDateTime, WireVersioned } from '@/api/dto/common';
import type { StaffRole } from '@/lib/permissions';

export interface WireCsrf {
  csrfToken: string;
}

/** Which of this browser's sessions is acting: staff in the admin shell, an owner in the shop shell. */
export type SessionRole = 'staff' | 'owner';

/** Where a signed-in browser may go. Staff and shop-owner sessions are separate. */
export type AccessDestination = 'ADMIN' | 'SHOP';

/** `GET /api/v1/auth/session`: empty when signed out, both for a dual-role number. */
export interface WireAccess {
  destinations: AccessDestination[];
}

/** A code sent to confirm a number, e.g. a shop's contact number or a staff number change. */
export interface WireOtpChallenge {
  challengeId: string;
  expiresAt: IsoDateTime;
  resendAt: IsoDateTime;
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
