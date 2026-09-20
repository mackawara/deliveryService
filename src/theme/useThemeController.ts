import { useContext } from 'react';

import { ThemeControllerContext, type ThemeControllerValue } from '@/theme/ThemeController';

export function useThemeController(): ThemeControllerValue {
  const value = useContext(ThemeControllerContext);
  if (!value) {
    throw new Error('useThemeController must be used inside <ThemeController>');
  }
  return value;
}
