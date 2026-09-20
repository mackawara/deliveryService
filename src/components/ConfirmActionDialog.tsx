import Button from '@mui/material/Button';
import Dialog from '@mui/material/Dialog';
import DialogActions from '@mui/material/DialogActions';
import DialogContent from '@mui/material/DialogContent';
import DialogContentText from '@mui/material/DialogContentText';
import DialogTitle from '@mui/material/DialogTitle';
import Stack from '@mui/material/Stack';
import { useState, type ReactNode } from 'react';

import type { NormalizedApiError } from '@/api/errors';
import { ApiError } from '@/components/ApiError';
import { ReasonField, isReasonValid } from '@/components/ReasonField';

export interface ConfirmActionDialogProps {
  open: boolean;
  title: string;
  description?: ReactNode;
  /** What the command will affect: booking, amount and effect, confirmed before sending. */
  summary?: ReactNode;
  confirmLabel: string;
  cancelLabel?: string;
  requireReason?: boolean;
  reasonLabel?: string;
  destructive?: boolean;
  pending?: boolean;
  error?: NormalizedApiError;
  onCancel: () => void;
  onConfirm: (reason: string) => void;
}

/**
 * Guarded-command confirmation (specification sections 4.2 and 8).
 *
 * MUI dialogs replace browser prompts, the action is disabled while pending so a
 * duplicate tap cannot submit twice, and focus returns to the launching control.
 */
export function ConfirmActionDialog({
  open,
  title,
  description,
  summary,
  confirmLabel,
  cancelLabel = 'Cancel',
  requireReason = false,
  reasonLabel,
  destructive = false,
  pending = false,
  error,
  onCancel,
  onConfirm,
}: ConfirmActionDialogProps) {
  const [reason, setReason] = useState('');
  const [wasOpen, setWasOpen] = useState(open);

  // Reset the reason when the dialog opens, adjusting state during render rather than
  // in an effect so no extra render pass is scheduled.
  if (open !== wasOpen) {
    setWasOpen(open);
    if (open) setReason('');
  }

  const reasonMissing = requireReason && !isReasonValid(reason);

  return (
    <Dialog
      open={open}
      onClose={pending ? undefined : onCancel}
      aria-labelledby="confirm-action-title"
      fullWidth
      maxWidth="sm"
    >
      <DialogTitle id="confirm-action-title">{title}</DialogTitle>
      <DialogContent>
        <Stack spacing={2}>
          {description ? (
            <DialogContentText component="div">{description}</DialogContentText>
          ) : null}
          {summary}
          {requireReason ? (
            <ReasonField
              value={reason}
              onChange={setReason}
              label={reasonLabel}
              disabled={pending}
            />
          ) : null}
          <ApiError error={error} />
        </Stack>
      </DialogContent>
      <DialogActions>
        <Button onClick={onCancel} disabled={pending}>
          {cancelLabel}
        </Button>
        <Button
          variant="contained"
          color={destructive ? 'error' : 'primary'}
          onClick={() => onConfirm(reason.trim())}
          disabled={pending || reasonMissing}
        >
          {pending ? 'Working…' : confirmLabel}
        </Button>
      </DialogActions>
    </Dialog>
  );
}
