import Alert from '@mui/material/Alert';
import Button from '@mui/material/Button';
import Chip from '@mui/material/Chip';
import MenuItem from '@mui/material/MenuItem';
import Stack from '@mui/material/Stack';
import TextField from '@mui/material/TextField';
import Typography from '@mui/material/Typography';
import { useState } from 'react';
import { Link as RouterLink, useSearchParams } from 'react-router-dom';

import { PAYMENT_ATTEMPT_STATUSES, type ProvisionalCreditStatus } from '@/api/dto/finance';
import { useListPaymentsQuery, useReconcilePaymentMutation } from '@/api/endpoints/finance';
import type { NormalizedApiError } from '@/api/errors';
import { POLLING, polled } from '@/api/polling';
import type { PaymentAttempt } from '@/api/types';
import { useTownScope } from '@/app/useTownScope';
import { useStaffSession } from '@/auth/useAuth';
import { FormDialog } from '@/components/FormDialog';
import { KeyValue } from '@/components/KeyValue';
import { Money } from '@/components/Money';
import { PageHeader } from '@/components/PageHeader';
import { ResourceTable, type Column } from '@/components/ResourceTable';
import { StatusChip } from '@/components/StatusChip';
import { describeStatus, paymentAttemptMeta, paymentMethodMeta } from '@/components/statusMeta';
import { formatDateTime } from '@/lib/datetime';
import { foodFinanceScopeKey } from '@/lib/foodSettlementAccess';
import { hasCapability } from '@/lib/permissions';
import { useFinancialAction } from '@/lib/useFinancialAction';
import { useNumberQueryParam, useQueryParam } from '@/lib/useUrlState';

const PAGE_SIZE = 25;
const creditLabels: Record<ProvisionalCreditStatus, string> = {
  PENDING: 'Provisional pending',
  HELD: 'Held for review',
  ELIGIBLE: 'Available for settlement',
  REVERSED: 'Credit reversed',
};
const creditLabel = (payment: PaymentAttempt) =>
  payment.provisionalCreditStatus ? creditLabels[payment.provisionalCreditStatus] : 'Not confirmed';

/** Historical collections remain visible when new EcoCash checkout is disabled. */
export function PaymentsPage() {
  const { townId } = useTownScope();
  const session = useStaffSession();
  const scopeKey = foodFinanceScopeKey(session);
  const [status] = useQueryParam('status');
  const [shopId] = useQueryParam('shopId');
  const [foodOrderId] = useQueryParam('foodOrderId');
  const [, setSearchParams] = useSearchParams();
  function setFilter(key: string, value: string) {
    setSearchParams(
      (current) => {
        const next = new URLSearchParams(current);
        next.delete('skip');
        if (value) {
          next.set(key, value);
        } else {
          next.delete(key);
        }
        return next;
      },
      { replace: true },
    );
  }
  const [skip, setSkip] = useNumberQueryParam('skip', 0);
  const selectionScope = JSON.stringify([scopeKey, townId, shopId, foodOrderId, status, skip]);
  const [selection, setSelection] = useState<{ id: string; scope: string } | null>(null);

  const query = useListPaymentsQuery(
    { scopeKey, townId, shopId, foodOrderId, status: status as never, limit: PAGE_SIZE, skip },
    polled(POLLING.finance),
  );
  const protectedError = ['unauthenticated', 'forbidden', 'notFound'].includes(
    (query.error as NormalizedApiError | undefined)?.kind ?? '',
  );
  const data = protectedError ? undefined : query.currentData;
  const selected =
    selection?.scope === selectionScope
      ? (data?.items.find((payment) => payment.id === selection.id) ?? null)
      : null;
  const mayReconcile = (payment: PaymentAttempt) =>
    hasCapability(session, 'payments.reconcile') &&
    (!payment.foodOrderId || payment.canReconcile === true);
  const [reconcilePayment] = useReconcilePaymentMutation();
  const reconcile = useFinancialAction({
    scopeKey: `${selectionScope}:${selected?.id ?? ''}`,
    run: (payment: PaymentAttempt, idempotencyKey: string) => {
      if (!mayReconcile(payment)) {
        throw { kind: 'forbidden', message: 'Reconciliation is not available for this payment.' };
      }
      return reconcilePayment({
        id: payment.id,
        bookingId: payment.bookingId,
        idempotencyKey,
      }).unwrap();
    },
    refresh: () => void query.refetch(),
    successMessage: (result) =>
      result.applied
        ? selected?.foodOrderId
          ? 'The provider result was verified and recorded. Food preparation, dispatch and shop settlement remain separate.'
          : 'The provider confirmed this payment and the booking was updated.'
        : `No payment change was confirmed (${result.reason ?? result.status}). Review the latest attempt.`,
    onSuccess: () => setSelection(null),
  });
  function inspect(payment: PaymentAttempt) {
    reconcile.reset();
    setSelection({ id: payment.id, scope: selectionScope });
  }

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
      header: 'Booking / food order',
      render: (payment) => (
        <Stack>
          <Button component={RouterLink} to={`/bookings/${payment.bookingId}`} size="small">
            {payment.bookingId.slice(-6)}
          </Button>
          {payment.foodOrderId ? (
            <Typography variant="caption">Food order {payment.foodOrderId}</Typography>
          ) : null}
          {payment.shopId ? <Typography variant="caption">Shop {payment.shopId}</Typography> : null}
        </Stack>
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
      header: 'Full collection',
      align: 'right',
      render: (payment) => <Money cents={payment.amountCents} srLabel="Payment amount" />,
    },
    {
      id: 'status',
      header: 'Collection / shop credit',
      render: (payment) => (
        <Stack spacing={0.5}>
          <StatusChip descriptor={describeStatus(paymentAttemptMeta, payment.status)} />
          {payment.foodOrderId ? <Chip size="small" label={creditLabel(payment)} /> : null}
        </Stack>
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
      header: 'Hold / exception',
      render: (payment) => payment.holdReason ?? payment.financeExceptionReason ?? 'None',
    },
    {
      id: 'actions',
      header: 'Actions',
      render: (payment) => (
        <Stack direction="row" spacing={1}>
          <Button size="small" onClick={() => inspect(payment)}>
            Details
          </Button>
          {mayReconcile(payment) ? (
            <Button size="small" variant="outlined" onClick={() => inspect(payment)}>
              Reconcile
            </Button>
          ) : null}
        </Stack>
      ),
    },
  ];

  return (
    <>
      <PageHeader
        title="Payments"
        description="Electronic customer collections and provider reconciliation. Shop payouts are recorded separately."
        crumbs={[{ label: 'Finance' }, { label: 'Payments' }]}
      />
      <Stack spacing={2}>
        <Stack direction={{ xs: 'column', sm: 'row' }} spacing={2}>
          <TextField
            select
            size="small"
            label="Status"
            value={status ?? ''}
            onChange={(event) => {
              setFilter('status', event.target.value);
            }}
            sx={{ minWidth: 220 }}
          >
            <MenuItem value="">Any status</MenuItem>
            {PAYMENT_ATTEMPT_STATUSES.map((value) => (
              <MenuItem key={value} value={value}>
                {describeStatus(paymentAttemptMeta, value).label}
              </MenuItem>
            ))}
          </TextField>
          <TextField
            size="small"
            label="Shop ID"
            value={shopId ?? ''}
            onChange={(event) => {
              setFilter('shopId', event.target.value);
            }}
          />
          <TextField
            size="small"
            label="Food order ID"
            value={foodOrderId ?? ''}
            onChange={(event) => {
              setFilter('foodOrderId', event.target.value);
            }}
          />
        </Stack>
        <Alert severity="info">
          Only provider verification confirms a collection. A paid food order still needs shop
          acceptance and explicit readiness before dispatch. Provisional or held food credits are
          not completed shop payouts. An unknown outcome must be reconciled before another charge.
          Customers restricted from food cash on delivery require confirmed online prepayment. A
          provider outage does not remove that restriction.
        </Alert>
        <ResourceTable
          caption="Payment attempts"
          columns={columns}
          rows={data?.items ?? []}
          getRowId={(payment) => payment.id}
          isLoading={query.isLoading || (!data && query.isFetching)}
          isFetching={query.isFetching}
          error={query.error as NormalizedApiError | undefined}
          onRetry={() => void query.refetch()}
          emptyTitle="No payment attempts"
          emptyDescription="Adjust the filters or switch town."
          page={{
            limit: PAGE_SIZE,
            skip,
            hasProbableNextPage: data?.hasProbableNextPage ?? false,
            onSkipChange: setSkip,
          }}
        />
      </Stack>
      <FormDialog
        open={selected !== null}
        title="Payment details and reconciliation"
        description="Verify the original attempt with the provider. A browser redirect or successful collection does not release a food order for dispatch or pay its shop."
        submitLabel="Verify with provider"
        pending={reconcile.pending}
        disabled={!selected || !mayReconcile(selected)}
        error={reconcile.error}
        unconfirmed={reconcile.unconfirmed}
        onClose={() => setSelection(null)}
        onSubmit={() => {
          if (selected) {
            void reconcile.submit(selected);
          }
        }}
      >
        {selected ? (
          <>
            <KeyValue
              columns={1}
              entries={[
                { label: 'Reference', value: selected.providerReference ?? selected.reference },
                { label: 'Booking', value: selected.bookingId },
                { label: 'Shop', value: selected.shopId },
                { label: 'Food order', value: selected.foodOrderId },
                {
                  label: 'Full customer collection',
                  value: <Money cents={selected.amountCents} />,
                },
                {
                  label: 'Provider-confirmed amount',
                  value:
                    selected.verifiedAmountCents !== undefined ? (
                      selected.verifiedCurrency === 'USD' ? (
                        <Money cents={selected.verifiedAmountCents} />
                      ) : (
                        `${selected.verifiedAmountCents} minor units`
                      )
                    ) : (
                      'Not verified'
                    ),
                },
                {
                  label: 'Provider-confirmed currency',
                  value: selected.verifiedCurrency ?? 'Not verified',
                },
                {
                  label: 'Wallet',
                  value: selected.walletNumberMasked
                    ? `•••• ${selected.walletNumberMasked.replace(/\D/g, '').slice(-4)}`
                    : 'Not available',
                },
                {
                  label: 'Collection status',
                  value: describeStatus(paymentAttemptMeta, selected.status).label,
                },
                { label: 'Last provider status', value: selected.lastProviderStatus },
                {
                  label: 'Shop credit',
                  value: selected.foodOrderId ? creditLabel(selected) : 'Not a food collection',
                },
                {
                  label: 'Hold / exception',
                  value: selected.holdReason ?? selected.financeExceptionReason,
                },
                ...(selected.allocations
                  ? [
                      {
                        label: 'Food subtotal',
                        value: <Money cents={selected.allocations.foodSubtotalCents} />,
                      },
                      {
                        label: 'Delivery fee',
                        value: <Money cents={selected.allocations.deliveryFeeCents} />,
                      },
                      {
                        label: 'Snapshotted commission',
                        value: <Money cents={selected.allocations.commissionCents} />,
                      },
                      {
                        label: 'Net shop food credit',
                        value: <Money cents={selected.allocations.shopNetCents} />,
                      },
                    ]
                  : []),
              ]}
            />
            {selected.foodOrderId ? (
              <>
                <Alert severity="info">
                  The delivery fee is part of the customer collection. The net shop credit is
                  supplied by the API after food commission; delivery is not deducted again.
                </Alert>
                <Button
                  component={RouterLink}
                  to={`/finance/refunds?${new URLSearchParams({ paymentAttemptId: selected.id, foodOrderId: selected.foodOrderId, ...(selected.shopId ? { shopId: selected.shopId } : {}) })}`}
                >
                  Related refunds
                </Button>
                {!mayReconcile(selected) ? (
                  <Alert severity="warning">
                    Provider reconciliation is not currently available for this attempt. Refresh or
                    contact finance with its reference.
                  </Alert>
                ) : null}
              </>
            ) : null}
          </>
        ) : null}
      </FormDialog>
    </>
  );
}
