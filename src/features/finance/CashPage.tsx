import Alert from '@mui/material/Alert';
import Button from '@mui/material/Button';
import MenuItem from '@mui/material/MenuItem';
import Stack from '@mui/material/Stack';
import TextField from '@mui/material/TextField';
import Typography from '@mui/material/Typography';
import { useMemo, useState } from 'react';
import { Link as RouterLink } from 'react-router-dom';

import { CASH_STATES } from '@/api/dto/finance';
import { useListCashLedgerQuery, useRecordCashRemittanceMutation } from '@/api/endpoints/finance';
import { useListDriversQuery } from '@/api/endpoints/fleet';
import type { NormalizedApiError } from '@/api/errors';
import { POLLING, polled } from '@/api/polling';
import type { CashEntry } from '@/api/types';
import { useTownScope } from '@/app/useTownScope';
import { FormDialog } from '@/components/FormDialog';
import { Money } from '@/components/Money';
import { MoneyField, moneyFieldError } from '@/components/MoneyField';
import { PageHeader } from '@/components/PageHeader';
import { ResourceTable, type Column } from '@/components/ResourceTable';
import { StatusChip } from '@/components/StatusChip';
import { cashStateMeta, describeStatus } from '@/components/statusMeta';
import { formatDateTime } from '@/lib/datetime';
import { parseUsdToCents, sumCents } from '@/lib/money';
import { useGuardedAction } from '@/lib/useGuardedAction';
import { useNumberQueryParam, useQueryParam } from '@/lib/useUrlState';

const PAGE_SIZE = 25;

/**
 * Cash ledger (specification section 4.6).
 *
 * Due, collected, remitted, reconciled and discrepancy stay distinct, and amount
 * received, change and shortfall are displayed separately. Collection is an operator
 * action on a booking; finance records remittance against ledger references.
 */
export function CashPage() {
  const { townId } = useTownScope();
  const [state, setState] = useQueryParam('state');
  const [driverId, setDriverId] = useQueryParam('driver');
  const [skip, setSkip] = useNumberQueryParam('skip', 0);
  const [remitOpen, setRemitOpen] = useState(false);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [amount, setAmount] = useState('');
  const [receiptReference, setReceiptReference] = useState('');
  const [notes, setNotes] = useState('');

  const query = useListCashLedgerQuery(
    { state: state as never, driverId, limit: PAGE_SIZE, skip },
    polled(POLLING.finance),
  );
  const driversQuery = useListDriversQuery({ townId, limit: 100 }, { skip: !townId });
  const [recordRemittance] = useRecordCashRemittanceMutation();

  const collected = useMemo(
    () => (query.data?.items ?? []).filter((entry) => entry.state === 'COLLECTED_BY_DRIVER'),
    [query.data],
  );
  const selectedTotal = useMemo(
    () =>
      sumCents(
        collected
          .filter((entry) => selectedIds.includes(entry.id))
          .map((entry) => entry.amountReceivedCents ?? entry.amountDueCents),
      ),
    [collected, selectedIds],
  );

  const remit = useGuardedAction({
    run: (_args: void, idempotencyKey: string) => {
      const parsed = parseUsdToCents(amount);
      if (!parsed.ok || !driverId) throw new Error('unreachable: guarded by the dialog');
      return recordRemittance({
        driverId,
        ledgerEntryIds: selectedIds,
        amountCents: parsed.cents,
        receiptReference: receiptReference.trim(),
        notes: notes.trim() || undefined,
        idempotencyKey,
      }).unwrap();
    },
    refresh: () => void query.refetch(),
    successMessage: 'Remittance recorded against the selected ledger entries.',
    onSuccess: () => {
      setRemitOpen(false);
      setSelectedIds([]);
      setAmount('');
      setReceiptReference('');
    },
  });

  const columns: Array<Column<CashEntry>> = [
    {
      id: 'select',
      header: 'Select',
      render: (entry) =>
        entry.state === 'COLLECTED_BY_DRIVER' ? (
          <input
            type="checkbox"
            checked={selectedIds.includes(entry.id)}
            aria-label={`Select ledger entry ${entry.id.slice(-6)}`}
            onChange={(event) =>
              setSelectedIds((current) =>
                event.target.checked
                  ? [...current, entry.id]
                  : current.filter((id) => id !== entry.id),
              )
            }
          />
        ) : null,
    },
    {
      id: 'booking',
      header: 'Booking',
      render: (entry) => (
        <Button component={RouterLink} to={`/bookings/${entry.bookingId}`} size="small">
          {entry.bookingId.slice(-6)}
        </Button>
      ),
    },
    { id: 'type', header: 'Entry', render: (entry) => entry.entryType.toLowerCase() },
    {
      id: 'state',
      header: 'State',
      render: (entry) => <StatusChip descriptor={describeStatus(cashStateMeta, entry.state)} />,
    },
    {
      id: 'due',
      header: 'Due',
      align: 'right',
      render: (entry) => <Money cents={entry.amountDueCents} />,
    },
    {
      id: 'received',
      header: 'Received',
      align: 'right',
      render: (entry) => <Money cents={entry.amountReceivedCents ?? null} />,
    },
    {
      id: 'change',
      header: 'Change',
      align: 'right',
      render: (entry) => <Money cents={entry.changeGivenCents ?? null} />,
    },
    {
      id: 'shortfall',
      header: 'Shortfall',
      align: 'right',
      render: (entry) => {
        if (entry.amountReceivedCents === undefined) return <Money cents={null} />;
        const shortfall = entry.amountDueCents - entry.amountReceivedCents;
        return shortfall > 0 ? (
          <Typography variant="body2" color="error.main">
            <Money cents={shortfall} />
          </Typography>
        ) : (
          <Typography variant="body2" color="text.secondary">
            None
          </Typography>
        );
      },
    },
    { id: 'driver', header: 'Driver', render: (entry) => entry.driverId?.slice(-6) ?? '—' },
    { id: 'when', header: 'Recorded', render: (entry) => formatDateTime(entry.occurredAt) },
    {
      id: 'reference',
      header: 'References',
      render: (entry) => (
        <Stack spacing={0.25}>
          {entry.receiptReference ? (
            <Typography variant="caption">Receipt {entry.receiptReference}</Typography>
          ) : null}
          {entry.remittanceReference ? (
            <Typography variant="caption">Remittance {entry.remittanceReference}</Typography>
          ) : null}
          {entry.reconciliationReference ? (
            <Typography variant="caption">
              Reconciliation {entry.reconciliationReference}
            </Typography>
          ) : null}
        </Stack>
      ),
    },
  ];

  return (
    <>
      <PageHeader
        title="Cash ledger"
        description="Cash due, collected by drivers, remitted to finance, reconciled and in discrepancy."
        crumbs={[{ label: 'Finance' }, { label: 'Cash' }]}
        actions={
          <Button
            variant="contained"
            disabled={selectedIds.length === 0 || !driverId}
            onClick={() => {
              setAmount(selectedTotal === null ? '' : (selectedTotal / 100).toFixed(2));
              setRemitOpen(true);
            }}
          >
            Record remittance
          </Button>
        }
      />

      <Stack spacing={2}>
        <Stack direction={{ xs: 'column', sm: 'row' }} spacing={2}>
          <TextField
            select
            size="small"
            label="Cash state"
            value={state ?? ''}
            onChange={(event) => {
              setState(event.target.value || null);
              setSkip(0);
            }}
            sx={{ minWidth: 220 }}
          >
            <MenuItem value="">Any state</MenuItem>
            {CASH_STATES.map((value) => (
              <MenuItem key={value} value={value}>
                {describeStatus(cashStateMeta, value).label}
              </MenuItem>
            ))}
          </TextField>
          <TextField
            select
            size="small"
            label="Driver"
            value={driverId ?? ''}
            onChange={(event) => {
              setDriverId(event.target.value || null);
              setSelectedIds([]);
              setSkip(0);
            }}
            sx={{ minWidth: 220 }}
            helperText="A remittance is recorded against one driver."
          >
            <MenuItem value="">Any driver</MenuItem>
            {(driversQuery.data?.items ?? []).map((row) => (
              <MenuItem key={row.driver.id} value={row.driver.id}>
                {row.driver.name}
              </MenuItem>
            ))}
          </TextField>
        </Stack>

        <Alert severity="info">
          Recording cash collection is an operator action on the booking. Remittance is recorded
          here by finance against specific ledger entries, and it never counts as new revenue.
        </Alert>

        <ResourceTable
          caption="Cash ledger entries"
          columns={columns}
          rows={query.data?.items ?? []}
          getRowId={(entry) => entry.id}
          isLoading={query.isLoading}
          isFetching={query.isFetching}
          error={query.error as NormalizedApiError | undefined}
          onRetry={() => void query.refetch()}
          emptyTitle="No cash entries"
          emptyDescription="Adjust the filters, or choose a driver to see what they are holding."
          page={{
            limit: PAGE_SIZE,
            skip,
            hasProbableNextPage: query.data?.hasProbableNextPage ?? false,
            onSkipChange: setSkip,
          }}
        />
      </Stack>

      <FormDialog
        open={remitOpen}
        title="Record a cash remittance"
        description="Confirm the driver, the ledger entries and the amount handed in before sending."
        submitLabel="Record remittance"
        pending={remit.pending}
        error={remit.error}
        unconfirmed={remit.unconfirmed}
        onRetryUnconfirmed={() => void remit.retryUnconfirmed()}
        disabled={
          Boolean(moneyFieldError(amount, true)) ||
          receiptReference.trim() === '' ||
          selectedIds.length === 0
        }
        onClose={() => setRemitOpen(false)}
        onSubmit={() => void remit.submit()}
      >
        <Typography variant="body2">
          {selectedIds.length} ledger entr{selectedIds.length === 1 ? 'y' : 'ies'} selected,
          totalling <Money cents={selectedTotal} emphasis />.
        </Typography>
        <MoneyField label="Amount handed in" value={amount} onChange={setAmount} required />
        <TextField
          label="Receipt reference"
          value={receiptReference}
          onChange={(event) => setReceiptReference(event.target.value)}
          fullWidth
          required
        />
        <TextField
          label="Notes"
          value={notes}
          onChange={(event) => setNotes(event.target.value)}
          fullWidth
          multiline
          minRows={2}
        />
      </FormDialog>
    </>
  );
}
