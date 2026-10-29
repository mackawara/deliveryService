import Alert from '@mui/material/Alert';
import Button from '@mui/material/Button';
import MenuItem from '@mui/material/MenuItem';
import Stack from '@mui/material/Stack';
import TextField from '@mui/material/TextField';
import Typography from '@mui/material/Typography';
import { useState } from 'react';
import { Link as RouterLink } from 'react-router-dom';

import { REFUND_SETTLEMENT_STATUSES, REFUND_STATUSES } from '@/api/dto/finance';
import {
  useApproveRefundMutation,
  useListRefundsQuery,
  useRequestRefundMutation,
  useSettleRefundMutation,
} from '@/api/endpoints/finance';
import type { NormalizedApiError } from '@/api/errors';
import { POLLING, polled } from '@/api/polling';
import type { Refund } from '@/api/types';
import { FormDialog } from '@/components/FormDialog';
import { KeyValue } from '@/components/KeyValue';
import { Money } from '@/components/Money';
import { MoneyField, moneyFieldError } from '@/components/MoneyField';
import { PageHeader } from '@/components/PageHeader';
import { ReasonField, isReasonValid } from '@/components/ReasonField';
import { ResourceTable, type Column } from '@/components/ResourceTable';
import { StatusChip } from '@/components/StatusChip';
import { describeStatus, refundStatusMeta } from '@/components/statusMeta';
import { formatDateTime } from '@/lib/datetime';
import { parseUsdToCents } from '@/lib/money';
import { useFinancialAction } from '@/lib/useFinancialAction';
import { hasCapability, type StaffSession } from '@/lib/permissions';
import { useQueryParam } from '@/lib/useUrlState';
import { useStaffSession } from '@/auth/useAuth';
import { foodFinanceScopeKey } from '@/lib/foodSettlementAccess';

const RECENT_RESULT_LIMIT = 100;

/**
 * Refund workflow (specification section 4.6).
 *
 * Request, approve and settle are separate actions with their own inputs, and a
 * completed refund reflects a server finance record rather than an optimistic change.
 */
export function RefundsPage() {
  const session = useStaffSession();
  const scopeKey = foodFinanceScopeKey(session);
  return <ScopedRefundsPage key={scopeKey} scopeKey={scopeKey} session={session} />;
}

function ScopedRefundsPage({
  scopeKey,
  session,
}: {
  scopeKey: string;
  session: StaffSession | null;
}) {
  const [status, setStatus] = useQueryParam('status');
  const [shopId, setShopId] = useQueryParam('shopId');
  const [foodOrderId, setFoodOrderId] = useQueryParam('foodOrderId');
  const [paymentAttemptId, setPaymentAttemptId] = useQueryParam('paymentAttemptId');
  const [requestOpen, setRequestOpen] = useState(false);
  const [approveTarget, setApproveTarget] = useState<Refund | null>(null);
  const [settleTarget, setSettleTarget] = useState<Refund | null>(null);

  const [bookingId, setBookingId] = useState('');
  const [requestAttemptId, setRequestAttemptId] = useState(paymentAttemptId ?? '');
  const [amount, setAmount] = useState('');
  const [reason, setReason] = useState('');
  const [approveReason, setApproveReason] = useState('');
  const [settleStatus, setSettleStatus] =
    useState<(typeof REFUND_SETTLEMENT_STATUSES)[number]>('PROCESSING');
  const [providerReference, setProviderReference] = useState('');
  const [failureReason, setFailureReason] = useState('');

  const query = useListRefundsQuery(
    {
      scopeKey,
      shopId,
      foodOrderId,
      paymentAttemptId,
      status: status as never,
      limit: RECENT_RESULT_LIMIT,
      skip: 0,
    },
    polled(POLLING.finance),
  );
  const [requestRefund] = useRequestRefundMutation();
  const [approveRefund] = useApproveRefundMutation();
  const [settleRefund] = useSettleRefundMutation();

  const request = useFinancialAction({
    scopeKey,
    allowUnconfirmedRetry: true,
    run: (_args: void, idempotencyKey: string) => {
      const parsed = parseUsdToCents(amount);
      if (!parsed.ok) throw new Error('unreachable: guarded by the dialog');
      return requestRefund({
        bookingId: bookingId.trim(),
        paymentAttemptId: requestAttemptId.trim() || undefined,
        amountCents: parsed.cents,
        reason: reason.trim(),
        idempotencyKey,
      }).unwrap();
    },
    refresh: () => void query.refetch(),
    successMessage: 'Refund requested. It still needs approval and settlement.',
    onSuccess: () => {
      setRequestOpen(false);
      setBookingId('');
      setRequestAttemptId('');
      setAmount('');
      setReason('');
    },
  });

  const approve = useFinancialAction({
    scopeKey: `${scopeKey}:${approveTarget?.id ?? ''}:approve`,
    run: (_args: void, idempotencyKey: string) => {
      if (!approveTarget) throw new Error('unreachable: guarded by the dialog');
      return approveRefund({
        id: approveTarget.id,
        reason: approveReason.trim(),
        expectedVersion: approveTarget.version,
        idempotencyKey,
      }).unwrap();
    },
    refresh: () => void query.refetch(),
    successMessage: 'Refund approved. Settlement is a separate step.',
    onSuccess: () => setApproveTarget(null),
  });

  const settle = useFinancialAction({
    scopeKey: `${scopeKey}:${settleTarget?.id ?? ''}:settle`,
    run: (_args: void, idempotencyKey: string) => {
      if (!settleTarget) throw new Error('unreachable: guarded by the dialog');
      return settleRefund({
        id: settleTarget.id,
        status: settleStatus,
        providerReference: providerReference.trim() || undefined,
        failureReason: failureReason.trim() || undefined,
        expectedVersion: settleTarget.version,
        idempotencyKey,
      }).unwrap();
    },
    refresh: () => void query.refetch(),
    successMessage: 'Settlement recorded from the server finance record.',
    onSuccess: () => setSettleTarget(null),
  });

  const columns: Array<Column<Refund>> = [
    {
      id: 'booking',
      header: 'Booking',
      render: (refund) => (
        <Button component={RouterLink} to={`/bookings/${refund.bookingId}`} size="small">
          {refund.bookingId.slice(-6)}
        </Button>
      ),
    },
    {
      id: 'amount',
      header: 'Amount',
      align: 'right',
      render: (refund) => <Money cents={refund.amountCents} />,
    },
    {
      id: 'status',
      header: 'Status',
      render: (refund) => (
        <StatusChip descriptor={describeStatus(refundStatusMeta, refund.status)} />
      ),
    },
    {
      id: 'food',
      header: 'Food payment / hold',
      render: (refund) => (
        <Stack spacing={0.5}>
          {refund.foodOrderId ? (
            <Typography variant="body2">Order {refund.foodOrderId}</Typography>
          ) : null}
          {refund.shopId ? <Typography variant="caption">Shop {refund.shopId}</Typography> : null}
          {refund.paymentAttemptId ? (
            <Typography variant="caption">Payment {refund.paymentAttemptId}</Typography>
          ) : null}
          {refund.holdReason ? (
            <Typography variant="body2" color="warning.main">
              {refund.holdReason}
            </Typography>
          ) : null}
          {refund.foodOrderId ? (
            <Button
              component={RouterLink}
              size="small"
              to={`/finance/payments?${new URLSearchParams({ foodOrderId: refund.foodOrderId, ...(refund.shopId ? { shopId: refund.shopId } : {}) })}`}
            >
              Food collection
            </Button>
          ) : null}
        </Stack>
      ),
    },
    { id: 'reason', header: 'Reason', minWidth: 200, render: (refund) => refund.reason },
    {
      id: 'manual',
      header: 'Manual work',
      render: (refund) =>
        refund.manualWorkflowRequired ? (
          <Typography variant="body2" color="warning.main">
            Finance must settle manually
          </Typography>
        ) : (
          <Typography variant="body2" color="text.secondary">
            Provider workflow
          </Typography>
        ),
    },
    { id: 'requested', header: 'Requested', render: (refund) => formatDateTime(refund.createdAt) },
    {
      id: 'actions',
      header: 'Actions',
      minWidth: 180,
      render: (refund) => (
        <Stack direction="row" spacing={1}>
          <Button
            size="small"
            variant="outlined"
            disabled={refund.status !== 'REQUESTED' || !hasCapability(session, 'refunds.approve')}
            onClick={() => setApproveTarget(refund)}
          >
            Approve
          </Button>
          <Button
            size="small"
            variant="outlined"
            disabled={
              !['APPROVED', 'PROCESSING'].includes(refund.status) ||
              !hasCapability(session, 'refunds.settle')
            }
            onClick={() => setSettleTarget(refund)}
          >
            Settle
          </Button>
        </Stack>
      ),
    },
  ];

  return (
    <>
      <PageHeader
        title="Refunds"
        description="Request, approve and settle refunds against booking payments."
        crumbs={[{ label: 'Finance' }, { label: 'Refunds' }]}
        actions={
          <Button
            variant="contained"
            disabled={!hasCapability(session, 'refunds.request')}
            onClick={() => {
              setRequestAttemptId(paymentAttemptId ?? '');
              setRequestOpen(true);
            }}
          >
            Request refund
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
            }}
            sx={{ minWidth: 220, maxWidth: 260 }}
          >
            <MenuItem value="">Any status</MenuItem>
            {REFUND_STATUSES.map((value) => (
              <MenuItem key={value} value={value}>
                {describeStatus(refundStatusMeta, value).label}
              </MenuItem>
            ))}
          </TextField>

          <TextField
            size="small"
            label="Shop ID"
            value={shopId ?? ''}
            onChange={(event) => setShopId(event.target.value || null)}
          />
          <TextField
            size="small"
            label="Food order ID"
            value={foodOrderId ?? ''}
            onChange={(event) => setFoodOrderId(event.target.value || null)}
          />
          <TextField
            size="small"
            label="Payment attempt ID"
            value={paymentAttemptId ?? ''}
            onChange={(event) => setPaymentAttemptId(event.target.value || null)}
          />
        </Stack>
        <Alert severity="info">
          A refund is completed only when the server records it. Nothing on this page marks money as
          returned before the backend confirms the stage. The table shows up to the{' '}
          {RECENT_RESULT_LIMIT} most recent matching refunds until reliable offset pagination is
          available.
        </Alert>

        <ResourceTable
          caption="Refunds"
          columns={columns}
          rows={
            ['unauthenticated', 'forbidden', 'notFound'].includes(
              (query.error as NormalizedApiError | undefined)?.kind ?? '',
            )
              ? []
              : (query.currentData?.items ?? [])
          }
          getRowId={(refund) => refund.id}
          isLoading={query.isLoading}
          isFetching={query.isFetching}
          error={query.error as NormalizedApiError | undefined}
          onRetry={() => void query.refetch()}
          emptyTitle="No refunds"
          emptyDescription="Refunds requested by finance appear here."
        />
      </Stack>

      <FormDialog
        open={requestOpen}
        title="Request a refund"
        description="Confirm the booking, the amount and the reason. Approval and settlement follow separately."
        submitLabel="Request refund"
        pending={request.pending}
        error={request.error}
        unconfirmed={request.unconfirmed}
        onRetryUnconfirmed={() => void request.retryUnconfirmed()}
        disabled={
          !hasCapability(session, 'refunds.request') ||
          bookingId.trim() === '' ||
          Boolean(moneyFieldError(amount, true)) ||
          !isReasonValid(reason)
        }
        onClose={() => setRequestOpen(false)}
        onSubmit={() => void request.submit()}
      >
        <TextField
          label="Booking identifier"
          value={bookingId}
          onChange={(event) => setBookingId(event.target.value)}
          fullWidth
          required
        />
        <TextField
          label="Payment attempt identifier"
          value={requestAttemptId}
          onChange={(event) => setRequestAttemptId(event.target.value)}
          fullWidth
          helperText="Link the original collection when resolving a food payment exception."
        />
        <MoneyField label="Refund amount" value={amount} onChange={setAmount} required />
        <ReasonField value={reason} onChange={setReason} />
      </FormDialog>

      <FormDialog
        open={approveTarget !== null}
        title="Approve this refund"
        submitLabel="Approve refund"
        pending={approve.pending}
        error={approve.error}
        unconfirmed={approve.unconfirmed}
        onRetryUnconfirmed={() => void approve.retryUnconfirmed()}
        disabled={!isReasonValid(approveReason) || !hasCapability(session, 'refunds.approve')}
        onClose={() => setApproveTarget(null)}
        onSubmit={() => void approve.submit()}
      >
        {approveTarget ? (
          <KeyValue
            columns={1}
            entries={[
              { label: 'Booking', value: approveTarget.bookingId },
              { label: 'Amount', value: <Money cents={approveTarget.amountCents} /> },
              { label: 'Requested reason', value: approveTarget.reason },
            ]}
          />
        ) : null}
        <ReasonField value={approveReason} onChange={setApproveReason} label="Approval reason" />
      </FormDialog>

      <FormDialog
        open={settleTarget !== null}
        title="Settle this refund"
        description="Record the stage the provider or finance process actually reached."
        submitLabel="Record settlement"
        pending={settle.pending}
        error={settle.error}
        unconfirmed={settle.unconfirmed}
        onRetryUnconfirmed={() => void settle.retryUnconfirmed()}
        disabled={
          !hasCapability(session, 'refunds.settle') ||
          (settleStatus === 'FAILED' && failureReason.trim() === '')
        }
        onClose={() => setSettleTarget(null)}
        onSubmit={() => void settle.submit()}
      >
        {settleTarget ? (
          <KeyValue
            columns={1}
            entries={[
              { label: 'Booking', value: settleTarget.bookingId },
              { label: 'Amount', value: <Money cents={settleTarget.amountCents} /> },
              {
                label: 'Current status',
                value: describeStatus(refundStatusMeta, settleTarget.status).label,
              },
            ]}
          />
        ) : null}
        <TextField
          select
          label="New stage"
          value={settleStatus}
          onChange={(event) => setSettleStatus(event.target.value as typeof settleStatus)}
          fullWidth
        >
          {REFUND_SETTLEMENT_STATUSES.map((value) => (
            <MenuItem key={value} value={value}>
              {describeStatus(refundStatusMeta, value).label}
            </MenuItem>
          ))}
        </TextField>
        <TextField
          label="Provider reference"
          value={providerReference}
          onChange={(event) => setProviderReference(event.target.value)}
          fullWidth
          helperText="Required by finance policy when a provider settled the refund."
        />
        <TextField
          label="Failure reason"
          value={failureReason}
          onChange={(event) => setFailureReason(event.target.value)}
          fullWidth
          required={settleStatus === 'FAILED'}
          multiline
          minRows={2}
        />
      </FormDialog>
    </>
  );
}
