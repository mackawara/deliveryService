import {
  Alert,
  Button,
  Checkbox,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  FormControlLabel,
  Stack,
  TextField,
  Typography,
} from '@mui/material';
import { useState } from 'react';
import { useParams } from 'react-router-dom';

import type { FoodSettlement, PayoutDestination, ShopPayoutMethod } from '@/api/dto/foodFinance';
import {
  useApproveFoodSettlementMutation,
  useGetFoodSettlementQuery,
  useRecordFoodSettlementPaidMutation,
  useRevealFoodSettlementDestinationMutation,
  useVoidFoodSettlementMutation,
} from '@/api/endpoints/foodFinance';
import { fieldErrorMap, type NormalizedApiError } from '@/api/errors';
import { POLLING, polled } from '@/api/polling';
import { useStaffSession } from '@/auth/useAuth';
import { ApiError } from '@/components/ApiError';
import { FormDialog } from '@/components/FormDialog';
import { KeyValue } from '@/components/KeyValue';
import { Money } from '@/components/Money';
import { MoneyField } from '@/components/MoneyField';
import { PageHeader } from '@/components/PageHeader';
import {
  FoodStatementContent,
  PayoutDestinationSummary,
  financeTime,
} from '@/features/shop/foodFinanceView';
import { canUseFoodSettlements, foodFinanceScopeKey } from '@/lib/foodSettlementAccess';
import { parseUsdToCents } from '@/lib/money';
import { useFinancialAction } from '@/lib/useFinancialAction';
import { hararePaymentInstant } from '@/features/finance/foodFinanceTime';

type DialogAction = 'approve' | 'void' | 'paid' | 'reveal';
interface VersionCommand {
  id: string;
  expectedVersion: number;
}
interface ReasonCommand extends VersionCommand {
  reason: string;
}
interface PaidCommand extends VersionCommand {
  amountCents: number;
  method: ShopPayoutMethod;
  paidAt: string;
  reference: string;
  destinationId: string;
  destinationVersion: number;
}

export function FoodSettlementPage() {
  const { id = '' } = useParams();
  const session = useStaffSession();
  if (!canUseFoodSettlements(session))
    return <Alert severity="info">Shop settlements are unavailable for this account.</Alert>;
  return <FoodSettlementWorkspace key={`${foodFinanceScopeKey(session)}:${id}`} id={id} />;
}

function FoodSettlementWorkspace({ id }: { id: string }) {
  const session = useStaffSession();
  const scopeKey = foodFinanceScopeKey(session);
  const query = useGetFoodSettlementQuery(
    { scopeKey, id },
    { ...polled(POLLING.finance), skip: !id },
  );
  const statement = query.currentData;
  const denied = ['forbidden', 'unauthenticated'].includes(
    (query.error as NormalizedApiError | undefined)?.kind ?? '',
  );
  const inScope =
    !denied &&
    !!statement &&
    canUseFoodSettlements(session, 'food.settlements.read', statement.townId);
  const ready = inScope && !query.error && !query.isFetching;
  const [dialog, setDialog] = useState<DialogAction | null>(null);
  const [reason, setReason] = useState('');
  const [amount, setAmount] = useState('');
  const [paidDate, setPaidDate] = useState('');
  const [reference, setReference] = useState('');
  const [confirmed, setConfirmed] = useState(false);
  const [revealed, setRevealed] = useState<{
    destination: PayoutDestination;
    amountCents: number;
  } | null>(null);
  const [approveStatement] = useApproveFoodSettlementMutation();
  const [voidStatement] = useVoidFoodSettlementMutation();
  const [recordPaid] = useRecordFoodSettlementPaidMutation();
  const [revealDestination, revealResult] = useRevealFoodSettlementDestinationMutation();
  const refresh = () => {
    void query.refetch();
  };
  const approve = useFinancialAction<VersionCommand, FoodSettlement>({
    scopeKey,
    allowUnconfirmedRetry: true,
    run: (command, idempotencyKey) =>
      approveStatement({ ...command, scopeKey, idempotencyKey }).unwrap(),
    refresh,
    successMessage: 'Statement approved. Complete the external payment before recording it.',
    onSuccess: () => setDialog(null),
  });
  const voidAction = useFinancialAction<ReasonCommand, FoodSettlement>({
    scopeKey,
    allowUnconfirmedRetry: true,
    run: (command, idempotencyKey) =>
      voidStatement({ ...command, scopeKey, idempotencyKey }).unwrap(),
    refresh,
    successMessage: 'Statement voided. Its unpaid reservations have been released.',
    onSuccess: () => setDialog(null),
  });
  const pay = useFinancialAction<PaidCommand, FoodSettlement>({
    scopeKey,
    allowUnconfirmedRetry: true,
    run: (command, idempotencyKey) => recordPaid({ ...command, scopeKey, idempotencyKey }).unwrap(),
    refresh,
    successMessage: 'External payment recorded by the server.',
    onSuccess: () => {
      setDialog(null);
      setConfirmed(false);
    },
  });
  const reveal = useFinancialAction<
    ReasonCommand,
    { destination: PayoutDestination; amountCents: number }
  >({
    scopeKey,
    allowUnconfirmedRetry: true,
    run: (command, idempotencyKey) =>
      revealDestination({ ...command, scopeKey, idempotencyKey }).unwrap(),
    refresh,
    onSuccess: (result) => {
      setRevealed(result);
      revealResult.reset();
      setDialog(null);
    },
  });
  const actions = { approve, void: voidAction, paid: pay, reveal };
  const pending = Object.values(actions).some((action) => action.pending);
  const uncertain = Object.values(actions).some((action) => !!action.unconfirmed);
  const active = dialog ? actions[dialog] : null;
  const fields = fieldErrorMap(active?.error);
  const parsedAmount = parseUsdToCents(amount);
  const paidAt = hararePaymentInstant(paidDate);
  const amountMatches =
    parsedAmount.ok && parsedAmount.cents === statement?.amountCents && parsedAmount.cents > 0;
  const dateValid =
    !!paidAt &&
    !!statement &&
    !!statement.approvedAt &&
    new Date(paidAt).getTime() >= new Date(statement.approvedAt).getTime() &&
    new Date(paidAt).getTime() >= new Date(statement.payoutAt).getTime();
  const validReason = reason.trim().length >= 3 && reason.trim().length <= 500;
  const paymentValid =
    amountMatches &&
    dateValid &&
    reference.trim().length >= 3 &&
    reference.trim().length <= 100 &&
    confirmed;

  function allowed(action: DialogAction) {
    if (
      !statement ||
      !ready ||
      !canUseFoodSettlements(
        session,
        `food.settlements.${action === 'paid' ? 'pay' : action}`,
        statement.townId,
      )
    )
      return false;
    if (action === 'approve') return statement.status === 'DRAFT' && statement.amountCents > 0;
    if (action === 'void') return statement.status === 'DRAFT' || statement.status === 'APPROVED';
    if (action === 'paid')
      return (
        statement.status === 'APPROVED' &&
        statement.amountCents > 0 &&
        !!statement.destinationSnapshot?.accountIdentifier
      );
    return statement.status === 'APPROVED' || statement.status === 'PAID';
  }
  function open(action: DialogAction) {
    if ((!allowed(action) && !actions[action].unconfirmed) || pending) return;
    if (!uncertain) {
      actions[action].reset();
      setReason('');
      setConfirmed(false);
    }
    setDialog(action);
  }
  function submit() {
    if (!dialog || !statement || !allowed(dialog)) return;
    const version = { id: statement._id, expectedVersion: statement.version };
    if (dialog === 'approve' && confirmed) void approve.submit(version);
    if (dialog === 'void' && validReason)
      void voidAction.submit({ ...version, reason: reason.trim() });
    if (dialog === 'reveal' && validReason)
      void reveal.submit({ ...version, reason: reason.trim() });
    if (dialog === 'paid' && paymentValid && parsedAmount.ok && paidAt)
      void pay.submit({
        ...version,
        amountCents: parsedAmount.cents,
        paidAt,
        reference: reference.trim(),
        method: statement.destinationSnapshot.method,
        destinationId: statement.destinationSnapshot._id,
        destinationVersion: statement.destinationSnapshot.version,
      });
  }

  return (
    <>
      <PageHeader
        title="Shop settlement statement"
        description="Review the frozen statement and record the actual external payout."
        crumbs={[{ label: 'Shop settlements', to: '/finance/food-settlements' }, { label: id }]}
        actions={
          <>
            <Button onClick={refresh} disabled={query.isFetching}>
              Refresh
            </Button>
            {inScope ? <Button onClick={() => window.print()}>Print / save PDF</Button> : null}
          </>
        }
      />
      <ApiError error={query.error as NormalizedApiError | undefined} onRetry={refresh} />
      {query.isLoading ? (
        <Typography role="status">Loading settlement statement…</Typography>
      ) : null}
      {statement && !inScope && !denied ? (
        <Alert severity="warning">This statement is outside your authorized towns.</Alert>
      ) : null}
      {statement && inScope ? (
        <Stack spacing={3}>
          <Alert severity="info">
            This page records payments made outside the platform. It does not send money. A PAID
            statement can only be corrected through linked accounting adjustments.
          </Alert>
          <Stack
            direction="row"
            spacing={1}
            sx={{ flexWrap: 'wrap', gap: 1, '@media print': { display: 'none' } }}
          >
            {(['approve', 'void', 'reveal', 'paid'] as const).filter(allowed).map((action) => (
              <Button
                key={action}
                variant={action === 'paid' ? 'contained' : 'outlined'}
                disabled={pending || (uncertain && !actions[action].unconfirmed)}
                onClick={() => open(action)}
              >
                {action === 'approve'
                  ? 'Approve statement'
                  : action === 'void'
                    ? 'Void statement'
                    : action === 'reveal'
                      ? 'View frozen payout details'
                      : 'Record external payment'}
              </Button>
            ))}
          </Stack>
          {uncertain ? (
            <Alert
              severity="warning"
              action={
                <Stack>
                  {(['approve', 'void', 'reveal', 'paid'] as const)
                    .filter((action) => actions[action].unconfirmed)
                    .map((action) => (
                      <Button key={action} onClick={() => open(action)}>
                        Review original {action === 'paid' ? 'payment' : action} request
                      </Button>
                    ))}
                </Stack>
              }
            >
              A request outcome is unconfirmed. Reopen its action to retry the identical request
              with its original key before starting another financial action.
            </Alert>
          ) : null}
          {statement.amountCents <= 0 && statement.status === 'DRAFT' ? (
            <Alert severity="info">
              This statement has a zero or negative balance. It cannot be approved or marked paid;
              the server carries the balance forward.
            </Alert>
          ) : null}
          <FoodStatementContent statement={statement} />
        </Stack>
      ) : null}
      <FormDialog
        open={!!dialog && inScope}
        title={
          dialog === 'approve'
            ? 'Approve this statement'
            : dialog === 'void'
              ? 'Void this statement'
              : dialog === 'reveal'
                ? 'View frozen payout destination'
                : 'Record an external payment'
        }
        description={
          dialog === 'paid'
            ? 'Complete the transfer outside the platform first. Record its exact amount, actual payment date and reference below.'
            : dialog === 'reveal'
              ? 'Viewing the full destination is recorded in the audit trail. Close this view when finished.'
              : undefined
        }
        submitLabel={
          dialog === 'approve'
            ? 'Approve statement'
            : dialog === 'void'
              ? 'Void statement'
              : dialog === 'reveal'
                ? 'View destination'
                : 'Record payment'
        }
        pending={active?.pending}
        error={active?.error}
        unconfirmed={active?.unconfirmed}
        onRetryUnconfirmed={() => void active?.retryUnconfirmed()}
        onClose={() => setDialog(null)}
        onSubmit={submit}
        disabled={
          !dialog ||
          !allowed(dialog) ||
          (dialog === 'approve' ? !confirmed : dialog === 'paid' ? !paymentValid : !validReason)
        }
        maxWidth="md"
      >
        {statement ? (
          <>
            <KeyValue
              entries={[
                { label: 'Branch', value: statement.shopId },
                { label: 'Statement version', value: statement.version },
                { label: 'Approved amount', value: <Money cents={statement.amountCents} /> },
                { label: 'Included lines', value: statement.lines.length },
                { label: 'Scheduled payout', value: financeTime(statement.payoutAt) },
              ]}
            />
            <PayoutDestinationSummary destination={statement.destinationSnapshot} />
            <Typography variant="body2">
              Included orders:{' '}
              {statement.lines
                .map((line) => line.orderReference ?? line.orderId ?? line.sourceId)
                .join(', ') || 'None'}
            </Typography>
          </>
        ) : null}
        {dialog === 'void' || dialog === 'reveal' ? (
          <TextField
            label={dialog === 'void' ? 'Void reason' : 'Reason for viewing payout details'}
            value={reason}
            onChange={(event) => setReason(event.target.value)}
            fullWidth
            required
            multiline
            minRows={2}
            error={!!fields.reason}
            helperText={fields.reason ?? '3–500 characters. Retained with the audit record.'}
          />
        ) : null}
        {dialog === 'paid' ? (
          <>
            <MoneyField
              label="Actual external payment amount"
              value={amount}
              onChange={setAmount}
              required
              error={
                fields.amountCents ??
                (amount && !amountMatches
                  ? 'Enter exactly the approved positive amount.'
                  : undefined)
              }
            />
            <TextField
              label="External payment method"
              value={statement?.destinationSnapshot.method.replaceAll('_', ' ') ?? ''}
              fullWidth
              slotProps={{ input: { readOnly: true } }}
              helperText="Must match the frozen approved destination."
            />
            <TextField
              label="Actual paid date and time (Harare)"
              type="datetime-local"
              value={paidDate}
              onChange={(event) => setPaidDate(event.target.value)}
              fullWidth
              required
              slotProps={{ inputLabel: { shrink: true } }}
              error={!!fields.paidAt || (!!paidDate && !dateValid)}
              helperText={
                fields.paidAt ??
                'Africa/Harare · on or after approval and the scheduled payout; no future dates.'
              }
            />
            <TextField
              label="External payment reference"
              value={reference}
              onChange={(event) => setReference(event.target.value)}
              fullWidth
              required
              error={!!fields.reference}
              helperText={
                fields.reference ?? 'Receipt or bank/mobile-money reference, 3–100 characters.'
              }
            />
            <FormControlLabel
              control={
                <Checkbox
                  checked={confirmed}
                  onChange={(event) => setConfirmed(event.target.checked)}
                />
              }
              label="I completed this external payment to the frozen destination and checked the amount and reference."
            />
          </>
        ) : null}
        {dialog === 'approve' ? (
          <FormControlLabel
            control={
              <Checkbox
                checked={confirmed}
                onChange={(event) => setConfirmed(event.target.checked)}
              />
            }
            label="I reviewed the included orders, exceptions, calculation and frozen destination."
          />
        ) : null}
        {active?.error?.kind === 'conflict' ? (
          <Alert severity="warning">
            Your inputs are retained. The statement has been refreshed. Review its status, amount,
            destination and version before submitting a new action.
          </Alert>
        ) : null}
      </FormDialog>
      <Dialog
        open={!!revealed && inScope}
        onClose={() => {
          setRevealed(null);
          revealResult.reset();
        }}
        fullWidth
        maxWidth="sm"
        slotProps={{
          transition: {
            onExited: () => {
              setRevealed(null);
              revealResult.reset();
            },
          },
        }}
        sx={{ '@media print': { display: 'none' } }}
      >
        <DialogTitle>Frozen payout destination</DialogTitle>
        <DialogContent>
          <Stack spacing={2} sx={{ pt: 1 }}>
            <Alert severity="info">
              This view is audited. Use only for the approved external transfer.
            </Alert>
            {revealed ? (
              <KeyValue
                columns={1}
                entries={[
                  { label: 'Account name', value: revealed.destination.accountName },
                  {
                    label: 'Account or mobile number',
                    value: revealed.destination.accountIdentifier,
                  },
                  { label: 'Method', value: revealed.destination.method.replaceAll('_', ' ') },
                  { label: 'Provider', value: revealed.destination.provider },
                  { label: 'Amount', value: <Money cents={revealed.amountCents} /> },
                ]}
              />
            ) : null}
          </Stack>
        </DialogContent>
        <DialogActions>
          <Button
            onClick={() => {
              setRevealed(null);
              revealResult.reset();
            }}
          >
            Hide destination
          </Button>
        </DialogActions>
      </Dialog>
    </>
  );
}
