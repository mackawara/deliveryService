import { createTheme, type Theme } from '@mui/material/styles';

import { buildComponentOverrides, type Density } from '@/theme/componentOverrides';
import type { BrandTokens } from '@/theme/tokens';

declare module '@mui/material/styles' {
  interface Theme {
    /** The active preset's semantic tokens, for components that need more than the MUI palette. */
    appTokens: BrandTokens;
    /** Current interface density, so components can adapt spacing without re-reading settings. */
    appDensity: Density;
  }
  interface ThemeOptions {
    appTokens?: BrandTokens;
    appDensity?: Density;
  }
}

/** Converts the selected semantic tokens into a complete MUI theme. */
export function createAppTheme(tokens: BrandTokens, density: Density = 'comfortable'): Theme {
  const { palette } = tokens;

  return createTheme({
    appTokens: tokens,
    appDensity: density,
    palette: {
      mode: 'light',
      primary: {
        main: palette.primary.main,
        dark: palette.primary.active,
        light: palette.primary.soft,
        contrastText: palette.primary.contrastText,
      },
      secondary: {
        main: palette.secondary.main,
        dark: palette.secondary.hover,
        light: palette.secondary.soft,
        contrastText: palette.secondary.contrastText,
      },
      error: { main: palette.status.critical.foreground, contrastText: palette.text.onAccent },
      warning: { main: palette.status.caution.foreground, contrastText: palette.text.onAccent },
      info: { main: palette.status.info.foreground, contrastText: palette.text.onAccent },
      success: { main: palette.status.positive.foreground, contrastText: palette.text.onAccent },
      background: {
        default: palette.background.page,
        paper: palette.background.surface,
      },
      text: {
        primary: palette.text.primary,
        secondary: palette.text.muted,
        disabled: palette.text.disabled,
      },
      divider: palette.border.divider,
      action: {
        hover: palette.action.hover,
        selected: palette.action.selected,
        disabled: palette.action.disabledText,
        disabledBackground: palette.action.disabledBackground,
      },
    },
    shape: { borderRadius: 8 },
    spacing: density === 'compact' ? 6 : 8,
    typography: {
      fontFamily:
        '"Inter", "Segoe UI", system-ui, -apple-system, "Helvetica Neue", Arial, sans-serif',
      h1: { fontSize: '1.75rem', fontWeight: 700, lineHeight: 1.25 },
      h2: { fontSize: '1.5rem', fontWeight: 700, lineHeight: 1.3 },
      h3: { fontSize: '1.25rem', fontWeight: 700, lineHeight: 1.35 },
      h4: { fontSize: '1.125rem', fontWeight: 700 },
      h5: { fontSize: '1rem', fontWeight: 700 },
      h6: { fontSize: '0.9375rem', fontWeight: 700 },
      subtitle2: { fontWeight: 600 },
      body2: { fontSize: '0.875rem' },
      button: { textTransform: 'none', fontWeight: 600 },
      caption: { fontSize: '0.75rem' },
    },
    breakpoints: {
      // Tablet portrait starts at 768px; the expanded dispatch layout starts at 1200px.
      values: { xs: 0, sm: 600, md: 768, lg: 1200, xl: 1536 },
    },
    components: buildComponentOverrides(tokens, density),
  });
}
