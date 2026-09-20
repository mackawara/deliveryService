import InboxIcon from '@mui/icons-material/Inbox';
import Box from '@mui/material/Box';
import Typography from '@mui/material/Typography';
import type { ReactNode } from 'react';

export interface EmptyStateProps {
  title: string;
  description?: string;
  action?: ReactNode;
}

/**
 * Genuinely empty data. A failed load shows ApiError instead, so an empty result and a
 * broken request never look the same (specification section 6).
 */
export function EmptyState({ title, description, action }: EmptyStateProps) {
  return (
    <Box
      sx={{
        py: 6,
        px: 3,
        textAlign: 'center',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        gap: 1,
        color: 'text.secondary',
      }}
    >
      <InboxIcon sx={{ fontSize: 40, color: 'text.disabled' }} aria-hidden />
      <Typography variant="h6" color="text.primary">
        {title}
      </Typography>
      {description ? (
        <Typography variant="body2" sx={{ maxWidth: 420 }}>
          {description}
        </Typography>
      ) : null}
      {action}
    </Box>
  );
}
