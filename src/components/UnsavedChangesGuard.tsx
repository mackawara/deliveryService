import Button from '@mui/material/Button';
import Dialog from '@mui/material/Dialog';
import DialogActions from '@mui/material/DialogActions';
import DialogContent from '@mui/material/DialogContent';
import DialogContentText from '@mui/material/DialogContentText';
import DialogTitle from '@mui/material/DialogTitle';
import { useEffect } from 'react';
import { useBlocker } from 'react-router-dom';

export interface UnsavedChangesGuardProps {
  when: boolean;
  title?: string;
  message?: string;
}

/**
 * Unsaved form changes receive an explicit choice rather than being silently discarded
 * (specification section 8). In-app navigation is blocked with a dialog and a tab close
 * falls back to the browser's own prompt.
 */
export function UnsavedChangesGuard({
  when,
  title = 'Leave without saving?',
  message = 'This form has changes that have not been sent to the delivery service.',
}: UnsavedChangesGuardProps) {
  const blocker = useBlocker(when);

  useEffect(() => {
    if (!when) return;
    function onBeforeUnload(event: BeforeUnloadEvent) {
      event.preventDefault();
    }
    window.addEventListener('beforeunload', onBeforeUnload);
    return () => window.removeEventListener('beforeunload', onBeforeUnload);
  }, [when]);

  return (
    <Dialog open={blocker.state === 'blocked'} aria-labelledby="unsaved-changes-title">
      <DialogTitle id="unsaved-changes-title">{title}</DialogTitle>
      <DialogContent>
        <DialogContentText>{message}</DialogContentText>
      </DialogContent>
      <DialogActions>
        <Button onClick={() => blocker.reset?.()}>Stay on this page</Button>
        <Button color="error" variant="contained" onClick={() => blocker.proceed?.()}>
          Discard changes
        </Button>
      </DialogActions>
    </Dialog>
  );
}
