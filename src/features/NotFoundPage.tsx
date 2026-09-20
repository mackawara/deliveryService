import Button from '@mui/material/Button';
import Stack from '@mui/material/Stack';
import Typography from '@mui/material/Typography';
import { Link as RouterLink } from 'react-router-dom';

import { EmptyState } from '@/components/EmptyState';

/** Unknown route. Hosting falls back to index.html so deep links reach the router. */
export function NotFoundPage() {
  return (
    <Stack sx={{ minHeight: '60vh', justifyContent: 'center' }}>
      <EmptyState
        title="Page not found"
        description="That address is not part of the dashboard."
        action={
          <Button component={RouterLink} to="/" variant="contained">
            Go to overview
          </Button>
        }
      />
      <Typography variant="caption" color="text.secondary" sx={{ textAlign: 'center' }}>
        If you followed a link from another system, check that it points at a dashboard route.
      </Typography>
    </Stack>
  );
}
