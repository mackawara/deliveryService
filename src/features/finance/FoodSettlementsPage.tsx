import {
  Alert,
  Button,
  Card,
  CardContent,
  Chip,
  MenuItem,
  Stack,
  TextField,
  Typography,
} from '@mui/material';
import { useState } from 'react';
import { Link as RouterLink, useNavigate } from 'react-router-dom';

import type {
  FoodSettlement,
  FoodSettlementStatus,
  ShopFinanceBalance,
} from '@/api/dto/foodFinance';
import {
  useCreateFoodSettlementMutation,
  useGetFoodShopAgreementQuery,
  useGetFoodShopPayoutDetailsQuery,
  useListFoodSettlementsQuery,
  useListFoodShopBalancesQuery,
} from '@/api/endpoints/foodFinance';
import type { NormalizedApiError } from '@/api/errors';
import { fieldErrorMap } from '@/api/errors';
import { POLLING, polled } from '@/api/polling';
import { useStaffSession } from '@/auth/useAuth';
import { ApiError } from '@/components/ApiError';
import { FormDialog } from '@/components/FormDialog';
import { Money } from '@/components/Money';
import { PageHeader } from '@/components/PageHeader';
import { ResourceTable, type Column } from '@/components/ResourceTable';
import {
  CursorControls,
  FinanceAgreementSummary,
  FinanceBalanceSummary,
  PayoutDestinationSummary,
  financeTime,
} from '@/features/shop/foodFinanceView';
import { canUseFoodSettlements, foodFinanceScopeKey } from '@/lib/foodSettlementAccess';
import { canAccessTown } from '@/lib/permissions';
import { useFinancialAction } from '@/lib/useFinancialAction';
import { hararePeriodInstant } from '@/features/finance/foodFinanceTime';

interface DraftCommand {
  shopId: string;
  expectedVersion: number;
  from: string;
  to: string;
  agreementId: string;
}

/** The key remount discards forms and cursor state when staff identity/scope changes. */
export function FoodSettlementsPage() {
  const session = useStaffSession();
  if (!canUseFoodSettlements(session))
    return <Alert severity="info">Shop settlements are unavailable for this account.</Alert>;
  return <FoodSettlementsWorkspace key={foodFinanceScopeKey(session)} />;
}

function FoodSettlementsWorkspace() {
  const session = useStaffSession();
  const scopeKey = foodFinanceScopeKey(session);
  const navigate = useNavigate();
  const [townId, setTownId] = useState('');
  const [shopId, setShopId] = useState('');
  const [status, setStatus] = useState<FoodSettlementStatus | ''>('');
  const [balancePages, setBalancePages] = useState<string[]>([]);
  const [statementPages, setStatementPages] = useState<string[]>([]);
  const [draftShop, setDraftShop] = useState<ShopFinanceBalance | null>(null);
  const [fromDate, setFromDate] = useState('');
  const [toDate, setToDate] = useState('');
  const [draftOpen, setDraftOpen] = useState(false);

  const balances = useListFoodShopBalancesQuery(
    { scopeKey, townId: townId || undefined, cursor: balancePages.at(-1), limit: 25 },
    polled(POLLING.finance),
  );
  const statements = useListFoodSettlementsQuery(
    {
      scopeKey,
      townId: townId || undefined,
      shopId: shopId || undefined,
      status: status || undefined,
      cursor: statementPages.at(-1),
      limit: 25,
    },
    polled(POLLING.finance),
  );
  const agreement = useGetFoodShopAgreementQuery(
    { scopeKey, shopId: draftShop?.shopId ?? '' },
    { skip: !draftShop || !draftOpen },
  );
  const payout = useGetFoodShopPayoutDetailsQuery(
    { scopeKey, shopId: draftShop?.shopId ?? '' },
    { skip: !draftShop || !draftOpen },
  );
  const [createDraft] = useCreateFoodSettlementMutation();
  const balancesDenied = ['forbidden', 'unauthenticated'].includes(
    (balances.error as NormalizedApiError | undefined)?.kind ?? '',
  );
  const statementsDenied = ['forbidden', 'unauthenticated'].includes(
    (statements.error as NormalizedApiError | undefined)?.kind ?? '',
  );
  const draftDenied =
    balancesDenied ||
    [agreement.error, payout.error].some((error) =>
      ['forbidden', 'unauthenticated'].includes(
        (error as NormalizedApiError | undefined)?.kind ?? '',
      ),
    );
  const ready = !!balances.currentData && !balances.error;
  const draft = useFinancialAction<DraftCommand, FoodSettlement>({
    scopeKey,
    allowUnconfirmedRetry: true,
    run: (command, idempotencyKey) =>
      createDraft({ ...command, scopeKey, idempotencyKey }).unwrap(),
    refresh: () => {
      void balances.refetch();
      void statements.refetch();
      if (draftShop) {
        void agreement.refetch();
        void payout.refetch();
      }
    },
    successMessage: 'Draft statement generated. Review it before approval.',
    onSuccess: (statement) => {
      setDraftOpen(false);
      navigate(`/finance/food-settlements/${statement._id}`);
    },
  });
  const fields = fieldErrorMap(draft.error);
  const from = hararePeriodInstant(fromDate);
  const to = hararePeriodInstant(toDate);
  const validPeriod = !!from && !!to && from < to;
  const draftAllowed =
    ready &&
    !!draftShop &&
    canUseFoodSettlements(session, 'food.settlements.create', draftShop.townId) &&
    !!agreement.currentData?.agreement?.enabled &&
    !!payout.currentData?.payoutDetails &&
    !agreement.error &&
    !payout.error &&
    !agreement.isFetching &&
    !payout.isFetching;
  const selectedAgreement = agreement.currentData?.agreement;

  const balanceColumns: Column<ShopFinanceBalance>[] = [
    {
      id: 'shop',
      header: 'Branch',
      render: (row) => (
        <Button
          size="small"
          onClick={() => {
            setShopId(row.shopId);
            setStatementPages([]);
          }}
        >
          {row.shopId}
        </Button>
      ),
    },
    {
      id: 'town',
      header: 'Town',
      render: (row) =>
        session?.townAccess.towns.find((town) => town.id === row.townId)?.name ?? row.townId,
    },
    {
      id: 'balance',
      header: 'Net owed',
      align: 'right',
      render: (row) => <Money cents={row.balanceCents} />,
    },
    {
      id: 'available',
      header: 'Payable',
      align: 'right',
      render: (row) => <Money cents={row.availableCents} />,
    },
    {
      id: 'held',
      header: 'Held',
      align: 'right',
      render: (row) => <Money cents={row.heldCents} />,
    },
    {
      id: 'pending',
      header: 'Pending schedule',
      align: 'right',
      render: (row) => <Money cents={row.pendingCents} />,
    },
    {
      id: 'reserved',
      header: 'Reserved',
      align: 'right',
      render: (row) => <Money cents={row.reservedCents} />,
    },
    {
      id: 'paid',
      header: 'Paid',
      align: 'right',
      render: (row) => <Money cents={row.paidCents} />,
    },
    {
      id: 'due',
      header: 'Next payout (Harare)',
      render: (row) => (row.nextPayoutAt ? financeTime(row.nextPayoutAt) : 'Agreement required'),
    },
    {
      id: 'actions',
      header: 'Actions',
      render: (row) =>
        ready && canUseFoodSettlements(session, 'food.settlements.create', row.townId) ? (
          <Button
            size="small"
            variant="outlined"
            disabled={draft.pending || !!draft.unconfirmed}
            onClick={() => {
              draft.reset();
              setDraftShop(row);
              setFromDate('');
              setToDate('');
              setDraftOpen(true);
            }}
          >
            Generate draft
          </Button>
        ) : null,
    },
  ];
  const statementColumns: Column<FoodSettlement>[] = [
    {
      id: 'id',
      header: 'Statement',
      render: (row) => (
        <Button component={RouterLink} to={`/finance/food-settlements/${row._id}`} size="small">
          {row._id}
        </Button>
      ),
    },
    { id: 'branch', header: 'Branch', render: (row) => row.shopId },
    {
      id: 'period',
      header: 'Period (Harare)',
      render: (row) => `${financeTime(row.from)} – ${financeTime(row.to)}`,
    },
    { id: 'status', header: 'Status', render: (row) => <Chip label={row.status} size="small" /> },
    {
      id: 'amount',
      header: 'Net',
      align: 'right',
      render: (row) => <Money cents={row.amountCents} />,
    },
    { id: 'due', header: 'Scheduled payout', render: (row) => financeTime(row.payoutAt) },
    {
      id: 'reference',
      header: 'External payment reference',
      render: (row) => row.payment?.reference ?? 'Not paid',
    },
  ];

  return (
    <>
      <PageHeader
        title="Shop settlements"
        description="Review branch earnings, approve statements and record payments made outside the platform."
        crumbs={[{ label: 'Finance' }, { label: 'Shop settlements' }]}
        actions={
          <Button
            onClick={() => {
              void balances.refetch();
              void statements.refetch();
            }}
          >
            Refresh
          </Button>
        }
      />
      <Stack spacing={3}>
        <Alert severity="info">
          Payments are made externally. Generating a draft reserves eligible entries; approval
          freezes the statement. Record a payment only after completing the external transfer.
        </Alert>
        <Stack direction={{ xs: 'column', sm: 'row' }} spacing={2}>
          <TextField
            select
            label="Town"
            value={townId}
            onChange={(event) => {
              setTownId(event.target.value);
              setShopId('');
              setBalancePages([]);
              setStatementPages([]);
            }}
            sx={{ minWidth: 210 }}
          >
            <MenuItem value="">All authorized towns</MenuItem>
            {session?.townAccess.towns.map((town) => (
              <MenuItem key={town.id} value={town.id}>
                {town.name}
              </MenuItem>
            ))}
          </TextField>
          <TextField
            label="Filter branch"
            value={shopId}
            onChange={(event) => {
              setShopId(event.target.value);
              setStatementPages([]);
            }}
            helperText="Select a branch in the balances table, or enter its reference."
          />
          <TextField
            select
            label="Statement status"
            value={status}
            onChange={(event) => {
              setStatus(event.target.value as typeof status);
              setStatementPages([]);
            }}
            sx={{ minWidth: 180 }}
          >
            <MenuItem value="">All statuses</MenuItem>
            {(['DRAFT', 'APPROVED', 'PAID', 'VOID'] as const).map((value) => (
              <MenuItem key={value} value={value}>
                {value}
              </MenuItem>
            ))}
          </TextField>
        </Stack>
        <Typography component="h2" variant="h6">
          Branch balances
        </Typography>
        <ResourceTable
          caption="Shop balances"
          columns={balanceColumns}
          rows={
            balancesDenied
              ? []
              : (balances.currentData?.items.filter((row) => canAccessTown(session, row.townId)) ??
                [])
          }
          getRowId={(row) => row.shopId}
          isLoading={balances.isLoading}
          isFetching={balances.isFetching}
          error={balances.error as NormalizedApiError | undefined}
          onRetry={() => void balances.refetch()}
          emptyTitle="No shop balances"
          emptyDescription="Balances appear for branches within your town scope."
        />
        <CursorControls
          label="Balances"
          pages={balancePages}
          nextCursor={balances.currentData?.nextCursor}
          pending={balances.isFetching}
          onChange={setBalancePages}
        />
        {draft.unconfirmed && !draftOpen ? (
          <Alert
            severity="warning"
            action={<Button onClick={() => setDraftOpen(true)}>Review request</Button>}
          >
            A draft-generation outcome is unconfirmed. Resolve the original request before creating
            another statement.
          </Alert>
        ) : null}
        <Typography component="h2" variant="h6">
          Statements
        </Typography>
        <ResourceTable
          caption="Food settlement statements"
          columns={statementColumns}
          rows={
            statementsDenied
              ? []
              : (statements.currentData?.items.filter((row) =>
                  canAccessTown(session, row.townId),
                ) ?? [])
          }
          getRowId={(row) => row._id}
          isLoading={statements.isLoading}
          isFetching={statements.isFetching}
          error={statements.error as NormalizedApiError | undefined}
          onRetry={() => void statements.refetch()}
          emptyTitle="No statements"
          emptyDescription="Generate a completed period for a branch to begin review."
        />
        <CursorControls
          label="Statements"
          pages={statementPages}
          nextCursor={statements.currentData?.nextCursor}
          pending={statements.isFetching}
          onChange={setStatementPages}
        />
      </Stack>
      <FormDialog
        open={draftOpen && !draftDenied}
        title="Generate a period statement"
        description="Dates are local midnight in Africa/Harare. The end date is excluded. The server applies the agreed period and includes eligible carry-forward entries once."
        submitLabel="Generate draft"
        pending={draft.pending}
        error={draft.error}
        unconfirmed={draft.unconfirmed}
        onRetryUnconfirmed={() => void draft.retryUnconfirmed()}
        onClose={() => setDraftOpen(false)}
        disabled={!draftAllowed || !validPeriod}
        maxWidth="md"
        onSubmit={() => {
          if (!draftAllowed || !draftShop || !selectedAgreement || !from || !to || !validPeriod)
            return;
          void draft.submit({
            shopId: draftShop.shopId,
            expectedVersion: agreement.currentData!.shopVersion,
            agreementId: selectedAgreement._id,
            from,
            to,
          });
        }}
      >
        {draftShop ? (
          <>
            <Typography variant="subtitle1">Branch {draftShop.shopId}</Typography>
            <FinanceBalanceSummary balance={draftShop} />
          </>
        ) : null}
        <ApiError
          error={agreement.error as NormalizedApiError | undefined}
          onRetry={() => void agreement.refetch()}
        />
        <ApiError
          error={payout.error as NormalizedApiError | undefined}
          onRetry={() => void payout.refetch()}
        />
        {agreement.currentData ? (
          <FinanceAgreementSummary
            agreement={agreement.currentData.agreement}
            nextPayoutAt={draftShop?.nextPayoutAt}
          />
        ) : (
          <Typography>Loading settlement agreement…</Typography>
        )}
        {payout.currentData ? (
          <Card variant="outlined">
            <CardContent>
              <PayoutDestinationSummary destination={payout.currentData.payoutDetails} />
            </CardContent>
          </Card>
        ) : null}
        <Stack direction={{ xs: 'column', sm: 'row' }} spacing={2}>
          <TextField
            type="date"
            label="Period start"
            value={fromDate}
            onChange={(event) => setFromDate(event.target.value)}
            required
            fullWidth
            slotProps={{ inputLabel: { shrink: true } }}
            error={!!fields.from}
            helperText={fields.from ?? 'Included · Africa/Harare'}
          />
          <TextField
            type="date"
            label="Period end"
            value={toDate}
            onChange={(event) => setToDate(event.target.value)}
            required
            fullWidth
            slotProps={{ inputLabel: { shrink: true } }}
            error={!!fields.to || (!!from && !!to && from >= to)}
            helperText={fields.to ?? 'Excluded · Africa/Harare'}
          />
        </Stack>
        <Alert severity="info">
          The balances above cover all history. The generated draft provides the authoritative order
          list and period calculation for review before approval.
        </Alert>
        {draftShop?.exceptions.length ? (
          <Alert severity="warning">
            Current exclusions:{' '}
            {draftShop.exceptions
              .map((exception) => `${exception.orderId}: ${exception.reason}`)
              .join('; ')}
          </Alert>
        ) : null}
        {draft.error?.kind === 'conflict' ? (
          <Alert severity="warning">
            Your dates have been retained. The latest branch agreement and destination are
            refreshed; review them before deliberately generating again.
          </Alert>
        ) : null}
      </FormDialog>
    </>
  );
}
