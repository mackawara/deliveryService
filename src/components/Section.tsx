import Card from '@mui/material/Card';
import CardContent from '@mui/material/CardContent';
import Stack from '@mui/material/Stack';
import Typography from '@mui/material/Typography';
import type { ReactNode } from 'react';

export interface SectionProps {
  title: string;
  description?: string;
  actions?: ReactNode;
  children: ReactNode;
}

/** Card used for detail panes and forms so every screen reads the same way. */
export function Section({ title, description, actions, children }: SectionProps) {
  return (
    <Card>
      <CardContent>
        <Stack
          direction="row"
          spacing={2}
          sx={{
            alignItems: 'flex-start',
            justifyContent: 'space-between',
            mb: description ? 1 : 2,
          }}
        >
          <Stack spacing={0.25}>
            <Typography variant="h3" sx={{ fontSize: '1.05rem' }}>
              {title}
            </Typography>
            {description ? (
              <Typography variant="body2" color="text.secondary">
                {description}
              </Typography>
            ) : null}
          </Stack>
          {actions ? (
            <Stack direction="row" spacing={1} sx={{ flexWrap: 'wrap', gap: 1 }}>
              {actions}
            </Stack>
          ) : null}
        </Stack>
        {children}
      </CardContent>
    </Card>
  );
}
