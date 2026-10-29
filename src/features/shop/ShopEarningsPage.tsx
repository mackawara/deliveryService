import { Alert, Button, Chip, MenuItem, Stack, TextField, Typography } from '@mui/material';
import { useEffect, useRef, useState } from 'react';
import { Link as RouterLink } from 'react-router-dom';

import type { FoodSettlementStatus, OwnerFoodScope } from '@/api/dto/foodFinance';
import {
  useGetShopFoodEarningsQuery,
  useLazyExportShopFoodEarningsQuery,
  useListShopFoodSettlementsQuery,
} from '@/api/endpoints/foodFinance';
import type { NormalizedApiError } from '@/api/errors';
import { ApiError } from '@/components/ApiError';
import { Money } from '@/components/Money';
import { PageHeader } from '@/components/PageHeader';
import { ResourceTable } from '@/components/ResourceTable';
import {
  CursorControls,
  downloadFinanceCsv,
  FinanceAgreementSummary,
  FinanceBalanceSummary,
  financeTime,
  OwnerFinanceBoundary,
} from './foodFinanceView';

const protectsData = (error: unknown) =>
  ['forbidden', 'unauthenticated', 'notFound'].includes(
    (error as NormalizedApiError | undefined)?.kind ?? '',
  );

/** The API uses half-open local periods. Harare is UTC+02 with no daylight saving. */
export function hararePeriodInput(value: string): string | undefined {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return undefined;
  const instant = new Date(`${value}T00:00:00+02:00`);
  if (!Number.isFinite(instant.getTime())) return undefined;
  const local = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Africa/Harare',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(instant);
  return local === value ? instant.toISOString() : undefined;
}

export function ShopEarningsPage() {
  return (
    <OwnerFinanceBoundary>
      {(scope) => <ShopEarnings key={`${scope.ownerId}:${scope.shopId}`} scope={scope} />}
    </OwnerFinanceBoundary>
  );
}

function ShopEarnings({ scope }: { scope: OwnerFoodScope }) {
  const active = useRef(true);
  useEffect(() => {
    active.current = true;
    return () => {
      active.current = false;
    };
  }, []);
  const [pages, setPages] = useState<string[]>([]);
  const [statementPages, setStatementPages] = useState<string[]>([]);
  const [status, setStatus] = useState<FoodSettlementStatus | ''>('');
  const [start, setStart] = useState('');
  const [end, setEnd] = useState('');
  const [period, setPeriod] = useState<{ periodStart?: string; periodEnd?: string }>({});
  const [periodError, setPeriodError] = useState('');
  const earnings = useGetShopFoodEarningsQuery(
    { ...scope, cursor: pages.at(-1), limit: 25 },
    { refetchOnFocus: true, refetchOnReconnect: true },
  );
  const statements = useListShopFoodSettlementsQuery(
    { ...scope, cursor: statementPages.at(-1), limit: 25, status: status || undefined, ...period },
    { refetchOnFocus: true, refetchOnReconnect: true },
  );
  const [exportPage, exportState] = useLazyExportShopFoodEarningsQuery();
  const [exportError, setExportError] = useState<NormalizedApiError>();
  const data = protectsData(earnings.error) ? undefined : earnings.currentData;
  const statementData = protectsData(statements.error) ? undefined : statements.currentData;

  function applyPeriod() {
    const periodStart = start ? hararePeriodInput(start) : undefined;
    const periodEnd = end ? hararePeriodInput(end) : undefined;
    if (
      (start && !periodStart) ||
      (end && !periodEnd) ||
      (periodStart && periodEnd && periodStart >= periodEnd)
    ) {
      setPeriodError('Choose a valid start and a later exclusive end date.');
      return;
    }
    setPeriodError('');
    setStatementPages([]);
    setPeriod({ periodStart, periodEnd });
  }

  async function exportEarningsPage() {
    setExportError(undefined);
    try {
      const result = await exportPage({ ...scope, cursor: pages.at(-1), limit: 25 }).unwrap();
      if (active.current)
        downloadFinanceCsv(result.csv, `${scope.shopId}-earnings-page-${pages.length + 1}.csv`);
    } catch (caught) {
      if (active.current) setExportError(caught as NormalizedApiError);
    }
  }

  return (
    <Stack spacing={3}>
      <PageHeader
        title="Earnings"
        description="Food earnings, provisional online credits and manual payouts for the selected branch. All amounts are USD and are calculated by the delivery service."
        actions={
          <>
            <Button
              component={RouterLink}
              to={`/shop/${scope.shopId}/payout-details`}
              variant="outlined"
            >
              Payout details
            </Button>
            <Button
              onClick={() => {
                void earnings.refetch();
                void statements.refetch();
              }}
              disabled={earnings.isFetching || statements.isFetching}
            >
              Refresh
            </Button>
          </>
        }
      />
      {earnings.error ? (
        <ApiError
          error={earnings.error as NormalizedApiError}
          onRetry={() => void earnings.refetch()}
        />
      ) : null}
      {data ? (
        <>
          <Typography variant="body2" color="text.secondary">
            Branch {scope.shopId} · last refreshed {financeTime(data.serverNow)} · Africa/Harare
          </Typography>
          <FinanceBalanceSummary balance={data.balance} />
          {(data.balance.paidOnlineLiabilityCents ?? 0) > 0 ? (
            <Alert severity="warning">
              Previously paid shop proceeds include{' '}
              <Money cents={data.balance.paidOnlineLiabilityCents!} /> linked to an online payment
              hold or refund. Finance review is required; the previous payout remains recorded and
              the shop has not been automatically debited.
            </Alert>
          ) : null}
          {data.balance.paymentExceptions?.length ? (
            <Alert severity="warning">
              Online collection exceptions:{' '}
              {data.balance.paymentExceptions
                .map(
                  (entry) =>
                    `${entry.orderId}: ${entry.reason}${entry.alreadyPaid ? ' (previous shop payout recorded)' : ''}`,
                )
                .join('; ')}
            </Alert>
          ) : null}
          {data.balance.provisionalPendingCents !== undefined ? (
            <Alert severity="info">
              Confirmed online collections are provisional until fulfillment and settlement checks
              pass. Held or refunded orders are not available for settlement. Customer collections
              include delivery; branch credit is net food only, with no second delivery deduction.
            </Alert>
          ) : null}
          <Typography variant="body2" color="text.secondary">
            Totals cover the branch’s complete ledger, including prior pilot payments. Paging and
            statement filters do not change these totals. Held failed-delivery food costs are shown
            separately from confirmed earnings.
          </Typography>
          <FinanceAgreementSummary
            agreement={data.agreement}
            nextPayoutAt={data.balance.nextPayoutAt}
          />
          {data.balance.exceptions.length ? (
            <Alert severity="warning">
              Items need review:{' '}
              {data.balance.exceptions
                .map((entry) => `${entry.orderId}: ${entry.reason}`)
                .join('; ')}
            </Alert>
          ) : null}
          {data.balance.failureExceptions.length ? (
            <Alert severity="warning">
              Disputed failed-delivery food costs:{' '}
              {data.balance.failureExceptions
                .map(
                  (entry) =>
                    `${entry.reference}: ${entry.reason}${entry.review ? ` (${entry.review.decision}: ${entry.review.reason})` : ''}`,
                )
                .join('; ')}
              . Contact delivery operations for review.
            </Alert>
          ) : null}
        </>
      ) : null}
      <Stack
        direction={{ xs: 'column', sm: 'row' }}
        sx={{ justifyContent: 'space-between', gap: 1 }}
      >
        <Typography component="h2" variant="h6">
          Earnings and payment ledger
        </Typography>
        <Button
          onClick={() => void exportEarningsPage()}
          disabled={!data || exportState.isFetching}
        >
          Export this ledger page
        </Button>
      </Stack>
      <ApiError error={exportError} />
      <ResourceTable
        caption="Branch earnings and payment ledger"
        rows={data?.items ?? []}
        getRowId={(entry) => entry._id}
        isLoading={earnings.isLoading || (!data && earnings.isFetching)}
        isFetching={earnings.isFetching}
        error={earnings.error as NormalizedApiError | undefined}
        onRetry={() => void earnings.refetch()}
        emptyTitle="No earnings or payouts yet"
        emptyDescription="Delivered order earnings and recorded manual payments will appear here."
        columns={[
          {
            id: 'order',
            header: 'Order / source',
            render: (entry) => (
              <Stack>
                <Typography variant="body2">
                  {entry.orderId ?? entry.payoutId ?? entry.sourceKey}
                </Typography>
                {entry.sourceKey.startsWith('legacy:') ? (
                  <Chip size="small" label="Pilot history" />
                ) : null}
              </Stack>
            ),
          },
          {
            id: 'type',
            header: 'Entry',
            render: (entry) =>
              entry.entryType === 'PROVISIONAL_CREDIT'
                ? 'Provisional online food credit'
                : entry.entryType,
          },
          {
            id: 'amount',
            header: 'Signed USD amount',
            render: (entry) => <Money cents={entry.amountCents} />,
            align: 'right',
          },
          {
            id: 'status',
            header: 'Eligibility',
            render: (entry) => (
              <Chip
                size="small"
                label={
                  entry.provisionalCreditStatus === 'PENDING'
                    ? 'Provisional online credit'
                    : entry.provisionalCreditStatus === 'HELD'
                      ? 'Held online credit'
                      : entry.provisionalCreditStatus === 'REVERSED'
                        ? 'Online credit reversed'
                        : (entry.eligibility ?? 'UNKNOWN')
                }
              />
            ),
          },
          {
            id: 'reason',
            header: 'Hold / adjustment reason',
            render: (entry) => entry.holdReason ?? entry.reason ?? '—',
          },
          {
            id: 'date',
            header: 'Effective date (Harare)',
            render: (entry) => financeTime(entry.effectiveAt ?? entry.occurredAt),
          },
          {
            id: 'commission',
            header: 'Commission snapshot',
            render: (entry) =>
              entry.commissionPolicySnapshot
                ? `${entry.commissionPolicySnapshot.basisPoints} basis points · ${entry.commissionPolicySnapshot.rounding} · v${entry.commissionPolicySnapshot.version}`
                : '—',
          },
          {
            id: 'statement',
            header: 'Statement',
            render: (entry) =>
              entry.settlementId ? (
                <Button
                  component={RouterLink}
                  to={`/shop/${scope.shopId}/settlements/${entry.settlementId}`}
                  size="small"
                >
                  View statement
                </Button>
              ) : (
                '—'
              ),
          },
        ]}
      />
      <CursorControls
        label="Ledger"
        pages={pages}
        onChange={setPages}
        nextCursor={data?.nextCursor}
        pending={earnings.isFetching}
      />
      <Typography component="h2" variant="h6">
        Settlement statements
      </Typography>
      <Stack
        direction={{ xs: 'column', sm: 'row' }}
        spacing={1.5}
        sx={{ alignItems: { sm: 'flex-end' } }}
      >
        <TextField
          label="Statement status"
          select
          value={status}
          onChange={(event) => {
            setStatus(event.target.value as FoodSettlementStatus | '');
            setStatementPages([]);
          }}
          sx={{ minWidth: 160 }}
        >
          <MenuItem value="">All statuses</MenuItem>
          {(['DRAFT', 'APPROVED', 'PAID', 'VOID'] as const).map((item) => (
            <MenuItem value={item} key={item}>
              {item}
            </MenuItem>
          ))}
        </TextField>
        <TextField
          label="Period starts on or after (Harare)"
          type="date"
          value={start}
          onChange={(event) => setStart(event.target.value)}
          slotProps={{ inputLabel: { shrink: true } }}
        />
        <TextField
          label="Period ends by (exclusive, Harare)"
          type="date"
          value={end}
          onChange={(event) => setEnd(event.target.value)}
          slotProps={{ inputLabel: { shrink: true } }}
        />
        <Button onClick={applyPeriod}>Apply dates</Button>
      </Stack>
      {periodError ? <Alert severity="warning">{periodError}</Alert> : null}
      {statements.error ? (
        <ApiError
          error={statements.error as NormalizedApiError}
          onRetry={() => void statements.refetch()}
        />
      ) : null}
      <ResourceTable
        caption="Branch settlement statements"
        rows={statementData?.items ?? []}
        getRowId={(statement) => statement._id}
        isLoading={statements.isLoading || (!statementData && statements.isFetching)}
        isFetching={statements.isFetching}
        error={statements.error as NormalizedApiError | undefined}
        onRetry={() => void statements.refetch()}
        emptyTitle="No settlement statements"
        columns={[
          {
            id: 'statement',
            header: 'Statement',
            render: (statement) => (
              <Button
                component={RouterLink}
                to={`/shop/${scope.shopId}/settlements/${statement._id}`}
                size="small"
              >
                {statement._id}
              </Button>
            ),
          },
          {
            id: 'period',
            header: 'Period (Harare)',
            render: (statement) => `${financeTime(statement.from)} – ${financeTime(statement.to)}`,
          },
          {
            id: 'status',
            header: 'Status',
            render: (statement) => <Chip size="small" label={statement.status} />,
          },
          {
            id: 'amount',
            header: 'Net USD',
            render: (statement) => <Money cents={statement.amountCents} />,
            align: 'right',
          },
          {
            id: 'paid',
            header: 'External reference',
            render: (statement) => statement.payment?.reference ?? 'Not paid',
          },
        ]}
      />
      <CursorControls
        label="Statements"
        pages={statementPages}
        onChange={setStatementPages}
        nextCursor={statementData?.nextCursor}
        pending={statements.isFetching}
      />
    </Stack>
  );
}
