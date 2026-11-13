import { useEffect } from 'react';

import { externalNavigation } from '@/lib/externalNavigation';

/**
 * Shared-device protection: a page the browser restores from its back/forward cache
 * comes back exactly as it was left, data and all, without asking the server. After
 * leaving for the login page or signing out, pressing Back must not show that. A
 * restored page is reloaded instead, so it starts from the current session.
 */
export function useBackForwardCacheGuard(): void {
  useEffect(() => {
    const onPageShow = (event: PageTransitionEvent) => {
      if (event.persisted) externalNavigation.reload();
    };
    window.addEventListener('pageshow', onPageShow);
    return () => window.removeEventListener('pageshow', onPageShow);
  }, []);
}
