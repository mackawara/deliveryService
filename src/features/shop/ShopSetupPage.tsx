import AddBusinessIcon from '@mui/icons-material/AddBusiness';
import Button from '@mui/material/Button';
import Card from '@mui/material/Card';
import CardContent from '@mui/material/CardContent';
import Divider from '@mui/material/Divider';
import MenuItem from '@mui/material/MenuItem';
import Stack from '@mui/material/Stack';
import TextField from '@mui/material/TextField';
import Typography from '@mui/material/Typography';
import { useState } from 'react';
import { useNavigate } from 'react-router-dom';

import { useCreateShopMutation, useSubmitShopClaimMutation } from '@/api/endpoints/shop';
import type { NormalizedApiError } from '@/api/errors';
import { useGuardedAction } from '@/lib/useGuardedAction';

export function ShopSetupPage() {
  const navigate = useNavigate();
  const [name, setName] = useState('');
  const [branchName, setBranchName] = useState('');
  const [phone, setPhone] = useState('');
  const [townId, setTownId] = useState('');
  const [lat, setLat] = useState('');
  const [lng, setLng] = useState('');
  const [address, setAddress] = useState('');
  const [frequency, setFrequency] = useState<'DAILY' | 'WEEKLY' | 'MONTHLY'>('DAILY');
  const [timezone, setTimezone] = useState('Africa/Harare');
  const [cutoffTime, setCutoffTime] = useState('22:00');
  const [claimShopId, setClaimShopId] = useState('');
  const [evidence, setEvidence] = useState('');
  const [createShop] = useCreateShopMutation();
  const [submitClaim] = useSubmitShopClaimMutation();

  // Town options are read from the already-loaded staff configuration cache when present.
  const create = useGuardedAction({
    run: (_: undefined, key: string) =>
      createShop({
        name: name.trim(),
        branchName: branchName.trim() || undefined,
        contactPhone: phone.trim(),
        townId,
        pickup: { lat: Number(lat), lng: Number(lng), address: address.trim() },
        requestedSettlement: { frequency, timezone: timezone.trim(), cutoffTime },
        idempotencyKey: key,
      }).unwrap(),
    successMessage: 'Branch created. Add catalogue items while it awaits approval.',
    onSuccess: (shop) => navigate(`/shop/${shop._id}/catalogue`),
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
    name.trim() &&
    phone.trim() &&
    townId &&
    address.trim() &&
    lat.trim() &&
    lng.trim() &&
    Number.isFinite(Number(lat)) &&
    Number.isFinite(Number(lng)) &&
    timezone.trim();

  return (
    <Stack spacing={3} sx={{ maxWidth: 860, mx: 'auto' }}>
      <Stack direction="row" spacing={1.5} sx={{ alignItems: 'center' }}>
        <AddBusinessIcon color="primary" />
        <Stack>
          <Typography variant="h1">Set up a branch</Typography>
          <Typography color="text.secondary">Step 1 of 2 · business and location</Typography>
        </Stack>
      </Stack>
      <Card>
        <CardContent>
          <Stack spacing={2.5}>
            <Typography variant="h2">Branch details</Typography>
            <Typography variant="body2" color="text.secondary">
              A branch starts closed and pending. You can prepare its catalogue before approval.
            </Typography>
            <Stack direction={{ xs: 'column', sm: 'row' }} spacing={2}>
              <TextField
                fullWidth
                required
                label="Business name"
                value={name}
                onChange={(event) => setName(event.target.value)}
              />
              <TextField
                fullWidth
                label="Branch label"
                value={branchName}
                onChange={(event) => setBranchName(event.target.value)}
                helperText="For example, Town centre"
              />
            </Stack>
            <Stack direction={{ xs: 'column', sm: 'row' }} spacing={2}>
              <TextField
                fullWidth
                required
                label="Contact phone"
                value={phone}
                onChange={(event) => setPhone(event.target.value)}
                inputMode="tel"
              />
              <TextField
                fullWidth
                required
                label="Town ID"
                value={townId}
                onChange={(event) => setTownId(event.target.value)}
                helperText="Use the town identifier supplied by the delivery team."
              />
            </Stack>
            <TextField
              fullWidth
              required
              label="Short pickup address"
              value={address}
              onChange={(event) => setAddress(event.target.value)}
            />
            <Stack direction={{ xs: 'column', sm: 'row' }} spacing={2}>
              <TextField
                fullWidth
                required
                label="Latitude"
                value={lat}
                onChange={(event) => setLat(event.target.value)}
                type="number"
                slotProps={{ htmlInput: { step: 'any' } }}
              />
              <TextField
                fullWidth
                required
                label="Longitude"
                value={lng}
                onChange={(event) => setLng(event.target.value)}
                type="number"
                slotProps={{ htmlInput: { step: 'any' } }}
              />
            </Stack>
            <Divider />
            <Typography variant="h2">Settlement request</Typography>
            <Typography variant="body2" color="text.secondary">
              This is a request for admin review; no default weekly policy is assumed.
            </Typography>
            <Stack direction={{ xs: 'column', sm: 'row' }} spacing={2}>
              <TextField
                fullWidth
                select
                label="Frequency"
                value={frequency}
                onChange={(event) => setFrequency(event.target.value as typeof frequency)}
              >
                {['DAILY', 'WEEKLY', 'MONTHLY'].map((value) => (
                  <MenuItem key={value} value={value}>
                    {value[0] + value.slice(1).toLowerCase()}
                  </MenuItem>
                ))}
              </TextField>
              <TextField
                fullWidth
                label="Timezone"
                value={timezone}
                onChange={(event) => setTimezone(event.target.value)}
              />
              <TextField
                fullWidth
                label="Cut-off time"
                value={cutoffTime}
                onChange={(event) => setCutoffTime(event.target.value)}
                type="time"
                slotProps={{ inputLabel: { shrink: true } }}
              />
            </Stack>
            {create.error ? (
              <Typography color="error">{(create.error as NormalizedApiError).message}</Typography>
            ) : null}
            <Button
              variant="contained"
              onClick={() => void create.submit()}
              disabled={!valid || create.pending}
            >
              {' '}
              {create.pending ? 'Creating branch…' : 'Create branch'}{' '}
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
