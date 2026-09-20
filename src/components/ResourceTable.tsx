import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import LinearProgress from '@mui/material/LinearProgress';
import Paper from '@mui/material/Paper';
import Skeleton from '@mui/material/Skeleton';
import Stack from '@mui/material/Stack';
import Table from '@mui/material/Table';
import TableBody from '@mui/material/TableBody';
import TableCell from '@mui/material/TableCell';
import TableContainer from '@mui/material/TableContainer';
import TableHead from '@mui/material/TableHead';
import TableRow from '@mui/material/TableRow';
import Typography from '@mui/material/Typography';
import type { ReactNode } from 'react';

import type { NormalizedApiError } from '@/api/errors';
import { ApiError } from '@/components/ApiError';
import { EmptyState } from '@/components/EmptyState';

export interface Column<T> {
  id: string;
  header: ReactNode;
  render: (row: T) => ReactNode;
  align?: 'left' | 'right' | 'center';
  minWidth?: number;
}

export interface PageControls {
  limit: number;
  skip: number;
  hasProbableNextPage: boolean;
  onSkipChange: (skip: number) => void;
}

export interface ResourceTableProps<T> {
  /** Accessible description of what the table contains. */
  caption: string;
  columns: Array<Column<T>>;
  rows: T[];
  getRowId: (row: T) => string;
  isLoading?: boolean;
  /** A background refresh; last-good rows stay on screen with a stale banner. */
  isFetching?: boolean;
  error?: NormalizedApiError;
  onRetry?: () => void;
  emptyTitle?: string;
  emptyDescription?: string;
  emptyAction?: ReactNode;
  page?: PageControls;
  onRowClick?: (row: T) => void;
  selectedRowId?: string | null;
}

/**
 * Shared table wrapper (specification section 8).
 *
 * Loading, stale-while-refreshing, failed and genuinely empty states are visibly
 * different, and paging shows the loaded range with Previous/Next rather than a total
 * the backend does not provide.
 */
export function ResourceTable<T>({
  caption,
  columns,
  rows,
  getRowId,
  isLoading = false,
  isFetching = false,
  error,
  onRetry,
  emptyTitle = 'Nothing to show',
  emptyDescription,
  emptyAction,
  page,
  onRowClick,
  selectedRowId,
}: ResourceTableProps<T>) {
  const showStaleBanner = Boolean(error) && rows.length > 0;
  const showErrorOnly = Boolean(error) && rows.length === 0;
  const from = page ? page.skip + 1 : 1;
  const to = page ? page.skip + rows.length : rows.length;

  return (
    <Paper variant="outlined">
      {showStaleBanner ? (
        <Box sx={{ p: 2, pb: 0 }}>
          <ApiError error={error} onRetry={onRetry} retryLabel="Refresh" />
          <Typography variant="caption" color="text.secondary">
            Showing the last data that loaded successfully.
          </Typography>
        </Box>
      ) : null}

      {isFetching && !isLoading ? <LinearProgress aria-label="Refreshing" /> : null}

      {showErrorOnly ? (
        <Box sx={{ p: 2 }}>
          <ApiError error={error} onRetry={onRetry} />
        </Box>
      ) : isLoading ? (
        <Box sx={{ p: 2 }} aria-busy="true" aria-live="polite">
          {[0, 1, 2, 3, 4].map((row) => (
            <Skeleton key={row} height={44} />
          ))}
        </Box>
      ) : rows.length === 0 ? (
        <EmptyState title={emptyTitle} description={emptyDescription} action={emptyAction} />
      ) : (
        // Wide tables scroll inside their labelled container, never the page.
        <TableContainer sx={{ maxWidth: '100%', overflowX: 'auto' }}>
          <Table size="small" aria-label={caption}>
            <caption className="sr-only">{caption}</caption>
            <TableHead>
              <TableRow>
                {columns.map((column) => (
                  <TableCell
                    key={column.id}
                    align={column.align}
                    sx={{ minWidth: column.minWidth }}
                  >
                    {column.header}
                  </TableCell>
                ))}
              </TableRow>
            </TableHead>
            <TableBody>
              {rows.map((row) => {
                const id = getRowId(row);
                return (
                  <TableRow
                    key={id}
                    hover={Boolean(onRowClick)}
                    selected={selectedRowId === id}
                    onClick={onRowClick ? () => onRowClick(row) : undefined}
                    // Rows stay reachable by keyboard; actions are never hover-only.
                    tabIndex={onRowClick ? 0 : undefined}
                    role={onRowClick ? 'button' : undefined}
                    onKeyDown={
                      onRowClick
                        ? (event) => {
                            if (event.key === 'Enter' || event.key === ' ') {
                              event.preventDefault();
                              onRowClick(row);
                            }
                          }
                        : undefined
                    }
                    sx={onRowClick ? { cursor: 'pointer' } : undefined}
                  >
                    {columns.map((column) => (
                      <TableCell key={column.id} align={column.align}>
                        {column.render(row)}
                      </TableCell>
                    ))}
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </TableContainer>
      )}

      {page ? (
        <Stack
          direction="row"
          spacing={2}
          sx={{
            alignItems: 'center',
            justifyContent: 'space-between',
            p: 1.5,
            borderTop: 1,
            borderColor: 'divider',
          }}
        >
          <Typography variant="body2" color="text.secondary">
            {rows.length === 0
              ? 'No records on this page'
              : `Showing loaded records ${from}–${to}. This list has no server total.`}
          </Typography>
          <Stack direction="row" spacing={1}>
            <Button
              size="small"
              variant="outlined"
              disabled={page.skip === 0 || isLoading}
              onClick={() => page.onSkipChange(Math.max(0, page.skip - page.limit))}
            >
              Previous
            </Button>
            <Button
              size="small"
              variant="outlined"
              // A full page permits a next-page probe, which may come back empty.
              disabled={!page.hasProbableNextPage || isLoading}
              onClick={() => page.onSkipChange(page.skip + page.limit)}
            >
              Next
            </Button>
          </Stack>
        </Stack>
      ) : null}
    </Paper>
  );
}
