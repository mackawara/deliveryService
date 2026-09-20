import type { BrandTokens } from '@/theme/tokens';

/**
 * Black/white preset. Status meaning is carried by greyscale value, border style and
 * the label/icon that every status control renders; black-and-white branding is not
 * dark mode, which stays a separate future setting.
 */
export const monochrome: BrandTokens = {
  id: 'monochrome',
  label: 'Black & white',
  description: 'Greyscale branding with high-contrast controls and patterned statuses.',
  palette: {
    primary: {
      main: '#111111',
      hover: '#2B2B2B',
      active: '#000000',
      contrastText: '#FFFFFF',
      soft: '#EDEDED',
      softText: '#111111',
    },
    secondary: {
      main: '#404040',
      hover: '#2B2B2B',
      contrastText: '#FFFFFF',
      soft: '#E4E4E4',
      softText: '#262626',
    },
    background: {
      page: '#F7F7F7',
      surface: '#FFFFFF',
      surfaceMuted: '#F0F0F0',
      sidebar: '#FFFFFF',
      sidebarText: '#262626',
      sidebarActive: '#E8E8E8',
      sidebarActiveText: '#111111',
      header: '#FFFFFF',
      headerText: '#111111',
      overlay: 'rgba(17, 17, 17, 0.52)',
    },
    text: {
      primary: '#111111',
      muted: '#525252',
      disabled: '#767676',
      onAccent: '#FFFFFF',
    },
    border: {
      divider: '#DEDEDE',
      control: '#767676',
      controlHover: '#4A4A4A',
      strong: '#262626',
      focusRing: '#111111',
    },
    action: {
      hover: 'rgba(17, 17, 17, 0.06)',
      selected: 'rgba(17, 17, 17, 0.12)',
      disabledBackground: '#ECECEC',
      disabledText: '#6B6B6B',
    },
    status: {
      neutral: {
        foreground: '#525252',
        background: '#F0F0F0',
        border: '#767676',
        borderStyle: 'solid',
      },
      info: {
        foreground: '#3A3A3A',
        background: '#EFEFEF',
        border: '#6B6B6B',
        borderStyle: 'solid',
      },
      progress: {
        foreground: '#404040',
        background: '#E9E9E9',
        border: '#5A5A5A',
        borderStyle: 'dashed',
      },
      positive: {
        foreground: '#1F1F1F',
        background: '#E4E4E4',
        border: '#3D3D3D',
        borderStyle: 'solid',
      },
      caution: {
        foreground: '#333333',
        background: '#F2F2F2',
        border: '#4A4A4A',
        borderStyle: 'dashed',
      },
      critical: {
        foreground: '#111111',
        background: '#E0E0E0',
        border: '#111111',
        borderStyle: 'double',
      },
    },
  },
};
