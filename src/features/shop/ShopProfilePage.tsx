import CloudUploadIcon from '@mui/icons-material/CloudUpload';
import LockClockIcon from '@mui/icons-material/LockClock';
import SaveIcon from '@mui/icons-material/Save';
import StorefrontIcon from '@mui/icons-material/Storefront';
import Alert from '@mui/material/Alert';
import Avatar from '@mui/material/Avatar';
import Button from '@mui/material/Button';
import Card from '@mui/material/Card';
import CardContent from '@mui/material/CardContent';
import Chip from '@mui/material/Chip';
import Divider from '@mui/material/Divider';
import MenuItem from '@mui/material/MenuItem';
import Stack from '@mui/material/Stack';
import Switch from '@mui/material/Switch';
import TextField from '@mui/material/TextField';
import Typography from '@mui/material/Typography';
import { useState } from 'react';
import { useParams } from 'react-router-dom';

import type { WireSettlementPolicy, WireShop } from '@/api/dto/shop';
import {
  useGetShopQuery,
  useGetShopTermsQuery,
  useRequestShopTermsMutation,
  useUpdateShopMutation,
  useUploadShopImageMutation,
} from '@/api/endpoints/shop';
import type { NormalizedApiError } from '@/api/errors';
import { ApiError } from '@/components/ApiError';
import { PageHeader } from '@/components/PageHeader';
import { newIdempotencyKey } from '@/lib/idempotency';
import { readImageBase64 } from '@/features/shop/shopUtils';
import { shopImage } from '@/features/shop/shopUtils';

function ProfileEditor({
  shopId,
  record,
  onSaved,
}: {
  shopId: string;
  record: WireShop;
  onSaved: () => void;
}) {
  const [updateShop, updateState] = useUpdateShopMutation();
  const [name, setName] = useState(record.name);
  const [branchName, setBranchName] = useState(record.branchName ?? '');
  const [phone, setPhone] = useState(record.contactPhone);
  const [address, setAddress] = useState(record.pickup.addressLine);
  const [lat, setLat] = useState(String(record.pickup.point.coordinates[1]));
  const [lng, setLng] = useState(String(record.pickup.point.coordinates[0]));
  const [open, setOpen] = useState(record.isOpen);
  const [error, setError] = useState<NormalizedApiError>();

  async function save(patch: { isOpen?: boolean } = {}) {
    setError(undefined);
    try {
      await updateShop({
        shopId,
        expectedVersion: record.version,
        name: name.trim(),
        branchName: branchName.trim() || undefined,
        contactPhone: phone.trim(),
        pickup: { lat: Number(lat), lng: Number(lng), address: address.trim() },
        ...patch,
        idempotencyKey: newIdempotencyKey(),
      }).unwrap();
      onSaved();
    } catch (caught) {
      setError(caught as NormalizedApiError);
    }
  }

  return (
    <>
      {error ? <ApiError error={error} /> : null}
      <TextField
        required
        label="Business name"
        value={name}
        onChange={(event) => setName(event.target.value)}
        fullWidth
      />
      <TextField
        label="Branch label"
        value={branchName}
        onChange={(event) => setBranchName(event.target.value)}
        fullWidth
      />
      <TextField
        required
        label="Contact phone"
        value={phone}
        onChange={(event) => setPhone(event.target.value)}
        fullWidth
      />
      <TextField
        required
        label="Short pickup address"
        value={address}
        onChange={(event) => setAddress(event.target.value)}
        fullWidth
      />
      <Stack direction={{ xs: 'column', sm: 'row' }} spacing={2}>
        <TextField
          fullWidth
          label="Latitude"
          type="number"
          value={lat}
          onChange={(event) => setLat(event.target.value)}
          slotProps={{ htmlInput: { step: 'any' } }}
        />
        <TextField
          fullWidth
          label="Longitude"
          type="number"
          value={lng}
          onChange={(event) => setLng(event.target.value)}
          slotProps={{ htmlInput: { step: 'any' } }}
        />
      </Stack>
      <Button
        variant="contained"
        startIcon={<SaveIcon />}
        onClick={() => void save()}
        disabled={updateState.isLoading || !name.trim() || !phone.trim() || !address.trim()}
      >
        {updateState.isLoading ? 'Saving…' : 'Save profile'}
      </Button>
      <Divider />
      <Stack direction="row" sx={{ justifyContent: 'space-between', alignItems: 'center' }}>
        <Stack>
          <Typography variant="subtitle2">Open for orders</Typography>
          <Typography variant="body2" color="text.secondary">
            Opening does not bypass approval.
          </Typography>
        </Stack>
        <Switch
          checked={open}
          onChange={(event) => {
            setOpen(event.target.checked);
            void save({ isOpen: event.target.checked });
          }}
          slotProps={{ input: { 'aria-label': 'Open branch for orders' } }}
        />
      </Stack>
    </>
  );
}

function TermsEditor({
  shopId,
  record,
  currentTerms,
  onChanged,
}: {
  shopId: string;
  record: WireShop;
  currentTerms: WireSettlementPolicy | undefined;
  onChanged: () => void;
}) {
  const [requestTerms, state] = useRequestShopTermsMutation();
  const [frequency, setFrequency] = useState(
    currentTerms?.schedule.frequency ?? record.requestedSettlement?.frequency ?? 'DAILY',
  );
  const [timezone, setTimezone] = useState(
    currentTerms?.schedule.timezone ?? record.requestedSettlement?.timezone ?? 'Africa/Harare',
  );
  const [cutoffTime, setCutoffTime] = useState(
    currentTerms?.schedule.cutoffTime ?? record.requestedSettlement?.cutoffTime ?? '22:00',
  );
  const [error, setError] = useState<NormalizedApiError>();

  async function submitSchedule() {
    setError(undefined);
    try {
      await requestTerms({
        shopId,
        expectedVersion: record.version,
        schedule: { frequency, timezone, cutoffTime },
        idempotencyKey: newIdempotencyKey(),
      }).unwrap();
      onChanged();
    } catch (caught) {
      setError(caught as NormalizedApiError);
    }
  }

  async function acknowledge() {
    if (!currentTerms?._id) return;
    setError(undefined);
    try {
      await requestTerms({
        shopId,
        expectedVersion: record.version,
        acknowledgeTermsId: currentTerms._id,
        idempotencyKey: newIdempotencyKey(),
      }).unwrap();
      onChanged();
    } catch (caught) {
      setError(caught as NormalizedApiError);
    }
  }

  return (
    <Stack spacing={1.5}>
      {error ? <ApiError error={error} /> : null}
      <TextField
        select
        label="Requested frequency"
        value={frequency}
        onChange={(event) => setFrequency(event.target.value as typeof frequency)}
        size="small"
      >
        {['DAILY', 'WEEKLY', 'MONTHLY'].map((value) => (
          <MenuItem key={value} value={value}>
            {value}
          </MenuItem>
        ))}
      </TextField>
      <Stack direction="row" spacing={1}>
        <TextField
          fullWidth
          label="Timezone"
          value={timezone}
          onChange={(event) => setTimezone(event.target.value)}
          size="small"
        />
        <TextField
          fullWidth
          label="Cut-off"
          type="time"
          value={cutoffTime}
          onChange={(event) => setCutoffTime(event.target.value)}
          size="small"
          slotProps={{ inputLabel: { shrink: true } }}
        />
      </Stack>
      <Button variant="outlined" onClick={() => void submitSchedule()} disabled={state.isLoading}>
        {state.isLoading ? 'Sending…' : 'Request schedule'}
      </Button>
      {currentTerms && currentTerms._id && currentTerms.status !== 'AGREED' ? (
        <Button variant="contained" onClick={() => void acknowledge()} disabled={state.isLoading}>
          Acknowledge latest terms
        </Button>
      ) : null}
    </Stack>
  );
}

export function ShopProfilePage() {
  const { shopId = '' } = useParams();
  const shop = useGetShopQuery(shopId, { skip: !shopId });
  const terms = useGetShopTermsQuery(shopId, { skip: !shopId });
  const [uploadImage, uploadState] = useUploadShopImageMutation();
  const [error, setError] = useState<NormalizedApiError | undefined>();
  const [notice, setNotice] = useState('');

  async function upload(file: File) {
    if (!shop.data) return;
    setError(undefined);
    try {
      const base64 = await readImageBase64(file);
      await uploadImage({
        shopId,
        expectedVersion: shop.data.version,
        base64,
        idempotencyKey: newIdempotencyKey(),
      }).unwrap();
      setNotice('Branch thumbnail uploaded.');
      await shop.refetch();
    } catch (caught) {
      setError(caught as NormalizedApiError);
    }
  }

  if (shop.isLoading) return <Typography>Loading branch…</Typography>;
  if (shop.error)
    return (
      <ApiError error={shop.error as NormalizedApiError} onRetry={() => void shop.refetch()} />
    );
  if (!shop.data) return null;
  const record = shop.data;
  const currentTerms = terms.data?.terms?.at(-1);
  return (
    <Stack spacing={3}>
      <PageHeader
        title={record.branchName ? `${record.name} · ${record.branchName}` : record.name}
        description="Profile, pickup location and customer visibility"
        crumbs={[{ label: 'Shop owner' }, { label: 'Profile' }]}
      />
      {notice ? <Alert severity="success">{notice}</Alert> : null}
      {error ? <ApiError error={error} /> : null}
      <Stack direction={{ xs: 'column', lg: 'row' }} spacing={3} sx={{ alignItems: 'flex-start' }}>
        <Card sx={{ flex: 1, width: '100%' }}>
          <CardContent>
            <Stack spacing={2.5}>
              <Stack direction="row" spacing={2} sx={{ alignItems: 'center' }}>
                <Avatar src={shopImage(record)} variant="rounded" sx={{ width: 72, height: 72 }}>
                  <StorefrontIcon />
                </Avatar>
                <Stack>
                  <Typography variant="h2">Branch profile</Typography>
                  <Typography variant="body2" color="text.secondary">
                    Version {record.version} · changes are checked against the latest record.
                  </Typography>
                </Stack>
              </Stack>
              <Button
                component="label"
                variant="outlined"
                startIcon={<CloudUploadIcon />}
                disabled={uploadState.isLoading}
                sx={{ alignSelf: 'flex-start' }}
              >
                {uploadState.isLoading ? 'Processing image…' : 'Upload thumbnail'}
                <input
                  hidden
                  type="file"
                  accept="image/jpeg,image/png"
                  onChange={(event) => {
                    const file = event.target.files?.[0];
                    event.target.value = '';
                    if (file) void upload(file);
                  }}
                />
              </Button>
              <ProfileEditor
                key={`${record._id}:${record.version}`}
                shopId={shopId}
                record={record}
                onSaved={() => {
                  setNotice('Branch profile saved.');
                  void shop.refetch();
                }}
              />
            </Stack>
          </CardContent>
        </Card>
        <Stack spacing={3} sx={{ width: { xs: '100%', lg: 360 } }}>
          <Card>
            <CardContent>
              <Stack spacing={2}>
                <Typography variant="h2">Customer visibility</Typography>
                <Stack direction="row" spacing={1} sx={{ alignItems: 'center' }}>
                  <Chip
                    size="small"
                    label={record.approvalState}
                    color={record.approvalState === 'APPROVED' ? 'success' : 'warning'}
                  />
                  <Typography variant="body2">
                    {record.approvalReason ?? 'Awaiting admin review.'}
                  </Typography>
                </Stack>
                {record.approvalState !== 'APPROVED' ? (
                  <Alert severity="info">
                    Customers cannot discover this branch until the location, catalogue and terms
                    are approved.
                  </Alert>
                ) : null}
              </Stack>
            </CardContent>
          </Card>
          <Card variant="outlined">
            <CardContent>
              <Stack spacing={1.5}>
                <Stack direction="row" spacing={1} sx={{ alignItems: 'center' }}>
                  <LockClockIcon color="action" />
                  <Typography variant="h2">Settlement terms</Typography>
                </Stack>
                {currentTerms ? (
                  <>
                    <Typography variant="body2">
                      {currentTerms.schedule.frequency} · cutoff {currentTerms.schedule.cutoffTime}
                    </Typography>
                    <Typography variant="body2" color="text.secondary">
                      {currentTerms.schedule.timezone}
                      {currentTerms.schedule.periodAnchor !== undefined
                        ? ` · anchor ${currentTerms.schedule.periodAnchor}`
                        : ''}
                    </Typography>
                    <Typography variant="body2">
                      Commission: {(currentTerms.basisPoints / 100).toFixed(2)}% ·{' '}
                      {currentTerms.status}
                    </Typography>
                  </>
                ) : (
                  <Typography variant="body2" color="text.secondary">
                    No agreed terms yet. The admin review will propose the commercial policy.
                  </Typography>
                )}
                <Divider />
                <Typography variant="body2" color="text.secondary">
                  Request a schedule during onboarding, or acknowledge the exact current proposal
                  after admin review.
                </Typography>
                <TermsEditor
                  key={`${record.version}:${currentTerms?._id ?? 'none'}`}
                  shopId={shopId}
                  record={record}
                  currentTerms={currentTerms}
                  onChanged={() => {
                    setNotice('Settlement request saved.');
                    void shop.refetch();
                    void terms.refetch();
                  }}
                />
              </Stack>
            </CardContent>
          </Card>
        </Stack>
      </Stack>
    </Stack>
  );
}
