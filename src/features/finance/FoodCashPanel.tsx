import Alert from '@mui/material/Alert';
import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import Checkbox from '@mui/material/Checkbox';
import Dialog from '@mui/material/Dialog';
import DialogActions from '@mui/material/DialogActions';
import DialogContent from '@mui/material/DialogContent';
import DialogTitle from '@mui/material/DialogTitle';
import FormControlLabel from '@mui/material/FormControlLabel';
import MenuItem from '@mui/material/MenuItem';
import Paper from '@mui/material/Paper';
import Stack from '@mui/material/Stack';
import TextField from '@mui/material/TextField';
import Typography from '@mui/material/Typography';
import { useState } from 'react';
import { Link as RouterLink } from 'react-router-dom';

import type {
  CashDiscrepancyResolution,
  DriverCashBalance,
  FoodCashEntry,
} from '@/api/dto/foodFinance';
import {
  useGetCashDiscrepancyQuery,
  useGetRiderCashOutstandingQuery,
  useListCashDiscrepanciesQuery,
  useListFoodShopBalancesQuery,
  useRecordRiderCashHandInMutation,
  useResolveCashDiscrepancyMutation,
} from '@/api/endpoints/foodFinance';
import { fieldErrorMap, isNormalizedApiError, type NormalizedApiError } from '@/api/errors';
import { POLLING, polled } from '@/api/polling';
import { useTownScope } from '@/app/useTownScope';
import { useStaffSession } from '@/auth/useAuth';
import { ApiError } from '@/components/ApiError';
import { FormDialog } from '@/components/FormDialog';
import { Money } from '@/components/Money';
import { MoneyField } from '@/components/MoneyField';
import { ResourceTable, type Column } from '@/components/ResourceTable';
import { appConfig } from '@/config';
import { formatDateTime } from '@/lib/datetime';
import { canUseFoodSettlements, foodFinanceScopeKey } from '@/lib/foodSettlementAccess';
import { canAccessTown, hasCapability } from '@/lib/permissions';
import { centsToInput, parseUsdToCents } from '@/lib/money';
import { useFinancialAction } from '@/lib/useFinancialAction';

const DISCREPANCY_LIMIT = 100;

function cashValue(entry: FoodCashEntry): number {
  return (entry.amountReceivedCents ?? 0) - (entry.changeGivenCents ?? 0);
}

function protectedCashReadFailure(error: unknown): boolean {
  return (
    isNormalizedApiError(error) && ['unauthenticated', 'forbidden', 'notFound'].includes(error.kind)
  );
}

interface CashDetailRead {
  currentData?: FoodCashEntry;
  error?: unknown;
  isLoading: boolean;
  refetch: () => unknown;
}

/** Cash endpoints themselves predate the food feature gate, so probe the matching API first. */
export function FoodCashPanel() {
  const session = useStaffSession();
  if (
    !appConfig.enableFoodSettlements ||
    !session?.roles.includes('finance') ||
    !canUseFoodSettlements(session)
  )
    return null;
  const scopeKey = foodFinanceScopeKey(session);
  return <FoodCashReadiness key={scopeKey} scopeKey={scopeKey} />;
}

function FoodCashReadiness({ scopeKey }: { scopeKey: string }) {
  const readiness = useListFoodShopBalancesQuery({ scopeKey, limit: 1 }, polled(POLLING.finance));
  return (
    <Paper variant="outlined" sx={{ p: { xs: 1.5, sm: 2 } }}>
      <Typography component="h2" variant="h6" sx={{ mb: 2 }}>
        Rider cash hand-ins and discrepancies
      </Typography>
      {readiness.error ? (
        <>
          <Alert severity="info" sx={{ mb: 1 }}>
            {readiness.currentData && !protectedCashReadFailure(readiness.error)
              ? 'Settlement service refresh failed. Existing drafts remain available; new cash commands are paused.'
              : 'Food cash tools are unavailable until the settlement service is enabled.'}
          </Alert>
          <ApiError
            error={readiness.error as NormalizedApiError}
            onRetry={() => void readiness.refetch()}
          />
        </>
      ) : null}
      {readiness.currentData && !protectedCashReadFailure(readiness.error) ? (
        <FoodCashWorkspace scopeKey={scopeKey} serviceReady={!readiness.error} />
      ) : !readiness.error ? (
        <Typography role="status">Checking the settlement service…</Typography>
      ) : null}
    </Paper>
  );
}

function FoodCashWorkspace({
  scopeKey,
  serviceReady,
}: {
  scopeKey: string;
  serviceReady: boolean;
}) {
  const { townId } = useTownScope();
  return (
    <TownCashWorkspace
      key={`${scopeKey}:${townId ?? 'all'}`}
      scopeKey={scopeKey}
      townId={townId}
      serviceReady={serviceReady}
    />
  );
}

function TownCashWorkspace({
  scopeKey,
  townId,
  serviceReady,
}: {
  scopeKey: string;
  townId: string | null;
  serviceReady: boolean;
}) {
  const session = useStaffSession();
  const [driverId, setDriverId] = useState('');
  const [status, setStatus] = useState<'OPEN' | 'RESOLVED' | ''>('OPEN');
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [handInEntries, setHandInEntries] = useState<FoodCashEntry[] | null>(null);
  const [detailId, setDetailId] = useState<string | null>(null);
  const query = useGetRiderCashOutstandingQuery({ scopeKey }, polled(POLLING.finance));
  const discrepancies = useListCashDiscrepanciesQuery(
    {
      scopeKey,
      driverId: driverId || undefined,
      status: status || undefined,
      limit: DISCREPANCY_LIMIT,
    },
    polled(POLLING.finance),
  );
  const detailRead = useGetCashDiscrepancyQuery(
    { scopeKey, id: detailId ?? '' },
    { ...polled(POLLING.finance), skip: !detailId },
  );
  const protectedError = [query.error, discrepancies.error, detailRead.error].find(
    protectedCashReadFailure,
  );
  const readsBlocked =
    !serviceReady || Boolean(query.error || discrepancies.error || detailRead.error);
  const drivers = (query.currentData?.drivers ?? []).filter(
    (driver) => canAccessTown(session, driver.townId) && (!townId || driver.townId === townId),
  );
  const driver = drivers.find((row) => row.driverId === driverId);
  const entries =
    driver?.entries.filter((entry) => entry.entryType === 'COLLECTION' && !entry.handInId) ?? [];
  const canRemit = Boolean(
    driver &&
    !readsBlocked &&
    hasCapability(session, 'cash.remit') &&
    canUseFoodSettlements(session, undefined, driver.townId),
  );
  const rows = (discrepancies.currentData?.items ?? []).filter(
    (entry) => canAccessTown(session, entry.townId) && (!townId || entry.townId === townId),
  );
  const refresh = () => {
    void query.refetch();
    void discrepancies.refetch();
    if (detailId) void detailRead.refetch();
  };

  if (protectedError)
    return (
      <Stack spacing={2}>
        <Alert severity="warning">
          Cash access changed. Previously loaded balances, evidence and forms are hidden.
        </Alert>
        <ApiError error={protectedError as NormalizedApiError} onRetry={refresh} />
      </Stack>
    );

  const columns: Array<Column<FoodCashEntry>> = [
    {
      id: 'select',
      header: 'Select',
      render: (entry) => (
        <Checkbox
          size="small"
          checked={selectedIds.includes(entry._id)}
          disabled={!canRemit || query.isFetching || Boolean(query.error)}
          slotProps={{ input: { 'aria-label': `Select collection ${entry._id}` } }}
          onChange={(_event, checked) =>
            setSelectedIds((ids) =>
              checked ? [...ids, entry._id] : ids.filter((id) => id !== entry._id),
            )
          }
        />
      ),
    },
    {
      id: 'reference',
      header: 'Collection / food order',
      render: (entry) => <CashReferences entry={entry} />,
    },
    {
      id: 'cash',
      header: 'Collected, less change',
      align: 'right',
      render: (entry) => <Money cents={cashValue(entry)} />,
    },
    {
      id: 'received',
      header: 'Original receipt',
      render: (entry) => entry.receiptReference ?? '—',
    },
    { id: 'version', header: 'Version', render: (entry) => entry.version },
    {
      id: 'when',
      header: 'Collected',
      render: (entry) => formatDateTime(entry.occurredAt, 'Africa/Harare'),
    },
  ];
  const discrepancyColumns: Array<Column<FoodCashEntry>> = [
    {
      id: 'reference',
      header: 'Hand-in / food order',
      render: (entry) => <CashReferences entry={entry} />,
    },
    { id: 'driver', header: 'Rider', render: (entry) => entry.driverId ?? '—' },
    { id: 'status', header: 'Status', render: (entry) => entry.discrepancy?.status ?? entry.state },
    {
      id: 'expected',
      header: 'Original expected',
      align: 'right',
      render: (entry) => <Money cents={entry.discrepancy?.expectedCents} />,
    },
    {
      id: 'received',
      header: 'Original received',
      align: 'right',
      render: (entry) => <Money cents={entry.discrepancy?.receivedCents} />,
    },
    {
      id: 'difference',
      header: 'Original difference',
      align: 'right',
      render: (entry) => <Money cents={entry.discrepancy?.differenceCents} />,
    },
    {
      id: 'inspect',
      header: 'Evidence',
      render: (entry) => (
        <Button onClick={() => setDetailId(entry._id)}>Inspect {entry._id}</Button>
      ),
    },
  ];

  return (
    <Stack spacing={2}>
      <Alert severity="info">
        Record the amount actually handed in. A short or over hand-in preserves the expected amount
        and opens a discrepancy; it does not change shop earnings. Amounts and receipts are USD.
      </Alert>
      <TextField
        select
        label="Rider for cash hand-in"
        value={driver?.driverId ?? ''}
        onChange={(event) => {
          setDriverId(event.target.value);
          setSelectedIds([]);
        }}
        sx={{ maxWidth: 420 }}
      >
        <MenuItem value="">Choose a rider</MenuItem>
        {drivers.map((row) => (
          <MenuItem key={row.driverId} value={row.driverId}>
            Rider {row.driverId}
          </MenuItem>
        ))}
      </TextField>
      {query.error ? (
        <ApiError error={query.error as NormalizedApiError} onRetry={() => void query.refetch()} />
      ) : null}
      {query.isLoading ? <Typography role="status">Loading rider balances…</Typography> : null}
      {driver ? (
        <RiderTotals driver={driver} />
      ) : !query.isLoading && !query.error ? (
        <Typography color="text.secondary">
          Choose a rider to review server balances and unremitted collections in the selected town.
        </Typography>
      ) : null}
      {driver ? (
        <>
          <ResourceTable
            caption="Unremitted rider collections"
            columns={columns}
            rows={entries}
            getRowId={(entry) => entry._id}
            isFetching={query.isFetching}
            emptyTitle="No unremitted collections"
            emptyDescription="Previously handed-in collections cannot be selected again."
          />
          {canRemit ? (
            <Button
              variant="outlined"
              sx={{ alignSelf: 'flex-start' }}
              disabled={
                selectedIds.length === 0 ||
                selectedIds.length > 200 ||
                query.isFetching ||
                Boolean(query.error)
              }
              onClick={() =>
                setHandInEntries(entries.filter((entry) => selectedIds.includes(entry._id)))
              }
            >
              Record actual hand-in
            </Button>
          ) : null}
        </>
      ) : null}
      <Typography component="h3" variant="subtitle1">
        Cash discrepancies
      </Typography>
      <TextField
        select
        size="small"
        label="Discrepancy status"
        value={status}
        onChange={(event) => setStatus(event.target.value as typeof status)}
        sx={{ maxWidth: 250 }}
      >
        <MenuItem value="">All statuses</MenuItem>
        <MenuItem value="OPEN">Open</MenuItem>
        <MenuItem value="RESOLVED">Resolved</MenuItem>
      </TextField>
      <Typography variant="caption" color="text.secondary">
        Showing up to {DISCREPANCY_LIMIT} recent discrepancies. Filter by rider and status to narrow
        the list.
      </Typography>
      <ResourceTable
        caption="Rider cash discrepancies"
        columns={discrepancyColumns}
        rows={rows}
        getRowId={(entry) => entry._id}
        isLoading={discrepancies.isLoading}
        isFetching={discrepancies.isFetching}
        error={discrepancies.error as NormalizedApiError | undefined}
        onRetry={() => void discrepancies.refetch()}
        emptyTitle="No cash discrepancies"
      />
      {handInEntries && driver ? (
        <HandInDialog
          scopeKey={scopeKey}
          driver={driver}
          entries={handInEntries}
          blocked={readsBlocked}
          onClose={() => setHandInEntries(null)}
          onRecorded={() => {
            setHandInEntries(null);
            setSelectedIds([]);
            refresh();
          }}
          refresh={refresh}
        />
      ) : null}
      {detailId ? (
        <CashDiscrepancyDialog
          key={detailId}
          scopeKey={scopeKey}
          detail={detailRead}
          blocked={readsBlocked}
          onClose={() => setDetailId(null)}
          refresh={refresh}
        />
      ) : null}
    </Stack>
  );
}

function RiderTotals({ driver }: { driver: DriverCashBalance }) {
  return (
    <Box
      component="dl"
      sx={{
        m: 0,
        display: 'grid',
        gridTemplateColumns: { xs: '1fr 1fr', sm: 'repeat(3, 1fr)' },
        gap: 2,
      }}
    >
      {(
        [
          ['Expected from collections', driver.expectedCents],
          ['Received by finance', driver.receivedCents],
          ['Actual minus expected', driver.differenceCents],
          ['Outstanding', driver.outstandingCents],
          ['Unresolved shortage', driver.unresolvedShortfallCents],
          ['Unresolved overage', driver.overageCents],
        ] as const
      ).map(([label, value]) => (
        <Box key={label}>
          <Typography component="dt" variant="caption" color="text.secondary">
            {label}
          </Typography>
          <Typography component="dd" sx={{ m: 0 }}>
            <Money cents={value} />
          </Typography>
        </Box>
      ))}
    </Box>
  );
}

function CashReferences({ entry }: { entry: FoodCashEntry }) {
  const path = `/finance/cash?booking=${encodeURIComponent(entry.bookingId)}`;
  return (
    <Stack spacing={0.25}>
      <Typography variant="caption">Ledger {entry._id}</Typography>
      <Button component={RouterLink} to={path} size="small" sx={{ alignSelf: 'flex-start' }}>
        Booking {entry.bookingId}
      </Button>
      {entry.foodOrderIds?.map((id) => (
        <Button
          key={id}
          component={RouterLink}
          to={path}
          size="small"
          sx={{ alignSelf: 'flex-start' }}
        >
          Food order {id} · cash evidence
        </Button>
      ))}
      {entry.handInId ? <Typography variant="caption">Hand-in {entry.handInId}</Typography> : null}
      {entry.remittanceReference ? (
        <Typography variant="caption">Receipt {entry.remittanceReference}</Typography>
      ) : null}
    </Stack>
  );
}

function HandInDialog({
  scopeKey,
  driver,
  entries,
  onClose,
  onRecorded,
  refresh,
  blocked,
}: {
  scopeKey: string;
  driver: DriverCashBalance;
  entries: FoodCashEntry[];
  onClose: () => void;
  onRecorded: () => void;
  refresh: () => void;
  blocked: boolean;
}) {
  const expected = entries.reduce((sum, entry) => sum + cashValue(entry), 0);
  const [amount, setAmount] = useState(centsToInput(expected));
  const [reference, setReference] = useState('');
  const [reason, setReason] = useState('');
  const [evidence, setEvidence] = useState('');
  const [confirmed, setConfirmed] = useState(false);
  const parsed = parseUsdToCents(amount);
  const [record] = useRecordRiderCashHandInMutation();
  const action = useFinancialAction({
    scopeKey,
    allowUnconfirmedRetry: true,
    run: (
      args: {
        amountReceivedCents: number;
        receiptReference: string;
        reason?: string;
        evidence?: string;
      },
      idempotencyKey: string,
    ) =>
      record({
        scopeKey,
        driverId: driver.driverId,
        ledgerEntryIds: entries.map((entry) => entry._id),
        collectionVersions: Object.fromEntries(entries.map((entry) => [entry._id, entry.version])),
        ...args,
        idempotencyKey,
      }).unwrap(),
    refresh,
    successMessage: (result) =>
      result.discrepancy
        ? 'Actual cash hand-in recorded with a discrepancy.'
        : 'Actual cash hand-in recorded.',
    onSuccess: onRecorded,
  });
  const locked = action.pending || action.unconfirmed !== false;
  const mismatch = parsed.ok && parsed.cents !== expected;
  const errors = fieldErrorMap(action.error);
  return (
    <FormDialog
      open
      title="Record actual rider hand-in"
      description="The delivery service checks the selected receipts and expected cash. Record the actual cash received, including a shortage or overage."
      submitLabel="Confirm actual hand-in"
      pending={action.pending}
      closeDisabled={action.unconfirmed !== false}
      error={action.error}
      unconfirmed={action.unconfirmed}
      onRetryUnconfirmed={() => void action.retryUnconfirmed()}
      onClose={() => {
        if (!action.unconfirmed) onClose();
      }}
      disabled={
        blocked ||
        !parsed.ok ||
        parsed.cents < 0 ||
        !reference.trim() ||
        (mismatch && !reason.trim()) ||
        !confirmed ||
        action.error?.kind === 'conflict'
      }
      onSubmit={() => {
        if (parsed.ok)
          void action.submit({
            amountReceivedCents: parsed.cents,
            receiptReference: reference.trim(),
            reason: reason.trim() || undefined,
            evidence: evidence.trim() || undefined,
          });
      }}
    >
      <Typography>
        Rider {driver.driverId} · {entries.length} selected collection(s)
      </Typography>
      <Typography>
        Expected from the selected immutable receipts: <Money cents={expected} emphasis />
      </Typography>
      <Typography variant="caption">
        Collections: {entries.map((entry) => `${entry._id} (v${entry.version})`).join(', ')}
      </Typography>
      {blocked ? (
        <Alert severity="warning">
          New cash commands are paused until the service refreshes successfully. Your draft is
          retained.
        </Alert>
      ) : null}
      <MoneyField
        label="Actual cash received"
        value={amount}
        onChange={setAmount}
        required
        disabled={locked}
        error={
          errors.amountReceivedCents ??
          (parsed.ok && parsed.cents < 0 ? 'Enter zero or a positive amount.' : undefined)
        }
      />
      {parsed.ok ? (
        <Alert severity={mismatch ? 'warning' : 'info'}>
          Actual minus expected: <Money cents={parsed.cents - expected} />.{' '}
          {mismatch
            ? 'A discrepancy will preserve both original figures.'
            : 'The amount matches the selected receipts.'}
        </Alert>
      ) : null}
      <TextField
        label="Hand-in receipt reference"
        value={reference}
        onChange={(event) => setReference(event.target.value)}
        required
        fullWidth
        disabled={locked}
        error={Boolean(errors.receiptReference)}
        helperText={errors.receiptReference}
        slotProps={{ htmlInput: { maxLength: 120 } }}
      />
      <TextField
        label="Hand-in reason"
        value={reason}
        onChange={(event) => setReason(event.target.value)}
        required={mismatch}
        fullWidth
        disabled={locked}
        error={Boolean(errors.reason)}
        helperText={errors.reason ?? 'Required for a shortage or overage.'}
        multiline
        minRows={2}
        slotProps={{ htmlInput: { maxLength: 2000 } }}
      />
      <TextField
        label="Hand-in evidence"
        value={evidence}
        onChange={(event) => setEvidence(event.target.value)}
        fullWidth
        disabled={locked}
        multiline
        minRows={2}
        slotProps={{ htmlInput: { maxLength: 2000 } }}
      />
      <FormControlLabel
        control={
          <Checkbox
            checked={confirmed}
            disabled={locked}
            onChange={(_event, checked) => setConfirmed(checked)}
          />
        }
        label="I checked the receipts and counted the actual cash received."
      />
      {action.unconfirmed ? (
        <Alert severity="warning">
          Keep this form open and retry the same request to confirm its outcome before starting
          another hand-in.
        </Alert>
      ) : null}
      {action.error?.kind === 'conflict' ? (
        <Alert severity="warning">
          Your draft remains visible. The selected collections changed and have been refreshed. Keep
          these figures for review, then close this form and select the latest collections before
          recording a new hand-in.
        </Alert>
      ) : null}
    </FormDialog>
  );
}

const RESOLUTION_LABELS: Record<CashDiscrepancyResolution, string> = {
  CASH_RECEIVED: 'Additional cash received',
  CASH_RETURNED: 'Overage cash returned',
  CORRECT_RECORD: 'Correct the received cash record',
  WRITE_OFF: 'Approve a shortage write-off',
  ACCEPT_OVERAGE: 'Accept the overage',
};

function CashDiscrepancyDialog({
  scopeKey,
  detail,
  blocked,
  onClose,
  refresh,
}: {
  scopeKey: string;
  detail: CashDetailRead;
  blocked: boolean;
  onClose: () => void;
  refresh: () => void;
}) {
  const session = useStaffSession();
  const entry = detail.currentData;
  const permitted =
    entry && canUseFoodSettlements(session, 'food.settlements.adjust', entry.townId);
  const [resolving, setResolving] = useState(false);
  if (entry && permitted && resolving)
    return (
      <CashResolutionForm
        scopeKey={scopeKey}
        entry={entry}
        readError={detail.error as NormalizedApiError | undefined}
        blocked={blocked}
        refresh={() => {
          void detail.refetch();
          refresh();
        }}
        onClose={onClose}
      />
    );
  return (
    <Dialog open onClose={onClose} fullWidth maxWidth="sm">
      <DialogTitle>Cash hand-in evidence</DialogTitle>
      <DialogContent>
        <Stack spacing={2} sx={{ pt: 1 }}>
          {detail.error ? (
            <ApiError
              error={detail.error as NormalizedApiError}
              onRetry={() => void detail.refetch()}
            />
          ) : null}
          {detail.isLoading ? <Typography role="status">Loading discrepancy…</Typography> : null}
          {entry && canAccessTown(session, entry.townId) ? <CashEvidence entry={entry} /> : null}
        </Stack>
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose}>Close</Button>
        {entry?.discrepancy?.status === 'OPEN' && permitted && !blocked ? (
          <Button variant="contained" onClick={() => setResolving(true)}>
            Resolve discrepancy
          </Button>
        ) : null}
      </DialogActions>
    </Dialog>
  );
}

function CashEvidence({ entry }: { entry: FoodCashEntry }) {
  const details = entry.discrepancy;
  if (!details)
    return <Alert severity="warning">This record has no hand-in discrepancy details.</Alert>;
  return (
    <>
      <CashReferences entry={entry} />
      <Typography>
        Status: {details.status} · version {entry.version}
      </Typography>
      <Typography>
        Original expected: <Money cents={details.expectedCents} /> · original received:{' '}
        <Money cents={details.receivedCents} /> · original difference:{' '}
        <Money cents={details.differenceCents} />
      </Typography>
      <Typography>
        Current received after corrections: <Money cents={details.currentReceivedCents} /> ·
        outstanding: <Money cents={details.outstandingCents} /> · overage:{' '}
        <Money cents={details.overageCents} />
      </Typography>
      <Typography sx={{ whiteSpace: 'pre-wrap', overflowWrap: 'anywhere' }}>
        Original reason: {details.reason}
      </Typography>
      <Typography sx={{ whiteSpace: 'pre-wrap', overflowWrap: 'anywhere' }}>
        Original evidence: {details.evidence ?? 'None supplied'}
      </Typography>
      <Typography variant="caption">
        Recorded by {entry.recordedBy.label ?? entry.recordedBy.id} ({entry.recordedBy.type}) ·{' '}
        {formatDateTime(entry.occurredAt, 'Africa/Harare')}
      </Typography>
      {details.resolution ? (
        <Alert severity="info">
          {RESOLUTION_LABELS[details.resolution.kind]} · {details.resolution.reason}
          <br />
          Evidence: {details.resolution.evidence ?? 'None supplied'}
          <br />
          Recorded by {details.resolution.actor.label ?? details.resolution.actor.id} ·{' '}
          {formatDateTime(details.resolution.resolvedAt, 'Africa/Harare')}
          <br />
          Correction ledger entry: {details.resolution.correctionEntryId}
        </Alert>
      ) : null}
      <Typography variant="caption" sx={{ overflowWrap: 'anywhere' }}>
        Linked ledger evidence: {entry.linkedEntryIds.join(', ') || 'None'}
      </Typography>
    </>
  );
}

function CashResolutionForm({
  scopeKey,
  entry,
  refresh,
  onClose,
  readError,
  blocked,
}: {
  scopeKey: string;
  entry: FoodCashEntry;
  refresh: () => void;
  onClose: () => void;
  readError?: NormalizedApiError;
  blocked: boolean;
}) {
  const details = entry.discrepancy!;
  const difference = details.currentReceivedCents - details.expectedCents;
  const [resolution, setResolution] = useState<CashDiscrepancyResolution>(
    difference < 0 ? 'CASH_RECEIVED' : difference > 0 ? 'CASH_RETURNED' : 'CORRECT_RECORD',
  );
  const [amount, setAmount] = useState('');
  const [reason, setReason] = useState('');
  const [evidence, setEvidence] = useState('');
  const [reviewedVersion, setReviewedVersion] = useState<number | null>(null);
  const [resolve] = useResolveCashDiscrepancyMutation();
  const action = useFinancialAction({
    scopeKey,
    allowUnconfirmedRetry: true,
    run: (
      args: {
        expectedVersion: number;
        resolution: CashDiscrepancyResolution;
        amountCents?: number;
        reason: string;
        evidence?: string;
      },
      idempotencyKey: string,
    ) => resolve({ scopeKey, id: entry._id, ...args, idempotencyKey }).unwrap(),
    refresh,
    successMessage: (result) =>
      result.discrepancy.discrepancy?.status === 'RESOLVED'
        ? 'Cash discrepancy resolved with a linked correction.'
        : 'Cash correction recorded; the remaining discrepancy stays open.',
    onSuccess: () => {
      refresh();
      onClose();
    },
  });
  const options: CashDiscrepancyResolution[] = [
    ...(difference < 0 ? (['CASH_RECEIVED', 'WRITE_OFF'] as const) : []),
    ...(difference > 0 ? (['CASH_RETURNED', 'ACCEPT_OVERAGE'] as const) : []),
    'CORRECT_RECORD',
  ];
  const needsAmount = !['WRITE_OFF', 'ACCEPT_OVERAGE'].includes(resolution);
  const parsed = parseUsdToCents(amount);
  const amountError =
    needsAmount && parsed.ok
      ? resolution === 'CORRECT_RECORD'
        ? parsed.cents < 0 || parsed.cents === details.currentReceivedCents
          ? 'Enter a different non-negative cash total.'
          : undefined
        : parsed.cents <= 0 || parsed.cents > Math.abs(difference)
          ? 'Enter a positive amount within the unresolved difference.'
          : undefined
      : undefined;
  const errors = fieldErrorMap(action.error);
  const locked = action.pending || action.unconfirmed !== false;
  return (
    <FormDialog
      open
      title="Resolve cash discrepancy"
      description="A correction appends evidence. Original expected and received amounts remain unchanged. Cash movements must already have happened outside this form."
      submitLabel="Record audited correction"
      pending={action.pending}
      closeDisabled={action.unconfirmed !== false}
      error={action.error}
      unconfirmed={action.unconfirmed}
      onRetryUnconfirmed={() => void action.retryUnconfirmed()}
      onClose={() => {
        if (!action.unconfirmed) onClose();
      }}
      disabled={
        blocked ||
        details.status !== 'OPEN' ||
        !options.includes(resolution) ||
        !reason.trim() ||
        reviewedVersion !== entry.version ||
        (needsAmount && (!parsed.ok || Boolean(amountError)))
      }
      onSubmit={() =>
        void action.submit({
          expectedVersion: entry.version,
          resolution,
          amountCents: needsAmount && parsed.ok ? parsed.cents : undefined,
          reason: reason.trim(),
          evidence: evidence.trim() || undefined,
        })
      }
    >
      <CashEvidence entry={entry} />
      {blocked ? (
        <Alert severity="warning">
          New cash commands are paused until the service refreshes successfully. Your draft is
          retained.
        </Alert>
      ) : null}
      {readError ? <ApiError error={readError} onRetry={refresh} /> : null}
      {action.unconfirmed ? (
        <Alert severity="warning">
          Keep this form open and retry the same request to confirm its outcome before recording
          another correction.
        </Alert>
      ) : null}
      {action.error?.kind === 'conflict' ? (
        <Alert severity="warning">
          Your draft is retained. Review the refreshed evidence and confirm its current version
          before submitting another correction.
        </Alert>
      ) : null}
      {details.status !== 'OPEN' ? (
        <Alert severity="info">
          The server now shows this discrepancy as resolved. No new correction can be submitted.
        </Alert>
      ) : null}
      <TextField
        select
        label="Resolution decision"
        value={resolution}
        onChange={(event) => {
          setResolution(event.target.value as CashDiscrepancyResolution);
          setReviewedVersion(null);
        }}
        fullWidth
        disabled={locked}
      >
        {options.map((value) => (
          <MenuItem key={value} value={value}>
            {RESOLUTION_LABELS[value]}
          </MenuItem>
        ))}
      </TextField>
      {needsAmount ? (
        <MoneyField
          label={
            resolution === 'CORRECT_RECORD' ? 'Corrected total received' : 'Cash movement amount'
          }
          value={amount}
          onChange={setAmount}
          required
          disabled={locked}
          error={errors.amountCents ?? amountError}
        />
      ) : null}
      <TextField
        label="Resolution reason"
        value={reason}
        onChange={(event) => setReason(event.target.value)}
        required
        fullWidth
        disabled={locked}
        multiline
        minRows={2}
        error={Boolean(errors.reason)}
        helperText={errors.reason}
      />
      <TextField
        label="Resolution evidence"
        value={evidence}
        onChange={(event) => setEvidence(event.target.value)}
        fullWidth
        disabled={locked}
        multiline
        minRows={2}
      />
      <FormControlLabel
        control={
          <Checkbox
            checked={reviewedVersion === entry.version}
            disabled={locked}
            onChange={(_event, checked) => setReviewedVersion(checked ? entry.version : null)}
          />
        }
        label={`I reviewed version ${entry.version} and confirm this decision and any completed cash movement.`}
      />
    </FormDialog>
  );
}
