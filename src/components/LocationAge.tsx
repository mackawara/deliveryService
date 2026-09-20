import Stack from '@mui/material/Stack';
import Tooltip from '@mui/material/Tooltip';
import Typography from '@mui/material/Typography';

import { StatusChip } from '@/components/StatusChip';
import { formatAge, formatAgeSeconds, formatDateTime } from '@/lib/datetime';

export interface LocationAgeProps {
  /** Server receipt time of the position. */
  receivedAt: string | null | undefined;
  /** Seconds since the position was received, when the server already computed it. */
  ageSeconds?: number | null;
  /** The server's own freshness decision; the UI does not invent a threshold. */
  fresh?: boolean;
  source?: 'DRIVER_PIN' | 'OPERATOR_CONFIRMED' | undefined;
}

const SOURCE_LABEL: Record<string, string> = {
  DRIVER_PIN: 'Driver pin',
  OPERATOR_CONFIRMED: 'Operator confirmed',
};

/**
 * Position age and source. A manual pin is not live telemetry, so nothing here shows
 * an animated position or a driving ETA (specification section 4.3).
 */
export function LocationAge({ receivedAt, ageSeconds, fresh, source }: LocationAgeProps) {
  if (!receivedAt && (ageSeconds === null || ageSeconds === undefined)) {
    return (
      <StatusChip
        descriptor={{
          label: 'No location',
          tone: 'caution',
          icon: 'unknown',
          hint: 'This driver has no recorded position; contact them to confirm where they are.',
        }}
      />
    );
  }

  const ageText =
    ageSeconds !== null && ageSeconds !== undefined
      ? formatAgeSeconds(ageSeconds)
      : formatAge(receivedAt);

  return (
    <Stack spacing={0.25}>
      <Tooltip
        title={receivedAt ? `Received ${formatDateTime(receivedAt)}` : 'Receipt time unavailable'}
        arrow
      >
        <Typography
          variant="body2"
          sx={{ color: fresh === false ? 'warning.main' : 'text.primary' }}
        >
          {ageText}
          {fresh === false ? ' (stale)' : ''}
        </Typography>
      </Tooltip>
      {source ? (
        <Typography variant="caption" color="text.secondary">
          {SOURCE_LABEL[source] ?? source}
        </Typography>
      ) : null}
    </Stack>
  );
}
