import Alert from '@mui/material/Alert';
import MenuItem from '@mui/material/MenuItem';
import Stack from '@mui/material/Stack';
import TextField from '@mui/material/TextField';
import Typography from '@mui/material/Typography';

import { AUDIT_CATEGORIES } from '@/api/dto/operations';
import { useListAuditEventsQuery } from '@/api/endpoints/operations';
import type { NormalizedApiError } from '@/api/errors';
import type { AuditEvent } from '@/api/types';
import { useStaffSession } from '@/auth/useAuth';
import { PageHeader } from '@/components/PageHeader';
import { ResourceTable, type Column } from '@/components/ResourceTable';
import { dateInputToIso, formatDateTime } from '@/lib/datetime';
import { hasAnyRole } from '@/lib/permissions';
import { useNumberQueryParam, useQueryParam } from '@/lib/useUrlState';

const PAGE_SIZE = 25;

/**
 * Audit history (specification section 4.8).
 *
 * Read-only actor, action, entity and time filters. Finance accounts receive finance
 * events only — enforced by the server — and the table shows safe correlation IDs
 * rather than raw request payloads.
 */
export function AuditPage() {
  const session = useStaffSession();
  const adminScope = hasAnyRole(session, ['admin']);
  const [category, setCategory] = useQueryParam('category');
  const [entityType, setEntityType] = useQueryParam('entityType');
  const [actorId, setActorId] = useQueryParam('actorId');
  const [from, setFrom] = useQueryParam('from');
  const [to, setTo] = useQueryParam('to');
  const [skip, setSkip] = useNumberQueryParam('skip', 0);

  const query = useListAuditEventsQuery({
    category: adminScope ? (category as never) : null,
    entityType,
    actorId,
    from: dateInputToIso(from ?? ''),
    to: dateInputToIso(to ?? '', true),
    limit: PAGE_SIZE,
    skip,
  });

  const columns: Array<Column<AuditEvent>> = [
    {
      id: 'when',
      header: 'When',
      minWidth: 170,
      render: (event) => formatDateTime(event.occurredAt),
    },
    {
      id: 'actor',
      header: 'Actor',
      render: (event) => (
        <Stack spacing={0.25}>
          <Typography variant="body2">{event.actor.label ?? event.actor.id}</Typography>
          <Typography variant="caption" color="text.secondary">
            {event.actor.type.toLowerCase()}
          </Typography>
        </Stack>
      ),
    },
    { id: 'action', header: 'Action', minWidth: 200, render: (event) => event.action },
    {
      id: 'entity',
      header: 'Entity',
      render: (event) => (
        <Stack spacing={0.25}>
          <Typography variant="body2">{event.entityType}</Typography>
          <Typography variant="caption" color="text.secondary">
            {event.entityId.slice(-8)}
          </Typography>
        </Stack>
      ),
    },
    { id: 'category', header: 'Category', render: (event) => event.category },
    { id: 'reason', header: 'Reason', minWidth: 200, render: (event) => event.reason ?? '—' },
    {
      id: 'correlation',
      header: 'Reference',
      render: (event) =>
        event.correlationId ? (
          <code>{event.correlationId}</code>
        ) : (
          <Typography variant="caption">—</Typography>
        ),
    },
  ];

  return (
    <>
      <PageHeader
        title="Audit"
        description="Who did what, to which record, and when."
        crumbs={[{ label: 'Administration' }, { label: 'Audit' }]}
      />

      <Stack spacing={2}>
        {!adminScope ? (
          <Alert severity="info">
            Finance accounts see finance events only. The server applies that scope; this page does
            not filter it client-side.
          </Alert>
        ) : null}

        <Stack
          direction={{ xs: 'column', md: 'row' }}
          spacing={2}
          sx={{ flexWrap: 'wrap', gap: 2 }}
        >
          {adminScope ? (
            <TextField
              select
              size="small"
              label="Category"
              value={category ?? ''}
              onChange={(event) => {
                setCategory(event.target.value || null);
                setSkip(0);
              }}
              sx={{ minWidth: 180 }}
            >
              <MenuItem value="">Any category</MenuItem>
              {AUDIT_CATEGORIES.map((value) => (
                <MenuItem key={value} value={value}>
                  {value}
                </MenuItem>
              ))}
            </TextField>
          ) : null}
          <TextField
            size="small"
            label="Entity type"
            value={entityType ?? ''}
            onChange={(event) => {
              setEntityType(event.target.value || null);
              setSkip(0);
            }}
            sx={{ minWidth: 180 }}
          />
          <TextField
            size="small"
            label="Actor identifier"
            value={actorId ?? ''}
            onChange={(event) => {
              setActorId(event.target.value || null);
              setSkip(0);
            }}
            sx={{ minWidth: 200 }}
          />
          <TextField
            size="small"
            type="date"
            label="From"
            value={from ?? ''}
            onChange={(event) => {
              setFrom(event.target.value || null);
              setSkip(0);
            }}
            slotProps={{ inputLabel: { shrink: true } }}
          />
          <TextField
            size="small"
            type="date"
            label="To"
            value={to ?? ''}
            onChange={(event) => {
              setTo(event.target.value || null);
              setSkip(0);
            }}
            slotProps={{ inputLabel: { shrink: true } }}
          />
        </Stack>

        <ResourceTable
          caption="Audit events"
          columns={columns}
          rows={query.data?.items ?? []}
          getRowId={(event) => event.id}
          isLoading={query.isLoading}
          isFetching={query.isFetching}
          error={query.error as NormalizedApiError | undefined}
          onRetry={() => void query.refetch()}
          emptyTitle="No audit events match"
          emptyDescription="Widen the date range or clear the filters."
          page={{
            limit: PAGE_SIZE,
            skip,
            hasProbableNextPage: query.data?.hasProbableNextPage ?? false,
            onSkipChange: setSkip,
          }}
        />
      </Stack>
    </>
  );
}
