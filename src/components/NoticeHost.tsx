import Alert from '@mui/material/Alert';
import Snackbar from '@mui/material/Snackbar';

import { useAppDispatch, useAppSelector } from '@/app/hooks';
import { noticeDismissed } from '@/app/uiSlice';

/** Transient confirmations and warnings raised by feature actions. */
export function NoticeHost() {
  const dispatch = useAppDispatch();
  const notices = useAppSelector((state) => state.ui.notices);
  const current = notices[0];

  if (!current) return null;

  return (
    <Snackbar
      open
      autoHideDuration={current.tone === 'error' ? 12_000 : 6000}
      onClose={(_event, reason) => {
        if (reason === 'clickaway') return;
        dispatch(noticeDismissed(current.id));
      }}
      anchorOrigin={{ vertical: 'bottom', horizontal: 'center' }}
    >
      <Alert
        severity={current.tone}
        onClose={() => dispatch(noticeDismissed(current.id))}
        sx={{ maxWidth: 520 }}
      >
        {current.message}
        {current.correlationId ? ` (reference ${current.correlationId})` : ''}
      </Alert>
    </Snackbar>
  );
}
