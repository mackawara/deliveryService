import type { BrandTokens } from '@/theme/tokens';

/**
 * Purple/pink preset. Soft backgrounds with readable darker controls; status colours
 * are always paired with a label and an icon so meaning never depends on hue.
 */
export const orchid: BrandTokens = {
  id: 'orchid',
  label: 'Purple & pink',
  description: 'Soft violet surfaces with deep purple controls and pink accents.',
  palette: {
    primary: {
      main: '#6D28D9',
      hover: '#5B21B6',
      active: '#4C1D95',
      contrastText: '#FFFFFF',
      soft: '#F1E9FE',
      softText: '#4C1D95',
    },
    secondary: {
      main: '#BE185D',
      hover: '#9D174D',
      contrastText: '#FFFFFF',
      soft: '#FCE7F1',
      softText: '#831843',
    },
    background: {
      page: '#FAF7FF',
      surface: '#FFFFFF',
      surfaceMuted: '#F4EFFB',
      sidebar: '#FFFFFF',
      sidebarText: '#3B2F4A',
      sidebarActive: '#F1E9FE',
      sidebarActiveText: '#4C1D95',
      header: '#FFFFFF',
      headerText: '#181221',
      overlay: 'rgba(24, 18, 33, 0.48)',
    },
    text: {
      primary: '#181221',
      muted: '#655B70',
      disabled: '#8E8698',
      onAccent: '#FFFFFF',
    },
    border: {
      divider: '#E7DFF0',
      control: '#7E7490',
      controlHover: '#5B5168',
      strong: '#3B2F4A',
      focusRing: '#6D28D9',
    },
    action: {
      hover: 'rgba(109, 40, 217, 0.08)',
      selected: 'rgba(109, 40, 217, 0.14)',
      disabledBackground: '#EFEAF5',
      disabledText: '#6F6878',
    },
    status: {
      neutral: {
        foreground: '#4A4453',
        background: '#F2EFF6',
        border: '#7E7490',
        borderStyle: 'solid',
      },
      info: {
        foreground: '#1F5F8B',
        background: '#E7F1F8',
        border: '#3B7FA8',
        borderStyle: 'solid',
      },
      progress: {
        foreground: '#4C1D95',
        background: '#F1E9FE',
        border: '#6D28D9',
        borderStyle: 'dashed',
      },
      positive: {
        foreground: '#14634A',
        background: '#E4F2EC',
        border: '#2F7F64',
        borderStyle: 'solid',
      },
      caution: {
        foreground: '#8A5A00',
        background: '#FBF0DC',
        border: '#A8761F',
        borderStyle: 'dashed',
      },
      critical: {
        foreground: '#A31621',
        background: '#FBE7E9',
        border: '#A31621',
        borderStyle: 'double',
      },
    },
  },
};
