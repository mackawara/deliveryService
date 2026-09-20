import Alert from '@mui/material/Alert';
import Button from '@mui/material/Button';
import MenuItem from '@mui/material/MenuItem';
import Stack from '@mui/material/Stack';
import TextField from '@mui/material/TextField';
import Typography from '@mui/material/Typography';
import { useState } from 'react';
import { useNavigate } from 'react-router-dom';

import { RESTRICTION_REASONS, RESTRICTION_STATUSES } from '@/api/dto/restriction';
import {
  useActivateRestrictionMutation,
  useListRestrictionsQuery,
} from '@/api/endpoints/restrictions';
import type { NormalizedApiError } from '@/api/errors';
import type { Restriction } from '@/api/types';
import { useTownScope } from '@/app/useTownScope';
import { FormDialog } from '@/components/FormDialog';
import { PageHeader } from '@/components/PageHeader';
import { ResourceTable, type Column } from '@/components/ResourceTable';
import { StatusChip } from '@/components/StatusChip';
import {
  describeStatus,
  restrictionReasonMeta,
  restrictionStatusMeta,
} from '@/components/statusMeta';
import { dateInputToIso, formatDate } from '@/lib/datetime';
import { useGuardedAction } from '@/lib/useGuardedAction';
import { useNumberQueryParam, useQueryParam } from '@/lib/useUrlState';

const PAGE_SIZE = 25;

/**
 * Blacklist and fraud review (specification section 4.7).
 *
 * Administrators activate a restriction with a reason, scope, effective date, review
 * date and optional expiry. A restriction blocks new chargeable work; it does not
 * resolve parcels or payments already in progress.
 */
export function RestrictionsPage() {
  const navigate = useNavigate();
  const { townId, towns } = useTownScope();
  const [status, setStatus] = useQueryParam('status');
  const [reasonCode, setReasonCode] = useQueryParam('reason');
  const [skip, setSkip] = useNumberQueryParam('skip', 0);
  const [activateOpen, setActivateOpen] = useState(false);

  const query = useListRestrictionsQuery({
    status: status as never,
    reasonCode: reasonCode as never,
    townId,
    limit: PAGE_SIZE,
    skip,
  });
  const [activateRestriction] = useActivateRestrictionMutation();

  const [customerId, setCustomerId] = useState('');
  const [reason, setReason] = useState<(typeof RESTRICTION_REASONS)[number]>('FRAUDULENT_SHIPMENT');
  const [explanation, setExplanation] = useState('');
  const [scopeType, setScopeType] = useState<'TOWN' | 'PLATFORM'>('TOWN');
  const [scopeTownId, setScopeTownId] = useState(townId ?? '');
  const [effectiveFrom, setEffectiveFrom] = useState('');
  const [reviewAt, setReviewAt] = useState('');
  const [expiresAt, setExpiresAt] = useState('');

  const activate = useGuardedAction({
    run: (_args: void, idempotencyKey: string) =>
      activateRestriction({
        customerId: customerId.trim(),
        reasonCode: reason,
        explanation: explanation.trim(),
        scope: scopeType === 'TOWN' ? { type: 'TOWN', townId: scopeTownId } : { type: 'PLATFORM' },
        effectiveFrom: dateInputToIso(effectiveFrom) ?? undefined,
        reviewAt: dateInputToIso(reviewAt) ?? undefined,
        expiresAt: dateInputToIso(expiresAt, true) ?? undefined,
        idempotencyKey,
      }).unwrap(),
    refresh: () => void query.refetch(),
    successMessage: 'Restriction activated. Existing parcels and payments still need resolution.',
    onSuccess: () => {
      setActivateOpen(false);
      setCustomerId('');
      setExplanation('');
    },
  });

  const columns: Array<Column<Restriction>> = [
    {
      id: 'customer',
      header: 'Customer',
      render: (restriction) => (
        <Button size="small" onClick={() => navigate(`/customers/${restriction.customerId}`)}>
          {restriction.customerId.slice(-6)}
        </Button>
      ),
    },
    {
      id: 'reason',
      header: 'Reason',
      render: (restriction) => (
        <StatusChip descriptor={describeStatus(restrictionReasonMeta, restriction.reasonCode)} />
      ),
    },
    {
      id: 'status',
      header: 'Status',
      render: (restriction) => (
        <StatusChip descriptor={describeStatus(restrictionStatusMeta, restriction.status)} />
      ),
    },
    {
      id: 'scope',
      header: 'Scope',
      render: (restriction) =>
        restriction.scope.type === 'PLATFORM'
          ? 'Platform-wide'
          : (towns.find((town) => town.id === restriction.scope.townId)?.name ??
            restriction.scope.townId ??
            'Town'),
    },
    {
      id: 'from',
      header: 'Effective from',
      render: (restriction) => formatDate(restriction.effectiveFrom),
    },
    {
      id: 'review',
      header: 'Review',
      render: (restriction) =>
        restriction.reviewAt ? formatDate(restriction.reviewAt) : 'No review date',
    },
    {
      id: 'expires',
      header: 'Expires',
      render: (restriction) =>
        restriction.expiresAt ? formatDate(restriction.expiresAt) : 'No expiry',
    },
    {
      id: 'evidence',
      header: 'Evidence',
      render: (restriction) => (
        <Typography variant="body2">{restriction.evidence.length} reference(s)</Typography>
      ),
    },
  ];

  return (
    <>
      <PageHeader
        title="Restrictions"
        description="Customer restrictions, their evidence and their review dates."
        crumbs={[{ label: 'Administration' }, { label: 'Restrictions' }]}
        actions={
          <Button variant="contained" onClick={() => setActivateOpen(true)}>
            Activate restriction
          </Button>
        }
      />

      <Stack spacing={2}>
        <Stack direction={{ xs: 'column', sm: 'row' }} spacing={2}>
          <TextField
            select
            size="small"
            label="Status"
            value={status ?? ''}
            onChange={(event) => {
              setStatus(event.target.value || null);
              setSkip(0);
            }}
            sx={{ minWidth: 200 }}
          >
            <MenuItem value="">Any status</MenuItem>
            {RESTRICTION_STATUSES.map((value) => (
              <MenuItem key={value} value={value}>
                {describeStatus(restrictionStatusMeta, value).label}
              </MenuItem>
            ))}
          </TextField>
          <TextField
            select
            size="small"
            label="Reason"
            value={reasonCode ?? ''}
            onChange={(event) => {
              setReasonCode(event.target.value || null);
              setSkip(0);
            }}
            sx={{ minWidth: 240 }}
          >
            <MenuItem value="">Any reason</MenuItem>
            {RESTRICTION_REASONS.map((value) => (
              <MenuItem key={value} value={value}>
                {describeStatus(restrictionReasonMeta, value).label}
              </MenuItem>
            ))}
          </TextField>
        </Stack>

        <Alert severity="info">
          A standalone pending fraud-report queue needs the additional fraud-report API
          (specification section 11, P1). Reports raised by operators are visible on the restriction
          they relate to and on the booking they came from.
        </Alert>

        <ResourceTable
          caption="Customer restrictions"
          columns={columns}
          rows={query.data?.items ?? []}
          getRowId={(restriction) => restriction.id}
          isLoading={query.isLoading}
          isFetching={query.isFetching}
          error={query.error as NormalizedApiError | undefined}
          onRetry={() => void query.refetch()}
          emptyTitle="No restrictions"
          emptyDescription="Restrictions activated by administrators appear here."
          onRowClick={(restriction) => navigate(`/restrictions/${restriction.id}`)}
          page={{
            limit: PAGE_SIZE,
            skip,
            hasProbableNextPage: query.data?.hasProbableNextPage ?? false,
            onSkipChange: setSkip,
          }}
        />
      </Stack>

      <FormDialog
        open={activateOpen}
        title="Activate a customer restriction"
        description="New chargeable work is restricted. Parcels already in custody and payments already taken still need to be resolved."
        submitLabel="Activate restriction"
        pending={activate.pending}
        error={activate.error}
        unconfirmed={activate.unconfirmed}
        onRetryUnconfirmed={() => void activate.retryUnconfirmed()}
        disabled={
          customerId.trim() === '' ||
          explanation.trim().length < 5 ||
          (scopeType === 'TOWN' && scopeTownId === '')
        }
        onClose={() => setActivateOpen(false)}
        onSubmit={() => void activate.submit()}
      >
        <TextField
          label="Customer identifier"
          value={customerId}
          onChange={(event) => setCustomerId(event.target.value)}
          fullWidth
          required
        />
        <TextField
          select
          label="Reason"
          value={reason}
          onChange={(event) => setReason(event.target.value as typeof reason)}
          fullWidth
        >
          {RESTRICTION_REASONS.map((value) => (
            <MenuItem key={value} value={value}>
              {describeStatus(restrictionReasonMeta, value).label}
            </MenuItem>
          ))}
        </TextField>
        <TextField
          label="Explanation"
          value={explanation}
          onChange={(event) => setExplanation(event.target.value)}
          fullWidth
          required
          multiline
          minRows={3}
          helperText="The facts behind the decision. A missing parcel photo is never evidence of fraud."
        />
        <TextField
          select
          label="Scope"
          value={scopeType}
          onChange={(event) => setScopeType(event.target.value as 'TOWN' | 'PLATFORM')}
          fullWidth
        >
          <MenuItem value="TOWN">This town only</MenuItem>
          <MenuItem value="PLATFORM">Platform-wide</MenuItem>
        </TextField>
        {scopeType === 'TOWN' ? (
          <TextField
            select
            label="Town"
            value={scopeTownId}
            onChange={(event) => setScopeTownId(event.target.value)}
            fullWidth
            required
          >
            {towns.map((town) => (
              <MenuItem key={town.id} value={town.id}>
                {town.name}
              </MenuItem>
            ))}
          </TextField>
        ) : null}
        <Stack direction={{ xs: 'column', sm: 'row' }} spacing={2}>
          <TextField
            label="Effective from"
            type="date"
            value={effectiveFrom}
            onChange={(event) => setEffectiveFrom(event.target.value)}
            fullWidth
            slotProps={{ inputLabel: { shrink: true } }}
          />
          <TextField
            label="Review on"
            type="date"
            value={reviewAt}
            onChange={(event) => setReviewAt(event.target.value)}
            fullWidth
            slotProps={{ inputLabel: { shrink: true } }}
          />
          <TextField
            label="Expires"
            type="date"
            value={expiresAt}
            onChange={(event) => setExpiresAt(event.target.value)}
            fullWidth
            slotProps={{ inputLabel: { shrink: true } }}
          />
        </Stack>
      </FormDialog>
    </>
  );
}
