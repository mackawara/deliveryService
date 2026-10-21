import { Navigate } from 'react-router-dom';

import { useOwnerAuth } from '@/auth/useOwnerAuth';

export function ShopHomePage() {
  const { session } = useOwnerAuth();
  const shopId = session?.memberships.find((membership) => membership.status === 'ACTIVE')?.shopId;
  return <Navigate to={shopId ? `/shop/${shopId}/catalogue` : '/shop/setup'} replace />;
}
