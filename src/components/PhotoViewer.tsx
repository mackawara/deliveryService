import CloseIcon from '@mui/icons-material/Close';
import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import Dialog from '@mui/material/Dialog';
import DialogActions from '@mui/material/DialogActions';
import DialogContent from '@mui/material/DialogContent';
import DialogTitle from '@mui/material/DialogTitle';
import IconButton from '@mui/material/IconButton';
import Stack from '@mui/material/Stack';
import Typography from '@mui/material/Typography';

import { useGetMediaLinkQuery } from '@/api/endpoints/operations';
import type { NormalizedApiError } from '@/api/errors';
import { ApiError } from '@/components/ApiError';
import { formatDateTime } from '@/lib/datetime';

export interface PhotoViewerProps {
  open: boolean;
  mediaObjectId: string | null;
  title?: string;
  onClose: () => void;
}

/**
 * Parcel photo viewer. Access links expire, so the link is fetched when the dialog
 * opens and refetched rather than cached; a missing photo is never treated as evidence
 * of anything (specification sections 4.7 and 9).
 */
export function PhotoViewer({
  open,
  mediaObjectId,
  title = 'Parcel photo',
  onClose,
}: PhotoViewerProps) {
  const query = useGetMediaLinkQuery(mediaObjectId ?? '', { skip: !open || !mediaObjectId });
  const error = query.error as NormalizedApiError | undefined;

  return (
    <Dialog
      open={open}
      onClose={onClose}
      fullWidth
      maxWidth="md"
      aria-labelledby="photo-viewer-title"
    >
      <DialogTitle id="photo-viewer-title">
        <Stack
          direction="row"
          spacing={1}
          sx={{ alignItems: 'center', justifyContent: 'space-between' }}
        >
          <span>{title}</span>
          <IconButton onClick={onClose} aria-label="Close photo">
            <CloseIcon />
          </IconButton>
        </Stack>
      </DialogTitle>
      <DialogContent>
        {error ? (
          <ApiError
            error={error}
            onRetry={() => void query.refetch()}
            retryLabel="Request a new link"
          />
        ) : query.isLoading ? (
          <Typography variant="body2" color="text.secondary">
            Requesting an access link…
          </Typography>
        ) : query.data ? (
          <Stack spacing={1}>
            <Box
              component="img"
              src={query.data.url}
              alt="Parcel condition photo supplied by the customer"
              sx={{ width: '100%', borderRadius: 1, border: 1, borderColor: 'divider' }}
            />
            <Typography variant="caption" color="text.secondary">
              Link expires {formatDateTime(query.data.expiresAt)} · {query.data.contentType} ·{' '}
              {Math.round(query.data.bytes / 1024)} KB. A photo records parcel condition only; it is
              not proof of delivery, weight or size.
            </Typography>
          </Stack>
        ) : (
          <Typography variant="body2" color="text.secondary">
            No photo is attached to this booking.
          </Typography>
        )}
      </DialogContent>
      <DialogActions>
        <Button onClick={() => void query.refetch()} disabled={!mediaObjectId}>
          Refresh link
        </Button>
        <Button onClick={onClose} variant="contained">
          Close
        </Button>
      </DialogActions>
    </Dialog>
  );
}
