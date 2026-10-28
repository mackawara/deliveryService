import { Alert } from '@mui/material';
import { Navigate, useParams } from 'react-router-dom';

import { useOwnerAuth } from '@/auth/useOwnerAuth';
import { appConfig } from '@/config';

/** Friendly aliases choose only an authorized branch; the API checks statement ownership. */
export function ShopFinanceEntry({
  section,
}: {
  section: 'earnings' | 'payout-details' | 'settlements';
}) {
  const { session } = useOwnerAuth();
  const { id } = useParams();
  if (!appConfig.enableFoodSettlements || !session?.capabilities.includes('settlements:read'))
    return <Alert severity="info">Shop earnings are not available yet.</Alert>;
  const memberships = session.memberships.filter(
    (membership) =>
      membership.status === 'ACTIVE' &&
      (membership.role === 'OWNER' || membership.role === 'MANAGER'),
  );
  let saved: string | null = null;
  try {
    saved = localStorage.getItem(`shop-branch:${session.owner.id}`);
  } catch {
    /* Optional preference. */
  }
  const shopId =
    memberships.find((membership) => membership.shopId === saved)?.shopId ?? memberships[0]?.shopId;
  return (
    <Navigate
      replace
      to={
        shopId
          ? `/shop/${encodeURIComponent(shopId)}/${section}${section === 'settlements' && id ? `/${encodeURIComponent(id)}` : ''}`
          : '/shop/setup'
      }
    />
  );
}
