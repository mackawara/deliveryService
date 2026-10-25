import { SettlementFields } from './SettlementFields';
import AddBusinessIcon from '@mui/icons-material/AddBusiness';
import Alert from '@mui/material/Alert';
import Button from '@mui/material/Button';
import Card from '@mui/material/Card';
import CardContent from '@mui/material/CardContent';
import Divider from '@mui/material/Divider';
import MenuItem from '@mui/material/MenuItem';
import Stack from '@mui/material/Stack';
import TextField from '@mui/material/TextField';
import Typography from '@mui/material/Typography';
import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  useCreateShopMutation,
  useSubmitShopClaimMutation,
  useListShopTownsQuery,
} from '@/api/endpoints/shop';
import type { NormalizedApiError } from '@/api/errors';
import { useOwnerAuth } from '@/auth/useOwnerAuth';
import { useGuardedAction } from '@/lib/useGuardedAction';
import { PickupPicker } from './PickupPicker';
import { validPickup, type PickupDraft } from './pickup';
import { scheduleDraft, schedulePayload, validSchedule, type ScheduleDraft } from './settlement';

interface SetupDraft {
  createKey: string;
  name: string;
  branchName: string;
  phone: string;
  townId: string;
  pickup: PickupDraft;
  schedule: ScheduleDraft;
}
const emptyDraft = (): SetupDraft => ({
  createKey: crypto.randomUUID(),
  name: '',
  branchName: '',
  phone: '',
  townId: '',
  pickup: { lat: '', lng: '', address: '' },
  schedule: scheduleDraft(),
});
function readDraft(key: string): SetupDraft {
  try {
    const saved = JSON.parse(sessionStorage.getItem(key) ?? 'null');
    if (!saved || typeof saved.savedAt !== 'number' || Date.now() - saved.savedAt > 7 * 86400000)
      return emptyDraft();
    const value = saved.value as SetupDraft;
    if (
      ![
        value.name,
        value.branchName,
        value.phone,
        value.townId,
        value.pickup.lat,
        value.pickup.lng,
        value.pickup.address,
        value.schedule.timezone,
        value.schedule.cutoffTime,
        value.schedule.anchor,
      ].every((part) => typeof part === 'string') ||
      !['DAILY', 'WEEKLY', 'MONTHLY'].includes(value.schedule.frequency)
    )
      return emptyDraft();
    return {
      ...value,
      createKey: typeof value.createKey === 'string' ? value.createKey : crypto.randomUUID(),
    };
  } catch {
    return emptyDraft();
  }
}
export function ShopSetupPage() {
  const { session } = useOwnerAuth();
  return session ? <SetupForm key={session.owner.id} ownerId={session.owner.id} /> : null;
}
function SetupForm({ ownerId }: { ownerId: string }) {
  const navigate = useNavigate();
  const draftKey = `shop-setup:v1:${ownerId}`;
  const [draft, setDraft] = useState(() => readDraft(draftKey));
  const [claimShopId, setClaimShopId] = useState('');
  const [evidence, setEvidence] = useState('');
  const [createShop] = useCreateShopMutation();
  const [submitClaim] = useSubmitShopClaimMutation();
  const towns = useListShopTownsQuery();
  useEffect(() => {
    try {
      sessionStorage.setItem(draftKey, JSON.stringify({ savedAt: Date.now(), value: draft }));
    } catch {
      /* Setup remains usable when browser storage is unavailable. */
    }
  }, [draft, draftKey]);
  const field = (key: 'name' | 'branchName' | 'phone' | 'townId', value: string) =>
    setDraft((current) => ({
      ...current,
      createKey: crypto.randomUUID(),
      [key]: value,
      ...(key === 'townId'
        ? { pickup: { lat: '', lng: '', address: current.pickup.address } }
        : {}),
    }));
  const create = useGuardedAction({
    run: (_: undefined, _key: string) =>
      createShop({
        name: draft.name.trim(),
        branchName: draft.branchName.trim() || undefined,
        contactPhone: draft.phone.trim(),
        townId: draft.townId,
        pickup: {
          lat: Number(draft.pickup.lat),
          lng: Number(draft.pickup.lng),
          address: draft.pickup.address.trim(),
        },
        requestedSettlement: schedulePayload(draft.schedule),
        idempotencyKey: draft.createKey,
      }).unwrap(),
    successMessage: 'Branch created. Verify its WhatsApp contact and prepare the catalogue.',
    onSuccess: (shop) => {
      try {
        sessionStorage.removeItem(draftKey);
      } catch {
        /* Optional draft storage. */
      }
      navigate(`/shop/${shop._id}/profile`);
    },
  });
  const claim = useGuardedAction({
    run: (_: undefined, key: string) =>
      submitClaim({
        shopId: claimShopId.trim(),
        evidence: evidence.trim(),
        idempotencyKey: key,
      }).unwrap(),
    successMessage: 'Claim submitted for independent review.',
    onSuccess: () => {
      setClaimShopId('');
      setEvidence('');
    },
  });
  const valid =
    draft.name.trim() &&
    draft.phone.trim() &&
    towns.data?.some((town) => town._id === draft.townId) &&
    validPickup(draft.pickup) &&
    validSchedule(draft.schedule);
  return (
    <Stack spacing={3} sx={{ maxWidth: 860, mx: 'auto' }}>
      <Stack direction="row" spacing={1.5} sx={{ alignItems: 'center' }}>
        <AddBusinessIcon color="primary" />
        <Typography variant="h1">Set up a branch</Typography>
      </Stack>
      <Card>
        <CardContent>
          <Stack spacing={2.5}>
            <Typography variant="h2">Branch details</Typography>
            <Typography>
              A branch starts closed and pending. After creation, verify the branch WhatsApp contact
              and add its catalogue.
            </Typography>
            <Typography variant="body2" color="text.secondary">
              Your draft is saved in this browser tab for seven days. Codes and consent are never
              saved in drafts.
            </Typography>
            <Button onClick={() => setDraft(emptyDraft())}>Clear setup draft</Button>
            <TextField
              fullWidth
              required
              label="Business name"
              value={draft.name}
              onChange={(event) => field('name', event.target.value)}
            />
            <TextField
              fullWidth
              label="Branch label"
              value={draft.branchName}
              onChange={(event) => field('branchName', event.target.value)}
              helperText="For example, Town centre"
            />
            <TextField
              fullWidth
              required
              label="Contact phone"
              value={draft.phone}
              onChange={(event) => field('phone', event.target.value)}
              inputMode="tel"
              helperText="The WhatsApp number that will receive and act on branch orders. It is verified separately from your login."
            />
            {towns.error && (
              <Alert
                severity="error"
                action={<Button onClick={() => void towns.refetch()}>Retry towns</Button>}
              >
                Delivery towns could not be loaded.
              </Alert>
            )}
            <TextField
              required
              select
              label="Delivery town"
              value={draft.townId}
              onChange={(event) => field('townId', event.target.value)}
              disabled={towns.isLoading || !towns.data?.length}
            >
              {(towns.data ?? []).map((town) => (
                <MenuItem key={town._id} value={town._id}>
                  {town.name}
                </MenuItem>
              ))}
            </TextField>
            {!towns.isLoading && towns.data?.length === 0 && (
              <Alert severity="info">
                No delivery towns are open for branch setup yet. Your draft is saved; try again
                later.
              </Alert>
            )}
            <PickupPicker
              key={draft.townId}
              value={draft.pickup}
              onChange={(pickup) =>
                setDraft((current) => ({ ...current, createKey: crypto.randomUUID(), pickup }))
              }
              town={towns.data?.find((town) => town._id === draft.townId)}
            />
            <Divider />
            <Typography variant="h2">Settlement request</Typography>
            <Typography variant="body2">
              Choose your preferred period. The delivery team will propose the agreed terms for your
              acknowledgement.
            </Typography>
            <SettlementFields
              value={draft.schedule}
              onChange={(schedule) =>
                setDraft((current) => ({ ...current, createKey: crypto.randomUUID(), schedule }))
              }
            />
            {create.error && (
              <Alert severity="error">{(create.error as NormalizedApiError).message}</Alert>
            )}
            <Button
              variant="contained"
              onClick={() => void create.submit()}
              disabled={!valid || create.pending}
            >
              {create.pending ? 'Creating branch…' : 'Create branch'}
            </Button>
          </Stack>
        </CardContent>
      </Card>
      <Card variant="outlined">
        <CardContent>
          <Stack spacing={2}>
            <Typography variant="h2">Claim an existing pilot shop</Typography>
            <Typography variant="body2" color="text.secondary">
              Use the exact branch ID supplied by the delivery team. The catalogue and order history
              remain attached to that branch.
            </Typography>
            <TextField
              label="Branch ID"
              value={claimShopId}
              onChange={(event) => setClaimShopId(event.target.value)}
              fullWidth
            />
            <TextField
              label="Ownership evidence"
              value={evidence}
              onChange={(event) => setEvidence(event.target.value)}
              multiline
              minRows={3}
              fullWidth
              helperText={`${evidence.length}/2000`}
            />
            {claim.error ? (
              <Typography color="error">{(claim.error as NormalizedApiError).message}</Typography>
            ) : null}
            <Button
              variant="outlined"
              onClick={() => void claim.submit()}
              disabled={
                claim.pending || claimShopId.trim().length < 1 || evidence.trim().length < 10
              }
            >
              {claim.pending ? 'Submitting…' : 'Submit claim'}
            </Button>
          </Stack>
        </CardContent>
      </Card>
    </Stack>
  );
}
