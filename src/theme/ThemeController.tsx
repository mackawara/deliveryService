import CssBaseline from '@mui/material/CssBaseline';
import { ThemeProvider } from '@mui/material/styles';
import { createContext, useCallback, useEffect, useMemo, useState, type ReactNode } from 'react';

import { appConfig } from '@/config';
import { createAppTheme } from '@/theme/createAppTheme';
import type { Density } from '@/theme/componentOverrides';
import {
  BRAND_PRESETS,
  BRAND_PRESET_IDS,
  isBrandPresetId,
  resolvePreset,
  type BrandPresetId,
} from '@/theme/presets';
import type { BrandTokens } from '@/theme/tokens';

export const PRESET_STORAGE_KEY = 'delivery-dashboard.brand-preset';
export const DENSITY_STORAGE_KEY = 'delivery-dashboard.interface-density';

export interface ThemeControllerValue {
  presetId: BrandPresetId;
  setPresetId: (id: BrandPresetId) => void;
  density: Density;
  setDensity: (density: Density) => void;
  tokens: BrandTokens;
  presets: Array<{ id: BrandPresetId; label: string; description: string }>;
}

export const ThemeControllerContext = createContext<ThemeControllerValue | null>(null);

function readStoredPreset(): BrandPresetId | null {
  try {
    const stored = window.localStorage.getItem(PRESET_STORAGE_KEY);
    return isBrandPresetId(stored) ? stored : null;
  } catch {
    // Storage can be unavailable (private mode, blocked cookies); the default still applies.
    return null;
  }
}

function readStoredDensity(): Density | null {
  try {
    const stored = window.localStorage.getItem(DENSITY_STORAGE_KEY);
    return stored === 'compact' || stored === 'comfortable' ? stored : null;
  } catch {
    return null;
  }
}

function writeStorage(key: string, value: string): void {
  try {
    window.localStorage.setItem(key, value);
  } catch {
    // A browser that refuses storage still gets a working theme for this session.
  }
}

/**
 * Owns the selected brand preset and interface density.
 *
 * A deployment setting defines the default and a saved preference wins; only the preset
 * identifier is persisted, unknown identifiers fall back to the default, and switching
 * applies immediately without a reload or a lost form draft (specification section 7).
 */
export function ThemeController({ children }: { children: ReactNode }) {
  const [presetId, setPresetIdState] = useState<BrandPresetId>(
    () => readStoredPreset() ?? appConfig.defaultPresetId,
  );
  const [density, setDensityState] = useState<Density>(() => readStoredDensity() ?? 'comfortable');

  const setPresetId = useCallback((id: BrandPresetId) => {
    setPresetIdState(id);
    writeStorage(PRESET_STORAGE_KEY, id);
  }, []);

  const setDensity = useCallback((next: Density) => {
    setDensityState(next);
    writeStorage(DENSITY_STORAGE_KEY, next);
  }, []);

  // Keep open tabs in the same browser in sync.
  useEffect(() => {
    function onStorage(event: StorageEvent) {
      if (event.key === PRESET_STORAGE_KEY && isBrandPresetId(event.newValue)) {
        setPresetIdState(event.newValue);
      }
      if (
        event.key === DENSITY_STORAGE_KEY &&
        (event.newValue === 'compact' || event.newValue === 'comfortable')
      ) {
        setDensityState(event.newValue);
      }
    }
    window.addEventListener('storage', onStorage);
    return () => window.removeEventListener('storage', onStorage);
  }, []);

  const tokens = useMemo(() => resolvePreset(presetId, appConfig.defaultPresetId), [presetId]);
  const theme = useMemo(() => createAppTheme(tokens, density), [tokens, density]);

  const value = useMemo<ThemeControllerValue>(
    () => ({
      presetId,
      setPresetId,
      density,
      setDensity,
      tokens,
      presets: BRAND_PRESET_IDS.map((id) => ({
        id,
        label: BRAND_PRESETS[id].label,
        description: BRAND_PRESETS[id].description,
      })),
    }),
    [presetId, setPresetId, density, setDensity, tokens],
  );

  return (
    <ThemeControllerContext.Provider value={value}>
      <ThemeProvider theme={theme}>
        <CssBaseline />
        {children}
      </ThemeProvider>
    </ThemeControllerContext.Provider>
  );
}
