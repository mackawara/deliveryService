import AccessTimeIcon from '@mui/icons-material/AccessTime';
import BlockIcon from '@mui/icons-material/Block';
import CancelIcon from '@mui/icons-material/Cancel';
import CheckCircleIcon from '@mui/icons-material/CheckCircle';
import DoneAllIcon from '@mui/icons-material/DoneAll';
import DraftsIcon from '@mui/icons-material/Drafts';
import ErrorIcon from '@mui/icons-material/Error';
import HelpIcon from '@mui/icons-material/Help';
import HourglassEmptyIcon from '@mui/icons-material/HourglassEmpty';
import InventoryIcon from '@mui/icons-material/Inventory2';
import LocalShippingIcon from '@mui/icons-material/LocalShipping';
import MarkEmailReadIcon from '@mui/icons-material/MarkEmailRead';
import PaidIcon from '@mui/icons-material/Paid';
import PauseCircleIcon from '@mui/icons-material/PauseCircle';
import PaymentsIcon from '@mui/icons-material/Payments';
import PowerSettingsNewIcon from '@mui/icons-material/PowerSettingsNew';
import RateReviewIcon from '@mui/icons-material/RateReview';
import ReplayIcon from '@mui/icons-material/Replay';
import RequestQuoteIcon from '@mui/icons-material/RequestQuote';
import TaskAltIcon from '@mui/icons-material/TaskAlt';
import UndoIcon from '@mui/icons-material/Undo';
import Box from '@mui/material/Box';
import Tooltip from '@mui/material/Tooltip';
import type { SvgIconComponent } from '@mui/icons-material';
import { useTheme } from '@mui/material/styles';

import type { StatusDescriptor, StatusIconName } from '@/components/statusMeta';

const ICONS: Record<StatusIconName, SvgIconComponent> = {
  draft: DraftsIcon,
  review: RateReviewIcon,
  quote: RequestQuoteIcon,
  confirmed: CheckCircleIcon,
  ready: InventoryIcon,
  assigned: TaskAltIcon,
  transit: LocalShippingIcon,
  delivered: DoneAllIcon,
  failed: ErrorIcon,
  returned: UndoIcon,
  cancelled: CancelIcon,
  paid: PaidIcon,
  cash: PaymentsIcon,
  pending: HourglassEmptyIcon,
  unknown: HelpIcon,
  refund: ReplayIcon,
  blocked: BlockIcon,
  available: CheckCircleIcon,
  break: PauseCircleIcon,
  offline: PowerSettingsNewIcon,
  busy: AccessTimeIcon,
  open: MarkEmailReadIcon,
  closed: TaskAltIcon,
};

export interface StatusChipProps {
  descriptor: StatusDescriptor;
  size?: 'small' | 'medium';
}

/**
 * A status is always a label plus an icon plus a tone, and the tone's border style
 * differs per state, so the monochrome preset stays distinguishable without hue
 * (specification sections 7 and 8).
 */
export function StatusChip({ descriptor, size = 'small' }: StatusChipProps) {
  const theme = useTheme();
  const tone = theme.appTokens.palette.status[descriptor.tone];
  const Icon = ICONS[descriptor.icon];

  const chip = (
    <Box
      component="span"
      sx={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: 0.5,
        px: size === 'small' ? 0.75 : 1.25,
        py: size === 'small' ? 0.25 : 0.5,
        borderRadius: 1,
        borderWidth: 1,
        borderStyle: tone.borderStyle,
        borderColor: tone.border,
        backgroundColor: tone.background,
        color: tone.foreground,
        fontSize: size === 'small' ? '0.75rem' : '0.8125rem',
        fontWeight: 600,
        lineHeight: 1.4,
        whiteSpace: 'nowrap',
      }}
    >
      <Icon sx={{ fontSize: size === 'small' ? 14 : 16 }} aria-hidden />
      {descriptor.label}
    </Box>
  );

  return descriptor.hint ? (
    <Tooltip title={descriptor.hint} arrow>
      {chip}
    </Tooltip>
  ) : (
    chip
  );
}
