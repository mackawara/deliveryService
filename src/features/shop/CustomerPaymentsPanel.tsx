import {
  Alert,
  Button,
  Card,
  CardContent,
  Chip,
  Stack,
  TextField,
  Typography,
} from '@mui/material';
import { useState } from 'react';
import { Link as RouterLink } from 'react-router-dom';

import type { ShopPaymentSettings } from '@/api/dto/foodPayments';
import {
  useGetAdminShopPaymentSettingsQuery,
  useGetOwnerShopPaymentSettingsQuery,
  useUpdateShopPaymentSettingsMutation,
} from '@/api/endpoints/foodPayments';
import type { NormalizedApiError } from '@/api/errors';
import { useAuth } from '@/auth/useAuth';
import { useOwnerAuth } from '@/auth/useOwnerAuth';
import { ApiError } from '@/components/ApiError';
import { FormDialog } from '@/components/FormDialog';
import { KeyValue } from '@/components/KeyValue';
import { appConfig } from '@/config';
import { formatDateTime } from '@/lib/datetime';
import { foodFinanceScopeKey } from '@/lib/foodSettlementAccess';
import { canAccessTown } from '@/lib/permissions';
import { useFinancialAction } from '@/lib/useFinancialAction';

const blockedMessages: Record<string, string> = {
  FOOD_ECOCASH_DISABLED:
    'EcoCash checkout is not enabled for this rollout. Contact delivery operations.',
  FOOD_SETTLEMENTS_DISABLED:
    'Food settlements must be enabled before EcoCash collection can be offered.',
  PLATFORM_PROVIDER_UNAVAILABLE:
    'The platform payment provider is unavailable. Existing attempts can still be reviewed in Payments.',
  USD_CAPABILITY_UNVERIFIED:
    'USD collection capability has not been verified. Record approved provider evidence before enabling checkout.',
  PROVIDER_TERMS_UNVERIFIED:
    'Provider fees and the refund procedure must be verified before enabling checkout.',
  PROVIDER_VERIFICATION_REQUIRED:
    'Current provider verification evidence is required before enabling checkout.',
  SHOP_NOT_APPROVED: 'This branch must be active and approved before enabling EcoCash.',
  SHOP_NOT_IN_PAYMENT_PILOT: 'This branch has not been included in the approved EcoCash pilot.',
};

function PaymentSummary({ settings }: { settings: ShopPaymentSettings }) {
  const blockedReason = settings.blockedReason ?? settings.provider.blockedReason;
  return (
    <Stack spacing={1.5}>
      <KeyValue
        columns={1}
        entries={[
          { label: 'Branch', value: settings.shopId },
          { label: 'Cash on delivery', value: settings.codEnabled ? 'Available' : 'Unavailable' },
          { label: 'EcoCash', value: <Chip size="small" label={settings.status} /> },
          { label: 'Currency', value: settings.currency },
          {
            label: 'USD provider capability',
            value: settings.provider.usdSupported ? 'Verified' : 'Not verified',
          },
          { label: 'Platform provider', value: settings.provider.ready ? 'Ready' : 'Unavailable' },
          {
            label: 'Last capability check',
            value: settings.provider.checkedAt
              ? formatDateTime(settings.provider.checkedAt)
              : 'Not verified',
          },
          {
            label: 'Enabled at',
            value: settings.enabledAt ? formatDateTime(settings.enabledAt) : 'Not enabled',
          },
          {
            label: 'Enabled by',
            value: settings.enabledBy?.label ?? settings.enabledBy?.id ?? '—',
          },
          { label: 'Configuration version', value: settings.version },
        ]}
      />
      {blockedReason ? (
        <Alert severity="warning">{blockedMessages[blockedReason] ?? blockedReason}</Alert>
      ) : null}
      <Typography variant="body2" color="text.secondary">
        The delivery service collects the full food and delivery total. Net food proceeds enter the
        branch’s pending balance after the snapshotted commission. Delivery is not deducted again.
        Customer payment confirmation does not complete a shop payout or assign a rider.
      </Typography>
    </Stack>
  );
}

function AdminPayments({ shopId, scopeKey }: { shopId: string; scopeKey: string }) {
  const query = useGetAdminShopPaymentSettingsQuery({ shopId, scopeKey });
  const [update] = useUpdateShopPaymentSettingsMutation();
  const [editTarget, setEditTarget] = useState<boolean | null>(null);
  const [reason, setReason] = useState('');
  const settings = query.error ? undefined : query.currentData;
  const action = useFinancialAction({
    scopeKey: `${scopeKey}:payments:${shopId}`,
    run: (
      body: { ecoCashEnabled: boolean; expectedVersion: number; reason: string },
      idempotencyKey: string,
    ) => update({ shopId, scopeKey, ...body, idempotencyKey }).unwrap(),
    refresh: () => void query.refetch(),
    allowUnconfirmedRetry: true,
    successMessage: 'The delivery service confirmed the payment setting.',
    onSuccess: () => {
      setEditTarget(null);
      setReason('');
    },
  });
  const mayEnable =
    settings?.status === 'READY' && settings.provider.ready && settings.provider.usdSupported;
  return (
    <Card variant="outlined">
      <CardContent>
        <Stack spacing={2}>
          <Typography variant="h6" component="h3">
            Customer payments
          </Typography>
          {query.isLoading ? <Typography>Loading payment availability…</Typography> : null}
          <ApiError
            error={query.error as NormalizedApiError | undefined}
            onRetry={() => void query.refetch()}
          />
          {settings ? (
            <>
              <PaymentSummary settings={settings} />
              <Button
                variant="outlined"
                disabled={!settings.ecoCashEnabled && !mayEnable}
                onClick={() => {
                  action.reset();
                  setEditTarget(!settings.ecoCashEnabled);
                }}
              >
                {settings.ecoCashEnabled ? 'Disable new EcoCash checkouts' : 'Enable EcoCash'}
              </Button>
              <Typography variant="caption" color="text.secondary">
                Disabling new checkouts preserves existing payment attempts, reconciliation and
                refunds.
              </Typography>
            </>
          ) : null}
        </Stack>
      </CardContent>
      <FormDialog
        open={editTarget !== null}
        title={editTarget === false ? 'Disable new EcoCash checkouts' : 'Enable EcoCash'}
        description="The API checks approval, the pilot allowlist and verified platform USD capability before enabling checkout."
        submitLabel="Save payment setting"
        pending={action.pending}
        closeDisabled={Boolean(action.unconfirmed)}
        disabled={
          query.isFetching ||
          !settings ||
          reason.trim().length < 10 ||
          (editTarget === true && !settings.ecoCashEnabled && !mayEnable)
        }
        error={action.error}
        unconfirmed={action.unconfirmed}
        onRetryUnconfirmed={() => void action.retryUnconfirmed()}
        onClose={() => {
          if (!action.pending && !action.unconfirmed) {
            setEditTarget(null);
            setReason('');
          }
        }}
        onSubmit={() => {
          if (
            settings &&
            editTarget !== null &&
            !query.isFetching &&
            reason.trim().length >= 10 &&
            (!editTarget || settings.ecoCashEnabled || mayEnable)
          ) {
            void action.submit({
              ecoCashEnabled: editTarget,
              expectedVersion: settings.version,
              reason: reason.trim(),
            });
          }
        }}
      >
        <Stack spacing={2}>
          {action.error?.kind === 'conflict' ? (
            <Alert severity="warning">
              Another administrator changed this setting. The latest version has been reloaded.
              Review it before saving again.
            </Alert>
          ) : null}
          {settings ? <PaymentSummary settings={settings} /> : null}
          <TextField
            required
            label="Reason for change"
            value={reason}
            onChange={(event) => setReason(event.target.value)}
            helperText="At least 10 characters for the audit record."
            disabled={action.pending || Boolean(action.unconfirmed)}
            multiline
            minRows={2}
          />
        </Stack>
      </FormDialog>
    </Card>
  );
}

export function AdminCustomerPaymentsPanel({ shopId, townId }: { shopId: string; townId: string }) {
  const { session, signingOut } = useAuth();
  if (
    !appConfig.enableFoodEcoCash ||
    signingOut ||
    !session?.roles.includes('admin') ||
    !canAccessTown(session, townId)
  ) {
    return null;
  }
  const scopeKey = foodFinanceScopeKey(session);
  return <AdminPayments key={`${scopeKey}:${shopId}`} shopId={shopId} scopeKey={scopeKey} />;
}

function OwnerPayments({ shopId, scopeKey }: { shopId: string; scopeKey: string }) {
  const query = useGetOwnerShopPaymentSettingsQuery({ shopId, scopeKey });
  const settings = query.error ? undefined : query.currentData;
  return (
    <Card variant="outlined">
      <CardContent>
        <Stack spacing={2}>
          <Typography variant="h6" component="h2">
            Customer payments
          </Typography>
          {query.isLoading ? <Typography>Loading payment availability…</Typography> : null}
          <ApiError
            error={query.error as NormalizedApiError | undefined}
            onRetry={() => void query.refetch()}
          />
          {settings ? <PaymentSummary settings={settings} /> : null}
          <Typography variant="body2">
            Payment methods are managed by delivery operations. Customers complete EcoCash checkout
            in WhatsApp and never share their PIN here.
          </Typography>
          {appConfig.enableFoodSettlements ? (
            <Button
              component={RouterLink}
              to={`/shop/${encodeURIComponent(shopId)}/payout-details`}
            >
              Payout details
            </Button>
          ) : null}
        </Stack>
      </CardContent>
    </Card>
  );
}

export function OwnerCustomerPaymentsPanel({ shopId }: { shopId: string }) {
  const { session, signingOut } = useOwnerAuth();
  const member = session?.memberships.find(
    (entry) =>
      entry.shopId === shopId &&
      entry.status === 'ACTIVE' &&
      (entry.role === 'OWNER' || entry.role === 'MANAGER'),
  );
  if (!appConfig.enableFoodEcoCash || signingOut || !session || !member) {
    return null;
  }
  const scopeKey = JSON.stringify([
    session.owner.id,
    session.session.expiresAt,
    member.role,
    member.version,
    [...session.capabilities].sort(),
  ]);
  return <OwnerPayments key={`${scopeKey}:${shopId}`} scopeKey={scopeKey} shopId={shopId} />;
}
