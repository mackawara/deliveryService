/**
 * Staff roles, capabilities and town scope (specification sections 3 and 5.3).
 *
 * Every check here decides what the interface offers. The backend stays authoritative:
 * hiding a navigation item is not authorization, and a direct URL still passes its guard.
 */
export type StaffRole = 'operator' | 'finance' | 'admin';

export const STAFF_ROLES: readonly StaffRole[] = ['operator', 'finance', 'admin'] as const;

export interface TownRef {
  id: string;
  name: string;
}

export interface TownAccess {
  /** Explicit from the server. An empty town list must never imply unrestricted access. */
  allTowns: boolean;
  towns: TownRef[];
}

export interface StaffSession {
  user: { id: string; name: string; maskedPhone: string };
  roles: StaffRole[];
  townAccess: TownAccess;
  capabilities: string[];
  session: { expiresAt: string; idleExpiresAt: string };
}

/**
 * Capability strings the interface reads. They are a proposed contract for
 * `GET /api/v1/admin/me`; unknown capabilities returned by the server are ignored by
 * the UI but still enforced server-side.
 */
export const CAPABILITY = {
  bookingsRead: 'bookings.read',
  bookingsWrite: 'bookings.write',
  dispatchAssign: 'dispatch.assign',
  driversRead: 'drivers.read',
  driversWrite: 'drivers.write',
  driversApprove: 'drivers.approve',
  vehiclesWrite: 'vehicles.write',
  customersRead: 'customers.read',
  enquiriesWrite: 'enquiries.write',
  paymentsRead: 'payments.read',
  paymentsReconcile: 'payments.reconcile',
  cashCollect: 'cash.collect',
  cashRemit: 'cash.remit',
  refundsRequest: 'refunds.request',
  refundsApprove: 'refunds.approve',
  refundsSettle: 'refunds.settle',
  fraudReport: 'fraud.report',
  restrictionsManage: 'restrictions.manage',
  configurationRead: 'configuration.read',
  configurationWrite: 'configuration.write',
  auditRead: 'audit.read',
  auditReadFinance: 'audit.read.finance',
  staffManage: 'staff.manage',
} as const;

export type CapabilityId = (typeof CAPABILITY)[keyof typeof CAPABILITY];

/** An access requirement is satisfied when every listed dimension is satisfied. */
export interface AccessRequirement {
  /** Any one of these roles is enough. */
  anyRole?: StaffRole[];
  /** Any one of these capabilities is enough. */
  anyCapability?: string[];
  /** All of these capabilities are required. */
  allCapabilities?: string[];
}

export function hasRole(session: StaffSession | null | undefined, role: StaffRole): boolean {
  return Boolean(session?.roles.includes(role));
}

export function hasAnyRole(
  session: StaffSession | null | undefined,
  roles: readonly StaffRole[],
): boolean {
  if (!session) return false;
  return roles.some((role) => session.roles.includes(role));
}

export function hasCapability(
  session: StaffSession | null | undefined,
  capability: string,
): boolean {
  return Boolean(session?.capabilities.includes(capability));
}

/**
 * Owning an admin role does not automatically grant operator or finance
 * (specification section 1), so requirements are evaluated exactly as written.
 */
export function meetsRequirement(
  session: StaffSession | null | undefined,
  requirement: AccessRequirement | undefined,
): boolean {
  if (!session) return false;
  if (!requirement) return true;
  if (requirement.anyRole && !hasAnyRole(session, requirement.anyRole)) return false;
  if (
    requirement.anyCapability &&
    !requirement.anyCapability.some((c) => hasCapability(session, c))
  ) {
    return false;
  }
  if (
    requirement.allCapabilities &&
    !requirement.allCapabilities.every((c) => hasCapability(session, c))
  ) {
    return false;
  }
  return true;
}

export function canAccessTown(
  session: StaffSession | null | undefined,
  townId: string | null,
): boolean {
  if (!session || !townId) return false;
  if (session.townAccess.allTowns) return true;
  return session.townAccess.towns.some((town) => town.id === townId);
}

/** Towns the signed-in user may select, given the full town list from configuration. */
export function selectableTowns(
  session: StaffSession | null | undefined,
  allTowns: TownRef[],
): TownRef[] {
  if (!session) return [];
  if (session.townAccess.allTowns) return allTowns;
  const allowed = new Set(session.townAccess.towns.map((town) => town.id));
  const scoped = allTowns.filter((town) => allowed.has(town.id));
  // Fall back to the names the session itself carries when the town list has not loaded.
  return scoped.length > 0 ? scoped : session.townAccess.towns;
}

export function describeRoles(roles: StaffRole[]): string {
  if (roles.length === 0) return 'No roles assigned';
  return roles.map((role) => role.charAt(0).toUpperCase() + role.slice(1)).join(', ');
}
