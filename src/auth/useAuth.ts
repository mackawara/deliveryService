import { useContext } from 'react';

import { AuthContext, type AuthContextValue } from '@/auth/AuthProvider';
import type { AccessRequirement, StaffSession } from '@/lib/permissions';
import { meetsRequirement } from '@/lib/permissions';

export function useAuth(): AuthContextValue {
  const value = useContext(AuthContext);
  if (!value) throw new Error('useAuth must be used inside <AuthProvider>');
  return value;
}

/** The signed-in staff session, or null while loading or when unauthenticated. */
export function useStaffSession(): StaffSession | null {
  return useAuth().session;
}

/**
 * Whether the signed-in user may see a control. The server remains authoritative:
 * this only decides what the interface offers.
 */
export function useHasAccess(requirement: AccessRequirement | undefined): boolean {
  const session = useStaffSession();
  return meetsRequirement(session, requirement);
}
