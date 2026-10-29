import { Alert, Box, Button, Card, CardContent, Chip, Stack, Typography } from '@mui/material';
import type { ReactNode } from 'react';
import { useParams } from 'react-router-dom';

import type {
  FoodSettlement,
  FoodSettlementAgreement,
  OwnerFoodScope,
  PayoutDestination,
  ShopFinanceBalance,
} from '@/api/dto/foodFinance';
import { useOwnerAuth } from '@/auth/useOwnerAuth';
import { KeyValue } from '@/components/KeyValue';
import { Money } from '@/components/Money';
import { ResourceTable } from '@/components/ResourceTable';
import { appConfig } from '@/config';
import { formatDateTime } from '@/lib/datetime';

export const FINANCE_TIMEZONE = 'Africa/Harare';
export const financeTime = (value?: string | null) => formatDateTime(value, FINANCE_TIMEZONE);

/** A page is mounted only for a branch in the current server-owned membership set. */
export function OwnerFinanceBoundary({
  children,
}: {
  children: (scope: OwnerFoodScope) => ReactNode;
}) {
  const { shopId = '' } = useParams();
  const { session, signingOut } = useOwnerAuth();
  const member = session?.memberships.some(
    (membership) =>
      membership.shopId === shopId &&
      membership.status === 'ACTIVE' &&
      (membership.role === 'OWNER' || membership.role === 'MANAGER'),
  );
  if (
    signingOut ||
    !appConfig.enableFoodSettlements ||
    !session?.capabilities.includes('settlements:read') ||
    !member
  )
    return <Alert severity="info">Earnings and settlements are unavailable for this branch.</Alert>;
  return children({ ownerId: session.owner.id, shopId });
}

export function FinanceBalanceSummary({ balance }: { balance: ShopFinanceBalance }) {
  const totals: Array<[string, number]> = [
    ['Gross food earnings', balance.grossCents],
    ['Commission', balance.commissionCents],
    ['Net earned', balance.earnedCents],
    ['Adjustments', balance.adjustmentCents],
    ['Net owed', balance.balanceCents],
    ['Payable', balance.availableCents],
    ...(balance.provisionalPendingCents === undefined
      ? []
      : [['Provisional online food credit', balance.provisionalPendingCents] as [string, number]]),
    ['Pending schedule', balance.pendingCents],
    ['Held earnings', balance.heldCents],
    ['Reserved in statements', balance.reservedCents],
    ['Paid', balance.paidCents],
    ['Disputed failed delivery food cost', balance.disputedCents],
    ['Carried forward', balance.carryForwardCents],
  ];
  return (
    <Box
      sx={{
        display: 'grid',
        gridTemplateColumns: { xs: '1fr 1fr', md: 'repeat(4, 1fr)' },
        gap: 1.5,
      }}
    >
      {totals.map(([label, cents]) => (
        <Card key={label} variant="outlined">
          <CardContent sx={{ '&:last-child': { pb: 2 } }}>
            <Typography variant="caption" color="text.secondary">
              {label}
            </Typography>
            <Typography component="p" variant="h6">
              <Money cents={cents} srLabel={label} />
            </Typography>
          </CardContent>
        </Card>
      ))}
    </Box>
  );
}

const weekdays = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
export function FinanceAgreementSummary({
  agreement,
  nextPayoutAt,
}: {
  agreement: FoodSettlementAgreement | null;
  nextPayoutAt?: string | null;
}) {
  if (!agreement)
    return (
      <Alert severity="info">
        Your settlement agreement has not been configured. Contact delivery operations before your
        first payout.
      </Alert>
    );
  const schedule =
    agreement.frequency === 'WEEKLY'
      ? `Weekly · ${weekdays[agreement.weeklyAnchor ?? -1] ?? 'anchor unavailable'}`
      : agreement.frequency === 'MONTHLY'
        ? 'Monthly · calendar month'
        : 'Daily';
  return (
    <Card variant="outlined">
      <CardContent>
        <Typography component="h2" variant="h6" sx={{ mb: 2 }}>
          Settlement agreement
        </Typography>
        {!agreement.enabled ? (
          <Alert severity="warning" sx={{ mb: 2 }}>
            Settlements are paused for this branch.
          </Alert>
        ) : null}
        <KeyValue
          entries={[
            { label: 'Schedule', value: schedule },
            {
              label: 'Period timezone and cutoff',
              value: `${agreement.timezone} · ${agreement.cutoffTime}`,
            },
            { label: 'Payout lag', value: `${agreement.payoutLagDays} days` },
            {
              label: 'Payout weekday',
              value:
                agreement.payoutWeekday === undefined
                  ? 'As agreed'
                  : weekdays[agreement.payoutWeekday],
            },
            { label: 'Payout day of month', value: agreement.payoutDay ?? 'As agreed' },
            {
              label: 'Eligibility policy',
              value:
                agreement.eligibilityPolicy === 'AFTER_REMITTANCE'
                  ? 'After rider remittance'
                  : 'On agreed schedule',
            },
            { label: 'Effective from', value: financeTime(agreement.effectiveFrom) },
            {
              label: 'Next agreed payout',
              value: nextPayoutAt ? financeTime(nextPayoutAt) : 'No payout date available',
            },
          ]}
        />
      </CardContent>
    </Card>
  );
}

export function maskedAccount(value?: string): string {
  if (!value) return 'Missing';
  return value.startsWith('••••') ? value : `••••${value.slice(-4)}`;
}
export function PayoutDestinationSummary({
  destination,
}: {
  destination: PayoutDestination | null;
}) {
  if (!destination)
    return (
      <Alert severity="warning">
        Payout details are missing. Supply them before your first manual payout.
      </Alert>
    );
  return (
    <KeyValue
      entries={[
        { label: 'Payout method', value: destination.method.replaceAll('_', ' ') },
        { label: 'Account name', value: destination.accountName },
        { label: 'Destination', value: maskedAccount(destination.accountIdentifier) },
        { label: 'Bank or provider', value: destination.provider ?? 'Not specified' },
        { label: 'Destination version', value: destination.version },
      ]}
    />
  );
}

export function CursorControls({
  pages,
  nextCursor,
  pending,
  onChange,
  label,
}: {
  pages: string[];
  nextCursor?: string | null;
  pending: boolean;
  onChange: (pages: string[]) => void;
  label: string;
}) {
  return (
    <Stack direction="row" sx={{ justifyContent: 'space-between', alignItems: 'center', gap: 1 }}>
      <Typography variant="body2">
        {label} · page {pages.length + 1}
      </Typography>
      <Stack direction="row" spacing={1}>
        <Button
          disabled={pending || pages.length === 0}
          onClick={() => onChange(pages.slice(0, -1))}
          aria-label={`Previous ${label.toLowerCase()} page`}
        >
          Previous
        </Button>
        <Button
          disabled={pending || !nextCursor}
          onClick={() => nextCursor && onChange([...pages, nextCursor])}
          aria-label={`Next ${label.toLowerCase()} page`}
        >
          Next
        </Button>
      </Stack>
    </Stack>
  );
}

export function downloadFinanceCsv(csv: string, fileName: string) {
  const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' }));
  const link = document.createElement('a');
  link.href = url;
  link.download = fileName;
  link.click();
  URL.revokeObjectURL(url);
}

/** Shared immutable statement view. Totals and membership come from the API. */
export function FoodStatementContent({ statement }: { statement: FoodSettlement }) {
  return (
    <Stack spacing={2}>
      <KeyValue
        entries={[
          { label: 'Statement', value: statement._id },
          { label: 'Branch', value: statement.shopId },
          { label: 'Status', value: <Chip size="small" label={statement.status} /> },
          {
            label: 'Period (start included, end excluded)',
            value: `${financeTime(statement.from)} – ${financeTime(statement.to)} · ${FINANCE_TIMEZONE}`,
          },
          { label: 'Scheduled payout', value: financeTime(statement.payoutAt) },
          { label: 'Gross food', value: <Money cents={statement.grossCents} /> },
          { label: 'Commission', value: <Money cents={statement.commissionCents} /> },
          { label: 'Adjustments', value: <Money cents={statement.adjustmentCents} /> },
          { label: 'Net payable', value: <Money cents={statement.amountCents} emphasis /> },
          { label: 'Brought forward', value: <Money cents={statement.broughtForwardCents} /> },
          { label: 'Held', value: <Money cents={statement.heldCents} /> },
          { label: 'Disputed food cost', value: <Money cents={statement.disputedCents} /> },
        ]}
      />
      <FinanceAgreementSummary
        agreement={statement.agreementSnapshot}
        nextPayoutAt={statement.payoutAt}
      />
      <Typography component="h2" variant="h6">
        Included orders and adjustments
      </Typography>
      <ResourceTable
        caption="Statement included orders and adjustments"
        rows={statement.lines}
        getRowId={(line) => line.sourceId}
        emptyTitle="No statement lines"
        columns={[
          {
            id: 'order',
            header: 'Order / source',
            render: (line) => (
              <Stack>
                <Typography variant="body2">
                  {line.orderReference ?? line.orderId ?? line.sourceId}
                </Typography>
                {line.carryForward ? <Chip size="small" label="Carried forward" /> : null}
              </Stack>
            ),
          },
          {
            id: 'date',
            header: 'Effective date (Harare)',
            render: (line) => financeTime(line.occurredAt),
          },
          {
            id: 'gross',
            header: 'Food',
            render: (line) => <Money cents={line.foodSubtotalCents} />,
            align: 'right',
          },
          {
            id: 'commission',
            header: 'Commission',
            render: (line) => <Money cents={line.commissionCents} />,
            align: 'right',
          },
          {
            id: 'adjustment',
            header: 'Adjustment',
            render: (line) => <Money cents={line.adjustmentCents} />,
            align: 'right',
          },
          {
            id: 'net',
            header: 'Net',
            render: (line) => <Money cents={line.netCents} />,
            align: 'right',
          },
          {
            id: 'policy',
            header: 'Commission snapshot',
            render: (line) =>
              line.commissionPolicySnapshot
                ? `${line.commissionPolicySnapshot.basisPoints} basis points · ${line.commissionPolicySnapshot.rounding} · v${line.commissionPolicySnapshot.version}`
                : 'Historical snapshot unavailable',
          },
        ]}
      />
      {statement.exceptions.length ? (
        <Alert severity="warning">
          Excluded or held entries:{' '}
          {statement.exceptions.map((entry) => `${entry.orderId}: ${entry.reason}`).join('; ')}
        </Alert>
      ) : null}
      {statement.failureExceptions.length ? (
        <Alert severity="warning">
          Failed delivery food costs remain disputed separately from delivered earnings:{' '}
          {statement.failureExceptions
            .map((entry) => `${entry.reference}: ${entry.reason}`)
            .join('; ')}
        </Alert>
      ) : null}
      <Typography component="h2" variant="h6">
        Frozen payout destination
      </Typography>
      <PayoutDestinationSummary destination={statement.destinationSnapshot} />
      <Typography variant="body2" color="text.secondary">
        Later payout-detail changes do not alter this statement’s destination.
      </Typography>
      {statement.payment ? (
        <KeyValue
          entries={[
            { label: 'Payment amount', value: <Money cents={statement.payment.amountCents} /> },
            {
              label: 'External payment method',
              value: statement.payment.method.replaceAll('_', ' '),
            },
            { label: 'Paid date (Harare)', value: financeTime(statement.payment.paidAt) },
            { label: 'External reference', value: statement.payment.reference },
            { label: 'Destination version paid', value: statement.payment.destinationVersion },
          ]}
        />
      ) : (
        <Alert severity="info">No external payment has been recorded for this statement.</Alert>
      )}
      <Typography component="h2" variant="h6">
        Audit detail
      </Typography>
      <KeyValue
        entries={[
          { label: 'Statement version', value: statement.version },
          { label: 'Agreement version', value: statement.agreementSnapshot.version },
          {
            label: 'Generated by',
            value: `${statement.recordedBy.label ?? statement.recordedBy.id} · ${statement.recordedBy.type}`,
          },
          { label: 'Generated at', value: financeTime(statement.createdAt) },
          {
            label: 'Approved by',
            value: statement.approvedBy
              ? `${statement.approvedBy.label ?? statement.approvedBy.id} · ${statement.approvedBy.type}`
              : 'Not approved',
          },
          { label: 'Approved at', value: financeTime(statement.approvedAt) },
          {
            label: 'Voided by',
            value: statement.voidedBy
              ? `${statement.voidedBy.label ?? statement.voidedBy.id} · ${statement.voidedBy.type}`
              : 'Not voided',
          },
          { label: 'Voided at', value: financeTime(statement.voidedAt) },
          { label: 'Void reason', value: statement.voidReason ?? '—' },
          {
            label: 'Payment recorded by',
            value: statement.payment
              ? `${statement.payment.recordedBy.label ?? statement.payment.recordedBy.id} · ${statement.payment.recordedBy.type}`
              : 'No payment recorded',
          },
        ]}
      />
    </Stack>
  );
}
