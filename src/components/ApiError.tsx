import RefreshIcon from '@mui/icons-material/Refresh';
import Alert from '@mui/material/Alert';
import AlertTitle from '@mui/material/AlertTitle';
import Button from '@mui/material/Button';
import Typography from '@mui/material/Typography';

import type { NormalizedApiError } from '@/api/errors';

const TITLES: Record<NormalizedApiError['kind'], string> = {
  offline: 'No connection',
  timeout: 'Outcome not confirmed',
  unauthenticated: 'Session ended',
  forbidden: 'Insufficient access',
  notFound: 'Not available',
  conflict: 'This record changed',
  validation: 'Check the highlighted fields',
  rateLimited: 'Too many requests',
  server: 'Service problem',
  client: 'Request rejected',
  unknown: 'Something went wrong',
};

const SEVERITY: Record<NormalizedApiError['kind'], 'error' | 'warning' | 'info'> = {
  offline: 'warning',
  timeout: 'warning',
  unauthenticated: 'info',
  forbidden: 'warning',
  notFound: 'info',
  conflict: 'warning',
  validation: 'warning',
  rateLimited: 'warning',
  server: 'error',
  client: 'error',
  unknown: 'error',
};

export interface ApiErrorProps {
  error: NormalizedApiError | undefined;
  /** Shown as a retry control when the caller can re-run the request. */
  onRetry?: () => void;
  retryLabel?: string;
}

/**
 * One presentation for every failure class (specification section 6). 401, 403, 409,
 * 422, 429, offline and 5xx read differently and never look like an empty result.
 */
export function ApiError({ error, onRetry, retryLabel = 'Try again' }: ApiErrorProps) {
  if (!error) return null;

  return (
    <Alert
      severity={SEVERITY[error.kind]}
      role="alert"
      action={
        onRetry ? (
          <Button color="inherit" size="small" onClick={onRetry} startIcon={<RefreshIcon />}>
            {retryLabel}
          </Button>
        ) : undefined
      }
    >
      <AlertTitle>{TITLES[error.kind]}</AlertTitle>
      {error.message}
      {error.kind === 'rateLimited' && error.retryAfterSeconds ? (
        <Typography variant="body2">Try again in {error.retryAfterSeconds} seconds.</Typography>
      ) : null}
      {error.fieldErrors?.length ? (
        <ul style={{ margin: '8px 0 0', paddingInlineStart: 20 }}>
          {error.fieldErrors.map((fieldError) => (
            <li key={`${fieldError.field}:${fieldError.message}`}>
              <Typography variant="body2" component="span">
                <strong>{fieldError.field}</strong>: {fieldError.message}
              </Typography>
            </li>
          ))}
        </ul>
      ) : null}
      {error.correlationId ? (
        <Typography variant="caption" component="p" sx={{ mt: 1 }}>
          Reference for support: <code>{error.correlationId}</code>
        </Typography>
      ) : null}
    </Alert>
  );
}
