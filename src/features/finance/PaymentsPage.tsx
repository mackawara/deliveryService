import Alert from '@mui/material/Alert';
import Button from '@mui/material/Button';
import MenuItem from '@mui/material/MenuItem';
import Stack from '@mui/material/Stack';
import TextField from '@mui/material/TextField';
import Typography from '@mui/material/Typography';
import { useState } from 'react';
import { Link as RouterLink } from 'react-router-dom';

import { PAYMENT_ATTEMPT_STATUSES } from '@/api/dto/finance';
import { useListPaymentsQuery, useReconcilePaymentMutation } from '@/api/endpoints/finance';
import type { NormalizedApiError } from '@/api/errors';
import { POLLING, polled } from '@/api/polling';
import type { PaymentAttempt } from '@/api/types';
import { useTownScope } from '@/app/useTownScope';
import { FormDialog } from '@/components/FormDialog';
import { KeyValue } from '@/components/KeyValue';
import { Money } from '@/components/Money';
import { PageHeader } from '@/components/PageHeader';
import { ResourceTable, type Column } from '@/components/ResourceTable';
import { StatusChip } from '@/components/StatusChip';
import { describeStatus, paymentAttemptMeta, paymentMethodMeta } from '@/components/statusMeta';
import { formatDateTime } from '@/lib/datetime';
import { useGuardedAction } from '@/lib/useGuardedAction';
import { useNumberQueryParam, useQueryParam } from '@/lib/useUrlState';

const PAGE_SIZE = 25;

/**
 * Payment attempts and reconciliation (specification section 4.6).
 *
 * Reconcile asks the server to verify with the provider. There is no force-paid control,
 * and an unknown outcome is resolved by checking the original attempt rather than
 * creating another payment.
 */
export function PaymentsPage() {
  const { townId } = useTownScope();
  const [status, setStatus] = useQueryParam('status');
  const [skip, setSkip] = useNumberQueryParam('skip', 0);
  const [selected, setSelected] = useState<PaymentAttempt | null>(null);

  const query = useListPaymentsQuery(
    { townId, status: status as never, limit: PAGE_SIZE, skip },
    polled(POLLING.finance),
  );
  const [reconcilePayment] = useReconcilePaymentMutation();

  const reconcile = useGuardedAction({
    run: (_args: void, idempotencyKey: string) => {
      if (!selected) throw new Error('unreachable: guarded by the dialog');
      return reconcilePayment({
        id: selected.id,
        bookingId: selected.bookingId,
        idempotencyKey,
      }).unwrap();
    },
    refresh: () => void query.refetch(),
    successMessage: (result) =>
      result.applied
        ? 'The provider confirmed this payment and the booking was updated.'
        : `The provider did not confirm a change (${result.reason ?? result.status}). The attempt is unchanged.`,
    onSuccess: () => setSelected(null),
  });

  const columns: Array<Column<PaymentAttempt>> = [
    {
      id: 'reference',
      header: 'Reference',
      minWidth: 180,
      render: (payment) => (
        <Stack spacing={0.25}>
          <Typography variant="body2" sx={{ fontWeight: 600 }}>
            {payment.providerReference ?? payment.reference}
          </Typography>
          <Typography variant="caption" color="text.secondary">
            {payment.provider === 'NONE' ? 'No provider' : payment.provider}
          </Typography>
        </Stack>
      ),
    },
    {
      id: 'booking',
      header: 'Booking',
      render: (payment) => (
        <Button component={RouterLink} to={`/bookings/${payment.bookingId}`} size="small">
          {payment.bookingId.slice(-6)}
        </Button>
      ),
    },
    {
      id: 'method',
      header: 'Method',
      render: (payment) => (
        <StatusChip descriptor={describeStatus(paymentMethodMeta, payment.method)} />
      ),
    },
    {
      id: 'amount',
      header: 'Amount',
      align: 'right',
      render: (payment) => <Money cents={payment.amountCents} srLabel="Payment amount" />,
    },
    {
      id: 'status',
      header: 'Status',
      render: (payment) => (
        <StatusChip descriptor={describeStatus(paymentAttemptMeta, payment.status)} />
      ),
    },
    {
      id: 'timestamps',
      header: 'Created / resolved',
      minWidth: 180,
      render: (payment) => (
        <Stack spacing={0.25}>
          <Typography variant="caption">{formatDateTime(payment.createdAt)}</Typography>
          <Typography variant="caption" color="text.secondary">
            {payment.resolvedAt ? formatDateTime(payment.resolvedAt) : 'Not resolved'}
          </Typography>
        </Stack>
      ),
    },
    {
      id: 'exception',
      header: 'Exception',
      render: (payment) =>
        payment.financeExceptionReason ? (
          <Typography variant="body2" color="error.main">
            {payment.financeExceptionReason}
          </Typography>
        ) : (
          <Typography variant="body2" color="text.secondary">
            None
          </Typography>
        ),
    },
    {
      id: 'actions',
      header: 'Actions',
      render: (payment) => (
        <Button size="small" variant="outlined" onClick={() => setSelected(payment)}>
          Reconcile
        </Button>
      ),
    },
  ];

  return (
    <>
      <PageHeader
        title="Payments"
        description="Electronic payment attempts and provider reconciliation."
        crumbs={[{ label: 'Finance' }, { label: 'Payments' }]}
      />

      <Stack spacing={2}>
        <TextField
          select
          size="small"
          label="Status"
          value={status ?? ''}
          onChange={(event) => {
            setStatus(event.target.value || null);
            setSkip(0);
          }}
          sx={{ minWidth: 220, maxWidth: 260 }}
        >
          <MenuItem value="">Any status</MenuItem>
          {PAYMENT_ATTEMPT_STATUSES.map((value) => (
            <MenuItem key={value} value={value}>
              {describeStatus(paymentAttemptMeta, value).label}
            </MenuItem>
          ))}
        </TextField>

        <Alert severity="info">
          Reconciliation asks the delivery service to verify the attempt with the provider. There is
          no force-paid control: a payment becomes paid only when the provider confirms it.
        </Alert>

        <ResourceTable
          caption="Payment attempts"
          columns={columns}
          rows={query.data?.items ?? []}
          getRowId={(payment) => payment.id}
          isLoading={query.isLoading}
          isFetching={query.isFetching}
          error={query.error as NormalizedApiError | undefined}
          onRetry={() => void query.refetch()}
          emptyTitle="No payment attempts"
          emptyDescription="Adjust the filters or switch town."
          page={{
            limit: PAGE_SIZE,
            skip,
            hasProbableNextPage: query.data?.hasProbableNextPage ?? false,
            onSkipChange: setSkip,
          }}
        />
      </Stack>

      <FormDialog
        open={selected !== null}
        title="Reconcile this payment"
        description="The server re-checks the attempt with the provider and applies the verified result. Nothing is marked paid here."
        submitLabel="Verify with provider"
        pending={reconcile.pending}
        error={reconcile.error}
        unconfirmed={reconcile.unconfirmed}
        onRetryUnconfirmed={() => void reconcile.retryUnconfirmed()}
        onClose={() => setSelected(null)}
        onSubmit={() => void reconcile.submit()}
      >
        {selected ? (
          <KeyValue
            columns={1}
            entries={[
              { label: 'Reference', value: selected.providerReference ?? selected.reference },
              { label: 'Booking', value: selected.bookingId },
              { label: 'Amount', value: <Money cents={selected.amountCents} /> },
              {
                label: 'Current status',
                value: describeStatus(paymentAttemptMeta, selected.status).label,
              },
              { label: 'Last provider status', value: selected.lastProviderStatus },
            ]}
          />
        ) : null}
      </FormDialog>
    </>
  );
}
