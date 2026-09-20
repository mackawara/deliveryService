import Breadcrumbs from '@mui/material/Breadcrumbs';
import Link from '@mui/material/Link';
import Stack from '@mui/material/Stack';
import Typography from '@mui/material/Typography';
import type { ReactNode } from 'react';
import { Link as RouterLink } from 'react-router-dom';

export interface Crumb {
  label: string;
  to?: string;
}

export interface PageHeaderProps {
  title: string;
  description?: string;
  crumbs?: Crumb[];
  /** Primary actions occupy a consistent position at the end of the header row. */
  actions?: ReactNode;
  /** Small print such as a last-updated timestamp or reporting period. */
  meta?: ReactNode;
}

/** Page title, breadcrumbs and primary actions in a consistent position (section 3). */
export function PageHeader({ title, description, crumbs, actions, meta }: PageHeaderProps) {
  return (
    <Stack spacing={1} sx={{ mb: 3 }}>
      {crumbs && crumbs.length > 0 ? (
        <Breadcrumbs aria-label="Breadcrumb">
          {crumbs.map((crumb) =>
            crumb.to ? (
              <Link key={crumb.label} component={RouterLink} to={crumb.to} color="inherit">
                {crumb.label}
              </Link>
            ) : (
              <Typography key={crumb.label} color="text.primary" variant="body2">
                {crumb.label}
              </Typography>
            ),
          )}
        </Breadcrumbs>
      ) : null}

      <Stack
        direction={{ xs: 'column', md: 'row' }}
        spacing={2}
        sx={{ alignItems: { xs: 'stretch', md: 'center' }, justifyContent: 'space-between' }}
      >
        <Stack spacing={0.5}>
          <Typography variant="h1">{title}</Typography>
          {description ? (
            <Typography variant="body2" color="text.secondary">
              {description}
            </Typography>
          ) : null}
          {meta}
        </Stack>
        {actions ? (
          <Stack direction="row" spacing={1} sx={{ flexWrap: 'wrap', gap: 1 }}>
            {actions}
          </Stack>
        ) : null}
      </Stack>
    </Stack>
  );
}
