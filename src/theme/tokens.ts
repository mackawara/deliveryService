/**
 * Typed semantic token contract (specification section 7).
 *
 * Every colour used anywhere in the application is declared here and supplied by a
 * preset. Feature components read `theme.palette`, `theme.appTokens` or `sx` theme
 * references; they never contain brand hex values, so adding a preset is a registry
 * change rather than a change to feature code.
 */

/** Semantic meaning of a state, never conveyed by colour alone. */
export type StatusTone = 'neutral' | 'info' | 'progress' | 'positive' | 'caution' | 'critical';

export interface StatusToneTokens {
  /** Text/icon colour; must reach 4.5:1 on `background`. */
  foreground: string;
  /** Soft chip background. */
  background: string;
  /** Chip outline; must reach 3:1 on the surface behind it. */
  border: string;
  /** Border style so monochrome states stay distinguishable without hue. */
  borderStyle: 'solid' | 'dashed' | 'double';
}

export interface BrandTokens {
  id: string;
  /** Human label shown in the theme selector. */
  label: string;
  /** Short description used by the appearance settings page. */
  description: string;
  palette: {
    primary: {
      main: string;
      hover: string;
      active: string;
      contrastText: string;
      soft: string;
      softText: string;
    };
    secondary: {
      main: string;
      hover: string;
      contrastText: string;
      soft: string;
      softText: string;
    };
    background: {
      page: string;
      surface: string;
      surfaceMuted: string;
      sidebar: string;
      sidebarText: string;
      sidebarActive: string;
      sidebarActiveText: string;
      header: string;
      headerText: string;
      overlay: string;
    };
    text: {
      primary: string;
      muted: string;
      disabled: string;
      onAccent: string;
    };
    border: {
      /** Decorative rules and table separators only. */
      divider: string;
      /** Input and control outlines; validated for 3:1 against the surface. */
      control: string;
      controlHover: string;
      strong: string;
      focusRing: string;
    };
    action: {
      hover: string;
      selected: string;
      disabledBackground: string;
      disabledText: string;
    };
    status: Record<StatusTone, StatusToneTokens>;
  };
}

export const STATUS_TONES: readonly StatusTone[] = [
  'neutral',
  'info',
  'progress',
  'positive',
  'caution',
  'critical',
] as const;
