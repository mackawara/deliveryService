import {
  Alert,
  Button,
  Card,
  CardContent,
  Checkbox,
  FormControlLabel,
  MenuItem,
  Stack,
  TextField,
  Typography,
} from '@mui/material';
import { useState } from 'react';
import { Link as RouterLink } from 'react-router-dom';

import type { OwnerFoodScope, PayoutDestination, ShopPayoutMethod } from '@/api/dto/foodFinance';
import {
  useGetShopPayoutDetailsQuery,
  useUpdateShopPayoutDetailsMutation,
} from '@/api/endpoints/foodFinance';
import { fieldErrorMap, type NormalizedApiError } from '@/api/errors';
import { useOwnerAuth } from '@/auth/useOwnerAuth';
import { ApiError } from '@/components/ApiError';
import { FormDialog } from '@/components/FormDialog';
import { PageHeader } from '@/components/PageHeader';
import { ReasonField } from '@/components/ReasonField';
import { useFinancialAction } from '@/lib/useFinancialAction';
import { OwnerFinanceBoundary, PayoutDestinationSummary } from './foodFinanceView';

export interface PayoutDetailsDraft {
  method: ShopPayoutMethod;
  accountName: string;
  accountIdentifier: string;
  provider: string;
  reason: string;
}

/** Validate the documented destination schema; the API remains authoritative. */
export function validPayoutDetails(draft: PayoutDetailsDraft): boolean {
  return (
    ['CASH', 'BANK_TRANSFER', 'ECOCASH'].includes(draft.method) &&
    draft.accountName.trim().length >= 1 &&
    draft.accountName.length <= 120 &&
    draft.accountIdentifier.trim().length >= 1 &&
    draft.accountIdentifier.length <= 120 &&
    !draft.accountIdentifier.includes('••••') &&
    draft.provider.length <= 120 &&
    draft.reason.trim().length >= 3 &&
    draft.reason.length <= 500
  );
}

export function ShopPayoutDetailsPage() {
  return (
    <OwnerFinanceBoundary>
      {(scope) => <ShopPayoutDetails key={`${scope.ownerId}:${scope.shopId}`} scope={scope} />}
    </OwnerFinanceBoundary>
  );
}

function ShopPayoutDetails({ scope }: { scope: OwnerFoodScope }) {
  const { session } = useOwnerAuth();
  const query = useGetShopPayoutDetailsQuery(scope, {
    refetchOnFocus: true,
    refetchOnReconnect: true,
  });
  const [editing, setEditing] = useState(false);
  const [saved, setSaved] = useState(false);
  const forbidden = ['forbidden', 'unauthenticated', 'notFound'].includes(
    (query.error as NormalizedApiError | undefined)?.kind ?? '',
  );
  const data = forbidden ? undefined : query.currentData;
  const canEdit = session?.capabilities.includes('payout-details:manage') && !!data && !query.error;

  return (
    <Stack spacing={2}>
      <PageHeader
        title="Payout details"
        description="The destination for manual shop payouts. Delivery staff pay outside this platform and record the payment afterward."
        actions={
          <Button component={RouterLink} to={`/shop/${scope.shopId}/earnings`}>
            Back to earnings
          </Button>
        }
      />
      {saved ? (
        <Alert severity="success">
          Payout details saved by the delivery service. Existing statements keep their frozen
          destination.
        </Alert>
      ) : null}
      {query.error ? (
        <ApiError error={query.error as NormalizedApiError} onRetry={() => void query.refetch()} />
      ) : null}
      {!data && query.isFetching ? (
        <Typography role="status">Loading payout details…</Typography>
      ) : null}
      {data ? (
        <Card variant="outlined">
          <CardContent>
            <Stack spacing={2}>
              <Typography component="h2" variant="h6">
                Current destination
              </Typography>
              <PayoutDestinationSummary destination={data.payoutDetails} />
              <Typography variant="body2" color="text.secondary">
                Account identifiers are masked. To change a destination, enter the complete new
                details; the existing identifier is never copied into the form.
              </Typography>
              {canEdit ? (
                <Button
                  variant="contained"
                  onClick={() => {
                    setSaved(false);
                    setEditing(true);
                  }}
                >
                  {data.payoutDetails ? 'Change payout details' : 'Add payout details'}
                </Button>
              ) : null}
              <Button onClick={() => void query.refetch()} disabled={query.isFetching}>
                Refresh destination
              </Button>
            </Stack>
          </CardContent>
        </Card>
      ) : null}
      {data && session?.capabilities.includes('payout-details:manage') ? (
        <PayoutDetailsEditor
          open={editing}
          scope={scope}
          destination={data.payoutDetails}
          shopVersion={data.shopVersion}
          refreshing={query.isFetching || !!query.error}
          refresh={() => void query.refetch()}
          onOpen={() => setEditing(true)}
          onClose={() => setEditing(false)}
          onSaved={() => {
            setEditing(false);
            setSaved(true);
            void query.refetch();
          }}
        />
      ) : null}
    </Stack>
  );
}

function PayoutDetailsEditor({
  open,
  scope,
  destination,
  shopVersion,
  refreshing,
  refresh,
  onOpen,
  onClose,
  onSaved,
}: {
  open: boolean;
  scope: OwnerFoodScope;
  destination: PayoutDestination | null;
  shopVersion: number;
  refreshing: boolean;
  refresh: () => void;
  onOpen: () => void;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [draft, setDraft] = useState<PayoutDetailsDraft>({
    method: destination?.method ?? 'ECOCASH',
    accountName: destination?.accountName ?? '',
    accountIdentifier: '',
    provider: destination?.provider ?? '',
    reason: '',
  });
  const [confirmed, setConfirmed] = useState(false);
  const [reviewedConflict, setReviewedConflict] = useState(false);
  const [update, updateState] = useUpdateShopPayoutDetailsMutation();
  const [versionAtOpen, setVersionAtOpen] = useState(shopVersion);
  const action = useFinancialAction({
    scopeKey: `owner-payout:${scope.ownerId}:${scope.shopId}`,
    run: (args: PayoutDetailsDraft & { expectedVersion: number }, idempotencyKey: string) =>
      update({
        ...scope,
        ...args,
        accountName: args.accountName.trim(),
        accountIdentifier: args.accountIdentifier.trim(),
        provider: args.provider.trim() || undefined,
        reason: args.reason.trim(),
        idempotencyKey,
      }).unwrap(),
    refresh,
    onSuccess: () => {
      setDraft({
        method: 'ECOCASH',
        accountName: '',
        accountIdentifier: '',
        provider: '',
        reason: '',
      });
      setConfirmed(false);
      updateState.reset();
      onSaved();
    },
    allowUnconfirmedRetry: true,
  });
  const fieldErrors = fieldErrorMap(action.error);
  const changed = action.error?.kind === 'conflict' || versionAtOpen !== shopVersion;
  const locked = action.pending || action.unconfirmed !== false;

  function change<K extends keyof PayoutDetailsDraft>(name: K, value: PayoutDetailsDraft[K]) {
    setDraft((current) => ({ ...current, [name]: value }));
    setConfirmed(false);
  }

  function close() {
    if (action.pending) return;
    if (!action.unconfirmed) {
      setDraft({
        method: destination?.method ?? 'ECOCASH',
        accountName: destination?.accountName ?? '',
        accountIdentifier: '',
        provider: destination?.provider ?? '',
        reason: '',
      });
      setConfirmed(false);
      setReviewedConflict(false);
      setVersionAtOpen(shopVersion);
      action.reset();
      updateState.reset();
    }
    onClose();
  }

  return (
    <>
      {action.unconfirmed ? (
        <Alert
          severity="warning"
          action={<Button onClick={onOpen}>Review unconfirmed request</Button>}
        >
          The payout-details change has an unconfirmed outcome. Reopen it to retry the original
          request safely.
        </Alert>
      ) : null}
      <FormDialog
        open={open}
        title="Confirm payout destination"
        description="Enter the full destination for future manual shop payouts. This form does not initiate a transfer."
        submitLabel="Save payout details"
        pending={action.pending}
        error={action.error}
        unconfirmed={action.unconfirmed}
        onRetryUnconfirmed={() => void action.retryUnconfirmed()}
        onClose={close}
        disabled={
          !validPayoutDetails(draft) || !confirmed || refreshing || (changed && !reviewedConflict)
        }
        onSubmit={() => {
          setReviewedConflict(false);
          void action.submit({ ...draft, expectedVersion: shopVersion });
        }}
      >
        {changed ? (
          <Alert severity="warning">
            The branch record changed. Your draft is preserved. Review the latest masked destination
            below before saving with version {shopVersion}.
            <PayoutDestinationSummary destination={destination} />
            <FormControlLabel
              control={
                <Checkbox
                  checked={reviewedConflict}
                  onChange={(event) => setReviewedConflict(event.target.checked)}
                />
              }
              label="I reviewed the latest destination and still want these changes"
            />
          </Alert>
        ) : null}
        <TextField
          select
          label="Payout method"
          value={draft.method}
          onChange={(event) => change('method', event.target.value as ShopPayoutMethod)}
          disabled={locked}
          error={!!fieldErrors.method}
          helperText={fieldErrors.method}
        >
          <MenuItem value="ECOCASH">EcoCash</MenuItem>
          <MenuItem value="BANK_TRANSFER">Bank transfer</MenuItem>
          <MenuItem value="CASH">Cash handover</MenuItem>
        </TextField>
        <TextField
          label="Account or recipient name"
          required
          value={draft.accountName}
          onChange={(event) => change('accountName', event.target.value)}
          disabled={locked}
          error={!!fieldErrors.accountName}
          helperText={fieldErrors.accountName}
          slotProps={{ htmlInput: { maxLength: 120 } }}
        />
        <TextField
          label={
            draft.method === 'ECOCASH'
              ? 'Full mobile-money number'
              : draft.method === 'BANK_TRANSFER'
                ? 'Full bank account identifier'
                : 'Cash collection identifier'
          }
          required
          value={draft.accountIdentifier}
          onChange={(event) => change('accountIdentifier', event.target.value)}
          disabled={locked}
          error={!!fieldErrors.accountIdentifier}
          helperText={
            fieldErrors.accountIdentifier ??
            'Enter the complete new identifier. Masked values cannot be saved.'
          }
          slotProps={{ htmlInput: { maxLength: 120, autoComplete: 'off' } }}
        />
        <TextField
          label="Bank or provider (optional)"
          value={draft.provider}
          onChange={(event) => change('provider', event.target.value)}
          disabled={locked}
          error={!!fieldErrors.provider}
          helperText={fieldErrors.provider}
          slotProps={{ htmlInput: { maxLength: 120 } }}
        />
        <ReasonField
          label="Reason for adding or changing details"
          value={draft.reason}
          onChange={(value) => change('reason', value)}
          disabled={locked}
          error={fieldErrors.reason}
        />
        <FormControlLabel
          control={
            <Checkbox
              checked={confirmed}
              onChange={(event) => setConfirmed(event.target.checked)}
              disabled={locked}
            />
          }
          label="I checked these details and confirm this destination for future manual payouts"
        />
      </FormDialog>
    </>
  );
}
