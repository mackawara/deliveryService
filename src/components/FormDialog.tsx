import Button from '@mui/material/Button';
import Dialog from '@mui/material/Dialog';
import DialogActions from '@mui/material/DialogActions';
import DialogContent from '@mui/material/DialogContent';
import DialogTitle from '@mui/material/DialogTitle';
import Stack from '@mui/material/Stack';
import Typography from '@mui/material/Typography';
import type { FormEvent, ReactNode } from 'react';

import type { NormalizedApiError } from '@/api/errors';
import { ApiError } from '@/components/ApiError';
import type { UnconfirmedState } from '@/lib/useGuardedAction';

export interface FormDialogProps {
  open: boolean;
  title: string;
  description?: string;
  submitLabel: string;
  pending?: boolean;
  error?: NormalizedApiError;
  /** True after a timeout; the caller offers a retry that reuses the same key. */
  unconfirmed?: UnconfirmedState;
  onRetryUnconfirmed?: () => void;
  disabled?: boolean;
  onClose: () => void;
  onSubmit: () => void;
  children: ReactNode;
  maxWidth?: 'xs' | 'sm' | 'md';
}

/**
 * Dialog shell for guarded commands (specification sections 4.2 and 6).
 *
 * Submission is disabled while pending so a duplicate tap cannot send twice, a conflict
 * keeps the user's proposed input on screen, and an unconfirmed outcome offers an
 * explicit retry rather than replaying the command automatically.
 */
export function FormDialog({
  open,
  title,
  description,
  submitLabel,
  pending = false,
  error,
  unconfirmed = false,
  onRetryUnconfirmed,
  disabled = false,
  onClose,
  onSubmit,
  children,
  maxWidth = 'sm',
}: FormDialogProps) {
  function handleSubmit(event: FormEvent) {
    event.preventDefault();
    onSubmit();
  }

  return (
    <Dialog open={open} onClose={pending ? undefined : onClose} fullWidth maxWidth={maxWidth}>
      <form onSubmit={handleSubmit} noValidate>
        <DialogTitle>{title}</DialogTitle>
        <DialogContent>
          <Stack spacing={2} sx={{ pt: 1 }}>
            {description ? (
              <Typography variant="body2" color="text.secondary">
                {description}
              </Typography>
            ) : null}
            {children}
            <ApiError error={error} />
            {unconfirmed ? (
              <Stack spacing={1}>
                <Typography variant="body2" color="warning.main">
                  Outcome not confirmed. The latest record has been refetched — review it before
                  sending again.{unconfirmed === 'retryable'
                    ? ' Retrying re-sends the identical request with the same operation key.'
                    : ' Close this dialog and inspect the latest record before starting another action.'}
                </Typography>
                {unconfirmed === 'retryable' && onRetryUnconfirmed ? (
                  <Button onClick={onRetryUnconfirmed} variant="outlined" disabled={pending}>
                    Retry the same request
                  </Button>
                ) : null}
              </Stack>
            ) : null}
          </Stack>
        </DialogContent>
        <DialogActions>
          <Button onClick={onClose} disabled={pending}>
            Cancel
          </Button>
          <Button type="submit" variant="contained" disabled={pending || unconfirmed !== false || disabled}>
            {pending ? 'Working…' : submitLabel}
          </Button>
        </DialogActions>
      </form>
    </Dialog>
  );
}
