import Box from '@mui/material/Box';
import Typography from '@mui/material/Typography';
import type { ReactNode } from 'react';

import { UNAVAILABLE } from '@/lib/money';

export interface KeyValueEntry {
  label: string;
  value: ReactNode;
  /** Renders across both columns, for addresses and notes. */
  wide?: boolean;
}

/** Label/value pairs for detail panes. Missing values read as unavailable, never 0. */
export function KeyValue({
  entries,
  columns = 2,
}: {
  entries: KeyValueEntry[];
  columns?: 1 | 2 | 3;
}) {
  return (
    <Box
      component="dl"
      sx={{
        display: 'grid',
        gridTemplateColumns: { xs: '1fr', md: `repeat(${columns}, minmax(0, 1fr))` },
        gap: 2,
        m: 0,
      }}
    >
      {entries.map((entry) => (
        <Box
          key={entry.label}
          sx={{ gridColumn: entry.wide ? { md: `span ${columns}` } : undefined }}
        >
          <Typography
            component="dt"
            variant="caption"
            color="text.secondary"
            sx={{ textTransform: 'uppercase' }}
          >
            {entry.label}
          </Typography>
          <Typography component="dd" variant="body2" sx={{ m: 0, wordBreak: 'break-word' }}>
            {entry.value === null || entry.value === undefined || entry.value === ''
              ? UNAVAILABLE
              : entry.value}
          </Typography>
        </Box>
      ))}
    </Box>
  );
}
