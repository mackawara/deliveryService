import PlaceIcon from '@mui/icons-material/Place';
import StorefrontIcon from '@mui/icons-material/Storefront';
import Accordion from '@mui/material/Accordion';
import AccordionDetails from '@mui/material/AccordionDetails';
import AccordionSummary from '@mui/material/AccordionSummary';
import ExpandMoreIcon from '@mui/icons-material/ExpandMore';
import Avatar from '@mui/material/Avatar';
import Button from '@mui/material/Button';
import Card from '@mui/material/Card';
import CardContent from '@mui/material/CardContent';
import FormControlLabel from '@mui/material/FormControlLabel';
import Stack from '@mui/material/Stack';
import Switch from '@mui/material/Switch';
import TextField from '@mui/material/TextField';
import Typography from '@mui/material/Typography';
import { useState } from 'react';
import { Link as RouterLink, useParams } from 'react-router-dom';

import type { WireShop } from '@/api/dto/shop';
import {
  useGetShopQuery,
  useUpdateShopMutation,
  useUploadShopImageMutation,
} from '@/api/endpoints/shop';
import type { NormalizedApiError } from '@/api/errors';
import { ApiError } from '@/components/ApiError';
import { useGuardedAction } from '@/lib/useGuardedAction';
import { OwnerCustomerPaymentsPanel } from '../CustomerPaymentsPanel';
import { ShopContactVerification } from '../ShopContactVerification';
import { readImageBase64, shopImage } from '../shopUtils';

/** The owner's shop details in plain words: no branch, settlement or packing terms. */
export function SimpleShopProfilePage() {
  const { shopId = '' } = useParams();
  const shop = useGetShopQuery(shopId, { skip: !shopId });
  if (shop.isLoading) return <Typography>Loading your shop…</Typography>;
  if (shop.error)
    return (
      <ApiError error={shop.error as NormalizedApiError} onRetry={() => void shop.refetch()} />
    );
  if (!shop.data) return null;
  return <Profile key={`${shop.data._id}:${shop.data.version}`} shop={shop.data} />;
}

function Profile({ shop }: { shop: WireShop }) {
  const [name, setName] = useState(shop.name);
  const [phone, setPhone] = useState(shop.contactPhone);
  const [updateShop] = useUpdateShopMutation();
  const [uploadImage] = useUploadShopImageMutation();
  const update = useGuardedAction({
    run: (
      patch: { name?: string; contactPhone?: string; isOpen?: boolean } | undefined,
      key: string,
    ) =>
      updateShop({
        shopId: shop._id,
        expectedVersion: shop.version,
        ...patch,
        idempotencyKey: key,
      }).unwrap(),
    successMessage: 'Saved.',
  });
  const photo = useGuardedAction({
    run: async (file: File | undefined, key: string) =>
      uploadImage({
        shopId: shop._id,
        expectedVersion: shop.version,
        base64: await readImageBase64(file!),
        idempotencyKey: key,
      }).unwrap(),
    successMessage: 'Shop photo saved.',
  });
  const approved = shop.approvalState === 'APPROVED';
  const verified = shop.whatsappOptIn && shop.whatsappConsent?.phone === shop.contactPhone;
  return (
    <Stack spacing={2.5} sx={{ maxWidth: 640, mx: 'auto' }}>
      <Typography variant="h1">Your shop</Typography>
      {update.error ? <ApiError error={update.error} /> : null}
      {photo.error ? <ApiError error={photo.error} /> : null}
      <Card>
        <CardContent>
          <Stack spacing={2.5}>
            <Stack direction="row" spacing={2} sx={{ alignItems: 'center' }}>
              <Avatar src={shopImage(shop)} variant="rounded" sx={{ width: 72, height: 72 }}>
                <StorefrontIcon />
              </Avatar>
              <Button
                component="label"
                variant="outlined"
                disabled={photo.pending}
                sx={{ minHeight: 44 }}
              >
                {photo.pending
                  ? 'Saving photo…'
                  : shopImage(shop)
                    ? 'Change shop photo'
                    : 'Add a shop photo'}
                <input
                  hidden
                  type="file"
                  accept="image/jpeg,image/png"
                  aria-label="Shop photo"
                  onChange={(event) => {
                    const file = event.target.files?.[0];
                    event.target.value = '';
                    if (file) void photo.submit(file);
                  }}
                />
              </Button>
            </Stack>
            <Stack direction="row" spacing={1} sx={{ alignItems: 'flex-start' }}>
              <TextField
                fullWidth
                label="Shop name"
                value={name}
                onChange={(event) => setName(event.target.value)}
                slotProps={{ htmlInput: { maxLength: 100 } }}
              />
              <Button
                onClick={() => void update.submit({ name: name.trim() })}
                disabled={!name.trim() || name.trim() === shop.name || update.pending}
                sx={{ minHeight: 56 }}
              >
                Save
              </Button>
            </Stack>
            <FormControlLabel
              sx={{ minHeight: 44, ml: 0, justifyContent: 'space-between' }}
              labelPlacement="start"
              control={
                <Switch
                  checked={shop.isOpen}
                  disabled={update.pending || (!shop.isOpen && (!approved || !verified))}
                  onChange={(event) => void update.submit({ isOpen: event.target.checked })}
                />
              }
              label={
                <Stack>
                  <span>Open for orders</span>
                  <Typography variant="body2" color="text.secondary">
                    {approved
                      ? 'Customers can order while this is on.'
                      : 'You can open once your shop is approved.'}
                  </Typography>
                </Stack>
              }
            />
          </Stack>
        </CardContent>
      </Card>
      <Card>
        <CardContent>
          <Stack spacing={1.5}>
            <Stack direction="row" spacing={1} sx={{ alignItems: 'center' }}>
              <PlaceIcon color={shop.pickup ? 'primary' : 'disabled'} aria-hidden />
              <Typography variant="h2">Where riders collect orders</Typography>
            </Stack>
            <Typography>
              {shop.pickup
                ? shop.pickup.addressLine || 'Your pin is set.'
                : 'Not pinned yet. Riders need this to find your shop.'}
            </Typography>
            <Button
              variant="outlined"
              component={RouterLink}
              to={`/shop/${shop._id}/pin`}
              sx={{ alignSelf: 'flex-start', minHeight: 44 }}
            >
              {shop.pickup ? 'Move the pin' : 'Set the pin'}
            </Button>
          </Stack>
        </CardContent>
      </Card>
      <Card>
        <CardContent>
          <Stack spacing={1.5}>
            <Typography variant="h2">Order messages</Typography>
            <Typography>
              We send new orders to WhatsApp <strong>{shop.contactPhone}</strong>.
            </Typography>
            <Accordion variant="outlined" disableGutters>
              <AccordionSummary expandIcon={<ExpandMoreIcon />} sx={{ minHeight: 48 }}>
                Use a different WhatsApp number
              </AccordionSummary>
              <AccordionDetails>
                <Stack spacing={1.5}>
                  <TextField
                    label="WhatsApp number for orders"
                    value={phone}
                    onChange={(event) => setPhone(event.target.value)}
                    slotProps={{ htmlInput: { inputMode: 'tel' } }}
                  />
                  <Button
                    variant="outlined"
                    onClick={() => void update.submit({ contactPhone: phone.trim() })}
                    disabled={!phone.trim() || phone.trim() === shop.contactPhone || update.pending}
                    sx={{ alignSelf: 'flex-start', minHeight: 44 }}
                  >
                    Save number
                  </Button>
                  {verified ? null : <ShopContactVerification shop={shop} />}
                </Stack>
              </AccordionDetails>
            </Accordion>
          </Stack>
        </CardContent>
      </Card>
      <OwnerCustomerPaymentsPanel shopId={shop._id} />
    </Stack>
  );
}
