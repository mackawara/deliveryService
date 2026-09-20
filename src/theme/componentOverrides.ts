import type { Components, Theme } from '@mui/material/styles';

import type { BrandTokens } from '@/theme/tokens';

export type Density = 'comfortable' | 'compact';

/**
 * Centralized component overrides (specification section 7). Every colour comes from
 * the active preset, so switching brands restyles the sidebar, header, cards, chips,
 * dialogs, inputs, tooltips, focus rings and empty states in one step.
 */
export function buildComponentOverrides(tokens: BrandTokens, density: Density): Components<Theme> {
  const { palette } = tokens;
  const compact = density === 'compact';
  const cellPaddingY = compact ? 6 : 12;
  const cellPaddingX = compact ? 10 : 16;

  const focusRing = {
    outline: `3px solid ${palette.border.focusRing}`,
    outlineOffset: '2px',
  } as const;

  return {
    MuiCssBaseline: {
      styleOverrides: {
        body: {
          backgroundColor: palette.background.page,
          color: palette.text.primary,
        },
        // A single, always-visible focus treatment for keyboard users.
        '*:focus-visible': focusRing,
        '::selection': {
          backgroundColor: palette.primary.soft,
          color: palette.primary.softText,
        },
      },
    },
    MuiPaper: {
      styleOverrides: {
        root: {
          backgroundImage: 'none',
          backgroundColor: palette.background.surface,
        },
        outlined: {
          borderColor: palette.border.divider,
        },
      },
    },
    MuiAppBar: {
      defaultProps: { elevation: 0, color: 'inherit' },
      styleOverrides: {
        root: {
          backgroundColor: palette.background.header,
          color: palette.background.headerText,
          borderBottom: `1px solid ${palette.border.divider}`,
        },
      },
    },
    MuiDrawer: {
      styleOverrides: {
        paper: {
          backgroundColor: palette.background.sidebar,
          color: palette.background.sidebarText,
          borderRight: `1px solid ${palette.border.divider}`,
        },
      },
    },
    MuiButton: {
      defaultProps: { disableElevation: true, size: compact ? 'small' : 'medium' },
      variants: [
        {
          props: { variant: 'contained', color: 'primary' },
          style: {
            backgroundColor: palette.primary.main,
            color: palette.primary.contrastText,
            '&:hover': { backgroundColor: palette.primary.hover },
            '&:active': { backgroundColor: palette.primary.active },
          },
        },
        {
          props: { variant: 'contained', color: 'secondary' },
          style: {
            backgroundColor: palette.secondary.main,
            color: palette.secondary.contrastText,
            '&:hover': { backgroundColor: palette.secondary.hover },
          },
        },
      ],
      styleOverrides: {
        root: {
          textTransform: 'none',
          fontWeight: 600,
          borderRadius: 8,
          minHeight: compact ? 36 : 44,
          '&.Mui-disabled': {
            backgroundColor: palette.action.disabledBackground,
            color: palette.action.disabledText,
          },
          '&:focus-visible': focusRing,
        },
        outlined: {
          borderColor: palette.border.control,
          color: palette.text.primary,
          '&:hover': {
            borderColor: palette.border.controlHover,
            backgroundColor: palette.action.hover,
          },
        },
        text: {
          '&:hover': { backgroundColor: palette.action.hover },
        },
      },
    },
    MuiIconButton: {
      styleOverrides: {
        root: {
          // Tablet touch target (specification section 8).
          minWidth: 44,
          minHeight: 44,
          '&:focus-visible': focusRing,
        },
      },
    },
    MuiLink: {
      defaultProps: { underline: 'hover' },
      styleOverrides: {
        root: {
          color: palette.primary.main,
          fontWeight: 600,
          '&:focus-visible': focusRing,
        },
      },
    },
    MuiTableCell: {
      styleOverrides: {
        root: {
          padding: `${cellPaddingY}px ${cellPaddingX}px`,
          borderBottomColor: palette.border.divider,
        },
        head: {
          backgroundColor: palette.background.surfaceMuted,
          color: palette.text.primary,
          fontWeight: 700,
          whiteSpace: 'nowrap',
        },
      },
    },
    MuiTableRow: {
      styleOverrides: {
        root: {
          '&.Mui-selected': { backgroundColor: palette.action.selected },
          '&:hover': { backgroundColor: palette.action.hover },
        },
      },
    },
    MuiTablePagination: {
      styleOverrides: {
        root: { borderTop: `1px solid ${palette.border.divider}` },
      },
    },
    MuiDialog: {
      styleOverrides: {
        paper: {
          borderRadius: 12,
          border: `1px solid ${palette.border.divider}`,
        },
      },
    },
    MuiBackdrop: {
      styleOverrides: {
        root: { backgroundColor: palette.background.overlay },
      },
    },
    MuiDialogTitle: {
      styleOverrides: {
        root: { fontWeight: 700, color: palette.text.primary },
      },
    },
    MuiChip: {
      styleOverrides: {
        root: {
          fontWeight: 600,
          borderRadius: 6,
        },
        outlined: {
          borderColor: palette.border.control,
        },
      },
    },
    MuiOutlinedInput: {
      styleOverrides: {
        root: {
          backgroundColor: palette.background.surface,
          '& .MuiOutlinedInput-notchedOutline': { borderColor: palette.border.control },
          '&:hover .MuiOutlinedInput-notchedOutline': { borderColor: palette.border.controlHover },
          '&.Mui-focused .MuiOutlinedInput-notchedOutline': {
            borderColor: palette.border.focusRing,
            borderWidth: 2,
          },
          '&.Mui-disabled .MuiOutlinedInput-notchedOutline': {
            borderColor: palette.action.disabledBackground,
          },
        },
        input: {
          paddingTop: compact ? 9 : 13,
          paddingBottom: compact ? 9 : 13,
        },
      },
    },
    MuiInputLabel: {
      styleOverrides: {
        root: {
          color: palette.text.muted,
          '&.Mui-focused': { color: palette.primary.main },
        },
      },
    },
    MuiFormHelperText: {
      styleOverrides: {
        root: {
          color: palette.text.muted,
          '&.Mui-error': { color: palette.status.critical.foreground },
        },
      },
    },
    MuiTextField: {
      defaultProps: { size: compact ? 'small' : 'medium', variant: 'outlined' },
    },
    MuiTooltip: {
      styleOverrides: {
        tooltip: {
          backgroundColor: palette.border.strong,
          color: palette.text.onAccent,
          fontSize: '0.8125rem',
        },
        arrow: { color: palette.border.strong },
      },
    },
    MuiDivider: {
      styleOverrides: {
        root: { borderColor: palette.border.divider },
      },
    },
    MuiListItemButton: {
      styleOverrides: {
        root: {
          borderRadius: 8,
          minHeight: 44,
          '&.Mui-selected': {
            backgroundColor: palette.background.sidebarActive,
            color: palette.background.sidebarActiveText,
            '&:hover': { backgroundColor: palette.background.sidebarActive },
          },
          '&:focus-visible': focusRing,
        },
      },
    },
    MuiTab: {
      styleOverrides: {
        root: {
          textTransform: 'none',
          fontWeight: 600,
          minHeight: 48,
          '&:focus-visible': focusRing,
        },
      },
    },
    MuiAlert: {
      variants: (
        [
          ['error', palette.status.critical],
          ['warning', palette.status.caution],
          ['success', palette.status.positive],
          ['info', palette.status.info],
        ] as const
      ).map(([severity, tone]) => ({
        props: { severity, variant: 'standard' as const },
        style: {
          backgroundColor: tone.background,
          color: tone.foreground,
          borderColor: tone.border,
          borderStyle: tone.borderStyle,
          '& .MuiAlert-icon': { color: tone.foreground },
        },
      })),
      styleOverrides: {
        root: { border: `1px solid ${palette.border.control}` },
      },
    },
    MuiSkeleton: {
      styleOverrides: {
        root: { backgroundColor: palette.background.surfaceMuted },
      },
    },
    MuiCard: {
      defaultProps: { variant: 'outlined' },
      styleOverrides: {
        root: { borderColor: palette.border.divider, borderRadius: 12 },
      },
    },
  };
}
