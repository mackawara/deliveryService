import CheckCircleIcon from '@mui/icons-material/CheckCircle';
import FactCheckIcon from '@mui/icons-material/FactCheck';
import GavelIcon from '@mui/icons-material/Gavel';
import Alert from '@mui/material/Alert';
import Button from '@mui/material/Button';
import Card from '@mui/material/Card';
import CardContent from '@mui/material/CardContent';
import Chip from '@mui/material/Chip';
import Dialog from '@mui/material/Dialog';
import DialogActions from '@mui/material/DialogActions';
import DialogContent from '@mui/material/DialogContent';
import DialogTitle from '@mui/material/DialogTitle';
import MenuItem from '@mui/material/MenuItem';
import Stack from '@mui/material/Stack';
import Tab from '@mui/material/Tab';
import Tabs from '@mui/material/Tabs';
import TextField from '@mui/material/TextField';
import Typography from '@mui/material/Typography';
import { useState, type FormEvent } from 'react';

import type { WireClaim, WireShop, WireShopDetail } from '@/api/dto/shop';
import {
  useGetAdminShopQuery,
  useListAdminClaimsQuery,
  useListAdminShopsQuery,
  useProposeAdminTermsMutation,
  useReviewAdminClaimMutation,
  useReviewAdminShopMutation,
} from '@/api/endpoints/shop';
import type { NormalizedApiError } from '@/api/errors';
import { ApiError } from '@/components/ApiError';
import { PageHeader } from '@/components/PageHeader';
import { newIdempotencyKey } from '@/lib/idempotency';

function ReviewDialog({ shop, onClose }: { shop: WireShop; onClose: () => void }) {
  const [decision, setDecision] = useState<'APPROVED' | 'REJECTED' | 'SUSPENDED'>('APPROVED');
  const [reason, setReason] = useState('');
  const [zoneCode, setZoneCode] = useState(shop.pickup.zoneCode);
  const [minMinutes, setMinMinutes] = useState('20');
  const [maxMinutes, setMaxMinutes] = useState('35');
  const [review, state] = useReviewAdminShopMutation();
  const [error, setError] = useState<NormalizedApiError>();
  async function submit(event: FormEvent) {
    event.preventDefault();
    setError(undefined);
    try {
      await review({
        shopId: shop._id,
        expectedVersion: shop.version,
        decision,
        reason: reason.trim(),
        zoneCode: zoneCode.trim() || undefined,
        estimate:
          decision === 'APPROVED'
            ? { minMinutes: Number(minMinutes), maxMinutes: Number(maxMinutes) }
            : undefined,
        idempotencyKey: newIdempotencyKey(),
      }).unwrap();
      onClose();
    } catch (caught) {
      setError(caught as NormalizedApiError);
    }
  }
  return (
    <Dialog open onClose={state.isLoading ? undefined : onClose} fullWidth maxWidth="sm">
      <form onSubmit={submit}>
        <DialogTitle>Review {shop.name}</DialogTitle>
        <DialogContent>
          <Stack spacing={2} sx={{ pt: 1 }}>
            {error ? <ApiError error={error} /> : null}
            <TextField
              select
              label="Decision"
              value={decision}
              onChange={(event) => setDecision(event.target.value as typeof decision)}
            >
              {['APPROVED', 'REJECTED', 'SUSPENDED'].map((value) => (
                <MenuItem key={value} value={value}>
                  {value}
                </MenuItem>
              ))}
            </TextField>
            <TextField
              required
              label="Reason"
              value={reason}
              onChange={(event) => setReason(event.target.value)}
              multiline
              minRows={2}
            />
            <TextField
              label="Resolved zone code"
              value={zoneCode}
              onChange={(event) => setZoneCode(event.target.value)}
            />
            {decision === 'APPROVED' ? (
              <Stack direction="row" spacing={2}>
                <TextField
                  required
                  label="Min wait (minutes)"
                  value={minMinutes}
                  onChange={(event) => setMinMinutes(event.target.value)}
                  type="number"
                />
                <TextField
                  required
                  label="Max wait (minutes)"
                  value={maxMinutes}
                  onChange={(event) => setMaxMinutes(event.target.value)}
                  type="number"
                />
              </Stack>
            ) : null}
          </Stack>
        </DialogContent>
        <DialogActions>
          <Button onClick={onClose}>Cancel</Button>
          <Button type="submit" variant="contained" disabled={state.isLoading || !reason.trim()}>
            {state.isLoading ? 'Saving…' : 'Save review'}
          </Button>
        </DialogActions>
      </form>
    </Dialog>
  );
}

function TermsDialog({ detail, onClose }: { detail: WireShopDetail; onClose: () => void }) {
  const [basisPoints, setBasisPoints] = useState('1250');
  const [reference, setReference] = useState('');
  const [frequency, setFrequency] = useState<'DAILY' | 'WEEKLY' | 'MONTHLY'>('WEEKLY');
  const [timezone, setTimezone] = useState('Africa/Harare');
  const [cutoffTime, setCutoffTime] = useState('22:00');
  const [anchor, setAnchor] = useState('');
  const [propose, state] = useProposeAdminTermsMutation();
  const [error, setError] = useState<NormalizedApiError>();
  async function submit(event: FormEvent) {
    event.preventDefault();
    try {
      const schedule = {
        frequency,
        timezone,
        cutoffTime,
        ...(frequency === 'WEEKLY'
          ? { periodAnchor: Number(anchor || 0) }
          : frequency === 'MONTHLY'
            ? { periodAnchor: Number(anchor || 1) }
            : {}),
      };
      await propose({
        shopId: detail.shop._id,
        expectedVersion: detail.shop.version,
        basisPoints: Number(basisPoints),
        reference: reference.trim(),
        effectiveFrom: new Date().toISOString(),
        businessConfirmed: true,
        schedule,
        idempotencyKey: newIdempotencyKey(),
      }).unwrap();
      onClose();
    } catch (caught) {
      setError(caught as NormalizedApiError);
    }
  }
  return (
    <Dialog open onClose={state.isLoading ? undefined : onClose} fullWidth maxWidth="sm">
      <form onSubmit={submit}>
        <DialogTitle>Propose commercial terms</DialogTitle>
        <DialogContent>
          <Stack spacing={2} sx={{ pt: 1 }}>
            {error ? <ApiError error={error} /> : null}
            <TextField
              required
              label="Commission (basis points)"
              value={basisPoints}
              onChange={(event) => setBasisPoints(event.target.value)}
              type="number"
              helperText="1250 = 12.50% of food subtotal, rounded by the API."
            />
            <TextField
              required
              label="Signed reference"
              value={reference}
              onChange={(event) => setReference(event.target.value)}
            />
            <TextField
              select
              label="Settlement frequency"
              value={frequency}
              onChange={(event) => setFrequency(event.target.value as typeof frequency)}
            >
              {['DAILY', 'WEEKLY', 'MONTHLY'].map((value) => (
                <MenuItem key={value} value={value}>
                  {value}
                </MenuItem>
              ))}
            </TextField>
            <Stack direction="row" spacing={2}>
              <TextField
                fullWidth
                label="Timezone"
                value={timezone}
                onChange={(event) => setTimezone(event.target.value)}
              />
              <TextField
                fullWidth
                label="Cut-off"
                type="time"
                value={cutoffTime}
                onChange={(event) => setCutoffTime(event.target.value)}
                slotProps={{ inputLabel: { shrink: true } }}
              />
            </Stack>
            {frequency !== 'DAILY' ? (
              <TextField
                label={frequency === 'WEEKLY' ? 'Weekday anchor (0–6)' : 'Month day anchor (1–28)'}
                value={anchor}
                onChange={(event) => setAnchor(event.target.value)}
                type="number"
              />
            ) : null}
          </Stack>
        </DialogContent>
        <DialogActions>
          <Button onClick={onClose}>Cancel</Button>
          <Button type="submit" variant="contained" disabled={state.isLoading || !reference.trim()}>
            {state.isLoading ? 'Saving…' : 'Propose terms'}
          </Button>
        </DialogActions>
      </form>
    </Dialog>
  );
}

function DetailCard({
  shop,
  onReview,
  onTerms,
}: {
  shop: WireShop;
  onReview: () => void;
  onTerms: () => void;
}) {
  const detail = useGetAdminShopQuery(shop._id);
  return (
    <Card variant="outlined">
      <CardContent>
        <Stack spacing={1.5}>
          <Stack direction="row" sx={{ justifyContent: 'space-between', alignItems: 'flex-start' }}>
            <Stack>
              <Typography variant="h3">
                {shop.name}
                {shop.branchName ? ` · ${shop.branchName}` : ''}
              </Typography>
              <Typography variant="body2" color="text.secondary">
                {shop.contactPhone} · {shop.pickup.addressLine} · zone {shop.pickup.zoneCode}
              </Typography>
            </Stack>
            <Chip
              size="small"
              label={shop.approvalState}
              color={shop.approvalState === 'APPROVED' ? 'success' : 'warning'}
            />
          </Stack>
          <Typography variant="body2">
            Source: {shop.source ?? 'SELF_SERVICE'} · {shop.isOpen ? 'Open' : 'Closed'} · profile
            version {shop.version}
          </Typography>
          {detail.data?.shop.approvalReason ? (
            <Alert severity="info">{detail.data.shop.approvalReason}</Alert>
          ) : null}
          <Stack direction="row" spacing={1}>
            <Button
              size="small"
              variant="contained"
              startIcon={<FactCheckIcon />}
              onClick={onReview}
            >
              Review
            </Button>
            <Button size="small" variant="outlined" startIcon={<GavelIcon />} onClick={onTerms}>
              Configure terms
            </Button>
          </Stack>
        </Stack>
      </CardContent>
    </Card>
  );
}

function ClaimCard({ claim, onReviewed }: { claim: WireClaim; onReviewed: () => void }) {
  const [review, state] = useReviewAdminClaimMutation();
  const [reason, setReason] = useState('');
  async function decide(decision: 'APPROVED' | 'REJECTED') {
    await review({
      claimId: claim._id,
      expectedVersion: claim.version,
      decision,
      reason: reason.trim(),
      idempotencyKey: newIdempotencyKey(),
    }).unwrap();
    onReviewed();
  }
  return (
    <Card variant="outlined">
      <CardContent>
        <Stack spacing={1}>
          <Typography variant="subtitle1">Claim for {claim.shopId}</Typography>
          <Typography variant="body2">{claim.evidence}</Typography>
          <TextField
            size="small"
            label="Verification reason"
            value={reason}
            onChange={(event) => setReason(event.target.value)}
          />
          <Stack direction="row" spacing={1}>
            <Button
              size="small"
              color="success"
              startIcon={<CheckCircleIcon />}
              onClick={() => void decide('APPROVED')}
              disabled={state.isLoading || reason.trim().length < 10}
            >
              Approve
            </Button>
            <Button
              size="small"
              color="error"
              onClick={() => void decide('REJECTED')}
              disabled={state.isLoading || reason.trim().length < 10}
            >
              Reject
            </Button>
          </Stack>
        </Stack>
      </CardContent>
    </Card>
  );
}

export function AdminShopsPage() {
  const [tab, setTab] = useState<'shops' | 'claims'>('shops');
  const [approvalState, setApprovalState] = useState('PENDING');
  const shops = useListAdminShopsQuery({ approvalState });
  const claims = useListAdminClaimsQuery({ status: 'PENDING' }, { skip: tab !== 'claims' });
  const [selected, setSelected] = useState<WireShop>();
  const [termsShop, setTermsShop] = useState<WireShop>();
  const detail = useGetAdminShopQuery(termsShop?._id ?? '', { skip: !termsShop });
  return (
    <Stack spacing={3}>
      <PageHeader
        title="Food shops"
        description="Review owner onboarding, pilot claims and commercial terms."
        crumbs={[{ label: 'Administration' }, { label: 'Food shops' }]}
      />
      <Tabs value={tab} onChange={(_, value: 'shops' | 'claims') => setTab(value)}>
        <Tab value="shops" label="Approval queue" />
        <Tab value="claims" label="Claims" />
      </Tabs>
      {tab === 'shops' ? (
        <>
          <TextField
            select
            label="Approval state"
            value={approvalState}
            onChange={(event) => setApprovalState(event.target.value)}
            sx={{ maxWidth: 220 }}
          >
            {['PENDING', 'APPROVED', 'REJECTED', 'SUSPENDED'].map((value) => (
              <MenuItem key={value} value={value}>
                {value}
              </MenuItem>
            ))}
          </TextField>
          {shops.error ? (
            <ApiError
              error={shops.error as NormalizedApiError}
              onRetry={() => void shops.refetch()}
            />
          ) : null}
          <Stack spacing={1.5}>
            {(shops.data?.items ?? []).map((shop) => (
              <DetailCard
                key={shop._id}
                shop={shop}
                onReview={() => setSelected(shop)}
                onTerms={() => setTermsShop(shop)}
              />
            ))}
            {!shops.data?.items.length && !shops.isLoading ? (
              <Alert severity="info">No shops in this queue.</Alert>
            ) : null}
          </Stack>
        </>
      ) : (
        <>
          {claims.error ? (
            <ApiError
              error={claims.error as NormalizedApiError}
              onRetry={() => void claims.refetch()}
            />
          ) : null}
          <Stack spacing={1.5}>
            {(claims.data?.items ?? []).map((claim) => (
              <ClaimCard key={claim._id} claim={claim} onReviewed={() => void claims.refetch()} />
            ))}
            {!claims.data?.items.length && !claims.isLoading ? (
              <Alert severity="info">No pending claims.</Alert>
            ) : null}
          </Stack>
        </>
      )}
      {selected ? (
        <ReviewDialog
          shop={selected}
          onClose={() => {
            setSelected(undefined);
            void shops.refetch();
          }}
        />
      ) : null}
      {termsShop && detail.data ? (
        <TermsDialog
          detail={detail.data}
          onClose={() => {
            setTermsShop(undefined);
            void shops.refetch();
          }}
        />
      ) : null}
    </Stack>
  );
}
