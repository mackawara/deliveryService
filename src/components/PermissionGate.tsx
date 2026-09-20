import type { ReactNode } from 'react';

import { useStaffSession } from '@/auth/useAuth';
import { meetsRequirement, type AccessRequirement } from '@/lib/permissions';

export interface PermissionGateProps {
  requirement: AccessRequirement;
  children: ReactNode;
  /** Rendered instead of the children when the requirement is not met. */
  fallback?: ReactNode;
}

/**
 * Hides a control the signed-in user may not use. This is presentation only: the
 * matching route guard and the backend both still enforce access
 * (specification section 3).
 */
export function PermissionGate({ requirement, children, fallback = null }: PermissionGateProps) {
  const session = useStaffSession();
  return <>{meetsRequirement(session, requirement) ? children : fallback}</>;
}
