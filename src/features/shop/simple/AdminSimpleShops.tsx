import CancelIcon from '@mui/icons-material/Cancel';
import CheckCircleIcon from '@mui/icons-material/CheckCircle';
import PlaceIcon from '@mui/icons-material/Place';
import Alert from '@mui/material/Alert';
import Avatar from '@mui/material/Avatar';
import Button from '@mui/material/Button';
import Card from '@mui/material/Card';
import CardContent from '@mui/material/CardContent';
import Chip from '@mui/material/Chip';
import Dialog from '@mui/material/Dialog';
import DialogActions from '@mui/material/DialogActions';
import DialogContent from '@mui/material/DialogContent';
import DialogTitle from '@mui/material/DialogTitle';
import Link from '@mui/material/Link';
import List from '@mui/material/List';
import ListItem from '@mui/material/ListItem';
import ListItemIcon from '@mui/material/ListItemIcon';
import ListItemText from '@mui/material/ListItemText';
import MenuItem from '@mui/material/MenuItem';
import Stack from '@mui/material/Stack';
import TextField from '@mui/material/TextField';
import Typography from '@mui/material/Typography';
import { useState, type FormEvent } from 'react';

import type { WireFoodItem, WireReadinessCheck, WireShop } from '@/api/dto/shop';
import {
  useGetAdminShopQuery,
  useGetFoodTownSettingsQuery,
  useListAdminShopItemsQuery,
  useReviewAdminShopMutation,
  useSetAdminItemDeliverySizeMutation,
  useSetAdminShopPickupMutation,
  useUpdateFoodTownSettingsMutation,
} from '@/api/endpoints/shop';
import type { NormalizedApiError } from '@/api/errors';
import { useTownScope } from '@/app/useTownScope';
import { ApiError } from '@/components/ApiError';
import { useGuardedAction } from '@/lib/useGuardedAction';
import { AdminCustomerPaymentsPanel } from '../CustomerPaymentsPanel';
import { PickupPicker } from '../PickupPicker';
import { hasCoordinates, type PickupDraft } from '../pickup';
import { centsToUsd, deliverySizeLabel, itemImage } from '../shopUtils';
import { hasPhoto } from './items';
import { shopProgress } from './progress';

const APPROVE_REASON = 'All readiness checks passed.';

/** A pending shop with its pin, items and the same readiness checks the owner sees. */
export function SimpleAdminShopCard({
  shop,
  onOtherDecision,
  onTerms,
}: {
  shop: WireShop;
  onOtherDecision: () => void;
  onTerms: () => void;
}) {
  const detail = useGetAdminShopQuery(shop._id);
  const items = useListAdminShopItemsQuery({ shopId: shop._id });
  const [pinOpen, setPinOpen] = useState(false);
  const [rejectOpen, setRejectOpen] = useState(false);
  const [sizeItem, setSizeItem] = useState<WireFoodItem>();
  const [review] = useReviewAdminShopMutation();
  const record = detail.data?.shop ?? shop;
  const readiness = detail.data?.readiness ?? [];
  const missing = readiness.filter((check) => !check.done);
  const approve = useGuardedAction({
    run: (_: undefined, key: string) =>
      review({
        shopId: record._id,
        expectedVersion: record.version,
        decision: 'APPROVED',
        reason: APPROVE_REASON,
        idempotencyKey: key,
      }).unwrap(),
    successMessage: `${record.name} is approved.`,
  });
  const pending = record.approvalState === 'PENDING';
  const labels = Object.fromEntries(
    shopProgress(record, readiness).steps.map((step) => [step.key, step.label]),
  );
  return (
    <Card variant="outlined">
      <CardContent>
        <Stack spacing={2}>
          <Stack direction="row" sx={{ justifyContent: 'space-between', gap: 1 }}>
            <Stack sx={{ minWidth: 0 }}>
              <Typography variant="h3">{record.name}</Typography>
              <Typography variant="body2" color="text.secondary">
                {record.contactPhone}
              </Typography>
            </Stack>
            <Chip
              size="small"
              label={record.approvalState}
              color={record.approvalState === 'APPROVED' ? 'success' : 'warning'}
            />
          </Stack>

          <Stack direction="row" spacing={1} sx={{ alignItems: 'center', flexWrap: 'wrap' }}>
            <PlaceIcon color={record.pickup ? 'primary' : 'disabled'} aria-hidden />
            {record.pickup ? (
              <Typography variant="body2">
                {record.pickup.addressLine || 'No address'} · zone {record.pickup.zoneCode} ·{' '}
                <Link
                  href={`https://www.google.com/maps?q=${record.pickup.point.coordinates[1]},${record.pickup.point.coordinates[0]}`}
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  open the pin on a map
                </Link>
              </Typography>
            ) : (
              <Typography variant="body2">No pickup pin yet.</Typography>
            )}
            <Button size="small" onClick={() => setPinOpen(true)} sx={{ minHeight: 44 }}>
              {record.pickup ? 'Correct pin' : 'Set pin'}
            </Button>
          </Stack>

          <ReadinessList checks={readiness} labels={labels} loading={detail.isLoading} />

          <Stack spacing={1}>
            <Typography variant="subtitle2">
              Items ({items.data?.items.filter((item) => item.status === 'ACTIVE').length ?? '…'})
            </Typography>
            {items.error ? <ApiError error={items.error as NormalizedApiError} /> : null}
            {(items.data?.items ?? [])
              .filter((item) => item.status === 'ACTIVE')
              .map((item) => (
                <Stack key={item._id} direction="row" spacing={1.5} sx={{ alignItems: 'center' }}>
                  <Avatar src={itemImage(item)} variant="rounded" sx={{ width: 40, height: 40 }}>
                    {item.name.slice(0, 1)}
                  </Avatar>
                  <Stack sx={{ flex: 1, minWidth: 0 }}>
                    <Typography variant="body2" noWrap>
                      {item.name} · {centsToUsd(item.priceCents)}
                    </Typography>
                    <Typography variant="caption" color="text.secondary">
                      {hasPhoto(item) ? 'Photo' : 'No photo, hidden'} ·{' '}
                      {item.inStock ? 'In stock' : 'Out of stock'} · {deliverySizeLabel(item)}
                    </Typography>
                  </Stack>
                  <Button size="small" onClick={() => setSizeItem(item)}>
                    Delivery size
                  </Button>
                </Stack>
              ))}
          </Stack>

          {approve.error ? <ApiError error={approve.error} /> : null}
          {pending ? (
            <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1}>
              <Button
                variant="contained"
                color="success"
                onClick={() => void approve.submit()}
                disabled={detail.isLoading || missing.length > 0 || approve.pending}
                sx={{ minHeight: 44 }}
              >
                {approve.pending ? 'Approving…' : 'Approve'}
              </Button>
              <Button
                color="error"
                variant="outlined"
                onClick={() => setRejectOpen(true)}
                sx={{ minHeight: 44 }}
              >
                Reject
              </Button>
            </Stack>
          ) : null}
          {pending && missing.length ? (
            <Typography variant="body2" color="warning.main">
              Approve becomes available once this is done:{' '}
              {missing.map((check) => labels[check.code] ?? check.reason).join(', ')}.
            </Typography>
          ) : null}
          <Stack direction="row" spacing={1}>
            <Button size="small" onClick={onOtherDecision}>
              Other decisions
            </Button>
            <Button size="small" onClick={onTerms}>
              Configure terms
            </Button>
          </Stack>
          {/* Customer payment controls stay with the shop, as on the full card. */}
          <AdminCustomerPaymentsPanel shopId={record._id} townId={record.townId} />
        </Stack>
      </CardContent>
      {pinOpen ? <AdminPinDialog shop={record} onClose={() => setPinOpen(false)} /> : null}
      {rejectOpen ? <RejectDialog shop={record} onClose={() => setRejectOpen(false)} /> : null}
      {sizeItem ? (
        <DeliverySizeDialog
          shopId={record._id}
          item={sizeItem}
          onClose={() => setSizeItem(undefined)}
        />
      ) : null}
    </Card>
  );
}

function ReadinessList({
  checks,
  labels,
  loading,
}: {
  checks: WireReadinessCheck[];
  labels: Record<string, string>;
  loading: boolean;
}) {
  if (loading) return <Typography variant="body2">Loading checks…</Typography>;
  if (!checks.length)
    return <Alert severity="info">This API does not report readiness checks yet.</Alert>;
  return (
    <List dense disablePadding aria-label="Readiness checks">
      {checks.map((check) => (
        <ListItem key={check.code} disableGutters>
          <ListItemIcon sx={{ minWidth: 32 }}>
            {check.done ? (
              <CheckCircleIcon color="success" fontSize="small" titleAccess="Done" />
            ) : (
              <CancelIcon color="warning" fontSize="small" titleAccess="Missing" />
            )}
          </ListItemIcon>
          <ListItemText primary={labels[check.code] ?? check.code} secondary={check.reason} />
        </ListItem>
      ))}
    </List>
  );
}

function AdminPinDialog({ shop, onClose }: { shop: WireShop; onClose: () => void }) {
  const [pickup, setPickup] = useState<PickupDraft>(() =>
    shop.pickup
      ? {
          lat: String(shop.pickup.point.coordinates[1]),
          lng: String(shop.pickup.point.coordinates[0]),
          address: shop.pickup.addressLine,
        }
      : { lat: '', lng: '', address: '' },
  );
  const [setPin] = useSetAdminShopPickupMutation();
  const save = useGuardedAction({
    run: (_: undefined, key: string) =>
      setPin({
        shopId: shop._id,
        expectedVersion: shop.version,
        pickup: {
          lat: Number(pickup.lat),
          lng: Number(pickup.lng),
          address: pickup.address.trim(),
        },
        idempotencyKey: key,
      }).unwrap(),
    successMessage: 'Pickup pin saved.',
    onSuccess: onClose,
  });
  return (
    <Dialog open onClose={save.pending ? undefined : onClose} fullWidth maxWidth="sm">
      <DialogTitle>Pickup pin for {shop.name}</DialogTitle>
      <DialogContent>
        <Stack spacing={2} sx={{ pt: 1 }}>
          {save.error ? <ApiError error={save.error} /> : null}
          <PickupPicker value={pickup} onChange={setPickup} addressRequired={false} />
        </Stack>
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose} disabled={save.pending}>
          Cancel
        </Button>
        <Button
          variant="contained"
          onClick={() => void save.submit()}
          disabled={!hasCoordinates(pickup) || save.pending}
        >
          {save.pending ? 'Saving…' : 'Save pin'}
        </Button>
      </DialogActions>
    </Dialog>
  );
}

function RejectDialog({ shop, onClose }: { shop: WireShop; onClose: () => void }) {
  const [reason, setReason] = useState('');
  const [review] = useReviewAdminShopMutation();
  const reject = useGuardedAction({
    run: (_: undefined, key: string) =>
      review({
        shopId: shop._id,
        expectedVersion: shop.version,
        decision: 'REJECTED',
        reason: reason.trim(),
        idempotencyKey: key,
      }).unwrap(),
    successMessage: `${shop.name} was not approved. The owner sees your reason.`,
    onSuccess: onClose,
  });
  function submit(event: FormEvent) {
    event.preventDefault();
    if (reason.trim()) void reject.submit();
  }
  return (
    <Dialog open onClose={reject.pending ? undefined : onClose} fullWidth maxWidth="sm">
      <form onSubmit={submit}>
        <DialogTitle>Reject {shop.name}</DialogTitle>
        <DialogContent>
          <Stack spacing={2} sx={{ pt: 1 }}>
            {reject.error ? <ApiError error={reject.error} /> : null}
            <TextField
              required
              autoFocus
              label="Reason the owner will see"
              value={reason}
              onChange={(event) => setReason(event.target.value)}
              multiline
              minRows={2}
            />
          </Stack>
        </DialogContent>
        <DialogActions>
          <Button onClick={onClose} disabled={reject.pending}>
            Cancel
          </Button>
          <Button
            type="submit"
            color="error"
            variant="contained"
            disabled={!reason.trim() || reject.pending}
          >
            {reject.pending ? 'Saving…' : 'Reject'}
          </Button>
        </DialogActions>
      </form>
    </Dialog>
  );
}

/** Admin-only: an unusual item gets an explicit size; everything else is bike-sized. */
function DeliverySizeDialog({
  shopId,
  item,
  onClose,
}: {
  shopId: string;
  item: WireFoodItem;
  onClose: () => void;
}) {
  const size = item.deliverySize;
  const [weight, setWeight] = useState(size ? String(size.weightGrams) : '');
  const [length, setLength] = useState(size ? String(size.dimensionsCm.length) : '');
  const [width, setWidth] = useState(size ? String(size.dimensionsCm.width) : '');
  const [height, setHeight] = useState(size ? String(size.dimensionsCm.height) : '');
  const [profileVersion, setProfileVersion] = useState(size ? String(size.profileVersion) : '1');
  const [setSize] = useSetAdminItemDeliverySizeMutation();
  const numbers = [weight, length, width, height, profileVersion].map(Number);
  const valid = numbers.every((value) => Number.isFinite(value) && value > 0);
  const save = useGuardedAction({
    run: (explicit: boolean | undefined, key: string) =>
      setSize({
        shopId,
        itemId: item._id,
        expectedVersion: item.version,
        deliverySize: explicit
          ? {
              weightGrams: numbers[0],
              dimensionsCm: { length: numbers[1], width: numbers[2], height: numbers[3] },
              profileVersion: numbers[4],
            }
          : null,
        idempotencyKey: key,
      }).unwrap(),
    successMessage: 'Delivery size saved.',
    onSuccess: onClose,
  });
  const field = (label: string, value: string, set: (value: string) => void) => (
    <TextField
      label={label}
      value={value}
      onChange={(event) => set(event.target.value)}
      type="number"
      slotProps={{ htmlInput: { min: 0, step: 'any' } }}
    />
  );
  return (
    <Dialog open onClose={save.pending ? undefined : onClose} fullWidth maxWidth="sm">
      <DialogTitle>Delivery size: {item.name}</DialogTitle>
      <DialogContent>
        <Stack spacing={2} sx={{ pt: 1 }}>
          <Typography variant="body2">
            Owners never see this. Items without a size count as one standard bike-sized unit; set
            one only for an unusual item.
          </Typography>
          {save.error ? <ApiError error={save.error} /> : null}
          {field('Packaged weight (g)', weight, setWeight)}
          <Stack direction="row" spacing={1.5}>
            {field('Length (cm)', length, setLength)}
            {field('Width (cm)', width, setWidth)}
            {field('Height (cm)', height, setHeight)}
          </Stack>
          {field('Packing profile version', profileVersion, setProfileVersion)}
        </Stack>
      </DialogContent>
      <DialogActions sx={{ flexWrap: 'wrap', gap: 1 }}>
        {size ? (
          <Button
            onClick={() => void save.submit(false)}
            disabled={save.pending}
            sx={{ mr: 'auto' }}
          >
            Use standard bike size
          </Button>
        ) : null}
        <Button onClick={onClose} disabled={save.pending}>
          Cancel
        </Button>
        <Button
          variant="contained"
          onClick={() => void save.submit(true)}
          disabled={!valid || save.pending}
        >
          {save.pending ? 'Saving…' : 'Save size'}
        </Button>
      </DialogActions>
    </Dialog>
  );
}

/** The big-order threshold for one town (default 10 items). */
export function BigOrderSettingCard() {
  const { townId: scoped, towns } = useTownScope();
  const [chosen, setChosen] = useState('');
  const townId = scoped ?? (chosen || (towns.length === 1 ? towns[0].id : ''));
  return (
    <Card variant="outlined">
      <CardContent>
        <Stack spacing={1.5}>
          <Typography variant="h3">Big orders</Typography>
          <Typography variant="body2" color="text.secondary">
            Orders with more items than this are not offered to riders automatically. They appear in
            operator alerts so transport can be arranged.
          </Typography>
          {!scoped && towns.length > 1 ? (
            <TextField
              select
              size="small"
              label="Town"
              value={chosen}
              onChange={(event) => setChosen(event.target.value)}
              sx={{ maxWidth: 240 }}
            >
              {towns.map((town) => (
                <MenuItem key={town.id} value={town.id}>
                  {town.name}
                </MenuItem>
              ))}
            </TextField>
          ) : null}
          {townId ? <ThresholdForm key={townId} townId={townId} /> : null}
        </Stack>
      </CardContent>
    </Card>
  );
}

function ThresholdForm({ townId }: { townId: string }) {
  const settings = useGetFoodTownSettingsQuery(townId);
  const [value, setValue] = useState<string>();
  const [update] = useUpdateFoodTownSettingsMutation();
  const current = value ?? (settings.data ? String(settings.data.bigOrderItemThreshold) : '');
  const parsed = Number(current);
  const valid = Number.isInteger(parsed) && parsed >= 1 && parsed <= 1000;
  const save = useGuardedAction({
    run: (_: undefined, key: string) =>
      update({
        townId,
        expectedVersion: settings.data!.version,
        bigOrderItemThreshold: parsed,
        idempotencyKey: key,
      }).unwrap(),
    successMessage: 'Big-order threshold saved.',
    onSuccess: () => setValue(undefined),
  });
  if (settings.isLoading) return <Typography variant="body2">Loading…</Typography>;
  if (settings.error)
    return (
      <ApiError
        error={settings.error as NormalizedApiError}
        onRetry={() => void settings.refetch()}
      />
    );
  return (
    <Stack direction="row" spacing={1.5} sx={{ alignItems: 'flex-start' }}>
      <TextField
        size="small"
        label="Items per order"
        type="number"
        value={current}
        onChange={(event) => setValue(event.target.value)}
        error={!valid}
        helperText={valid ? 'Default 10' : 'Enter a whole number from 1 to 1000.'}
        slotProps={{ htmlInput: { min: 1, max: 1000, step: 1 } }}
        sx={{ maxWidth: 180 }}
      />
      <Button
        variant="outlined"
        onClick={() => void save.submit()}
        disabled={!valid || value === undefined || save.pending}
      >
        {save.pending ? 'Saving…' : 'Save'}
      </Button>
      {save.error ? <ApiError error={save.error} /> : null}
    </Stack>
  );
}
