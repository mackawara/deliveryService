import { useContext } from 'react';

import { OwnerAuthContext } from '@/auth/OwnerAuthProvider';

export function useOwnerAuth() {
  const context = useContext(OwnerAuthContext);
  if (!context) throw new Error('useOwnerAuth must be used inside OwnerAuthProvider');
  return context;
}
