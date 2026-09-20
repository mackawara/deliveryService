import Box from '@mui/material/Box';

import { UNAVAILABLE, formatCents } from '@/lib/money';

export interface MoneyProps {
  cents: number | null | undefined;
  /** Renders in a heavier weight for a headline amount such as the accepted price. */
  emphasis?: boolean;
  /** Label read by assistive technology when the amount has a specific meaning. */
  srLabel?: string;
}

/**
 * USD amounts are stored as integer cents and formatted consistently. An unknown
 * amount is shown as unavailable, never as 0 (specification section 8).
 */
export function Money({ cents, emphasis = false, srLabel }: MoneyProps) {
  const text = formatCents(cents);
  const unknown = text === UNAVAILABLE;

  return (
    <Box
      component="span"
      sx={{
        fontVariantNumeric: 'tabular-nums',
        fontWeight: emphasis ? 700 : 500,
        color: unknown ? 'text.secondary' : 'text.primary',
        whiteSpace: 'nowrap',
      }}
      aria-label={srLabel ? `${srLabel}: ${unknown ? 'unavailable' : text}` : undefined}
      title={unknown ? 'Amount not available' : undefined}
    >
      {text}
    </Box>
  );
}
