import PlaceIcon from '@mui/icons-material/Place';
import Button from '@mui/material/Button';
import Card from '@mui/material/Card';
import CardContent from '@mui/material/CardContent';
import Stack from '@mui/material/Stack';
import Typography from '@mui/material/Typography';
import { useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';

import type { WireShop } from '@/api/dto/shop';
import {
  useGetShopQuery,
  useListShopTownsQuery,
  useUpdateShopMutation,
} from '@/api/endpoints/shop';
import type { NormalizedApiError } from '@/api/errors';
import { ApiError } from '@/components/ApiError';
import { useGuardedAction } from '@/lib/useGuardedAction';
import { PickupPicker } from '../PickupPicker';
import { hasCoordinates, type PickupDraft } from '../pickup';
import { PIN_REASON } from './copy';

function draftFrom(shop: WireShop): PickupDraft {
  return shop.pickup
    ? {
        lat: String(shop.pickup.point.coordinates[1]),
        lng: String(shop.pickup.point.coordinates[0]),
        address: shop.pickup.addressLine,
      }
    : { lat: '', lng: '', address: '' };
}

/** "Where is your shop?": asked straight after signup, never required (issue 34). */
export function ShopPinPage() {
  const { shopId = '' } = useParams();
  const shop = useGetShopQuery(shopId, { skip: !shopId });
  if (shop.isLoading) return <Typography>Loading…</Typography>;
  if (shop.error)
    return (
      <ApiError error={shop.error as NormalizedApiError} onRetry={() => void shop.refetch()} />
    );
  if (!shop.data) return null;
  return <PinForm key={shop.data._id} shop={shop.data} />;
}

function PinForm({ shop }: { shop: WireShop }) {
  const navigate = useNavigate();
  const towns = useListShopTownsQuery();
  const [pickup, setPickup] = useState(() => draftFrom(shop));
  const [updateShop] = useUpdateShopMutation();
  const catalogue = `/shop/${shop._id}/catalogue`;
  const save = useGuardedAction({
    run: (_: undefined, key: string) =>
      updateShop({
        shopId: shop._id,
        expectedVersion: shop.version,
        pickup: {
          lat: Number(pickup.lat),
          lng: Number(pickup.lng),
          address: pickup.address.trim(),
        },
        idempotencyKey: key,
      }).unwrap(),
    successMessage: 'Your shop is on the map.',
    onSuccess: () => navigate(catalogue),
  });
  return (
    <Stack spacing={3} sx={{ maxWidth: 640, mx: 'auto' }}>
      <Stack direction="row" spacing={1.5} sx={{ alignItems: 'center' }}>
        <PlaceIcon color="primary" />
        <Typography variant="h1">Where is your shop?</Typography>
      </Stack>
      <Card>
        <CardContent>
          <Stack spacing={2.5}>
            <Typography>{PIN_REASON}</Typography>
            <PickupPicker
              value={pickup}
              onChange={setPickup}
              town={towns.data?.find((town) => town._id === shop.townId)}
              addressRequired={false}
            />
            {save.error ? <ApiError error={save.error} /> : null}
            <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1.5}>
              <Button
                variant="contained"
                size="large"
                onClick={() => void save.submit()}
                disabled={!hasCoordinates(pickup) || save.pending}
                sx={{ minHeight: 48 }}
              >
                {save.pending ? 'Saving…' : 'Save my pin'}
              </Button>
              <Button
                size="large"
                onClick={() => navigate(catalogue)}
                disabled={save.pending}
                sx={{ minHeight: 48 }}
              >
                Skip for now
              </Button>
            </Stack>
          </Stack>
        </CardContent>
      </Card>
    </Stack>
  );
}
