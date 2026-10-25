import Alert from '@mui/material/Alert';
import Button from '@mui/material/Button';
import Checkbox from '@mui/material/Checkbox';
import FormControlLabel from '@mui/material/FormControlLabel';
import Stack from '@mui/material/Stack';
import TextField from '@mui/material/TextField';
import Typography from '@mui/material/Typography';
import { useState } from 'react';
import type { WireShop } from '@/api/dto/shop';
import type { WireOtpChallenge } from '@/api/dto/session';
import {
  useRequestShopContactOtpMutation,
  useVerifyShopContactOtpMutation,
} from '@/api/endpoints/shop';
import type { NormalizedApiError } from '@/api/errors';
import { ApiError } from '@/components/ApiError';
import { newIdempotencyKey } from '@/lib/idempotency';

export function ShopContactVerification({ shop }: { shop: WireShop }) {
  const [consent, setConsent] = useState(false);
  const [code, setCode] = useState('');
  const [challenge, setChallenge] = useState<WireOtpChallenge>();
  const [requestCode, requestState] = useRequestShopContactOtpMutation();
  const [verifyCode, verifyState] = useVerifyShopContactOtpMutation();
  const [error, setError] = useState<NormalizedApiError>();
  const [verifyKey, setVerifyKey] = useState('');
  const [requestKey, setRequestKey] = useState(newIdempotencyKey);
  if (shop.whatsappOptIn && shop.whatsappConsent?.phone === shop.contactPhone)
    return (
      <Alert severity="success">
        Order messages enabled for {shop.contactPhone}. Contact verified{' '}
        {new Date(shop.whatsappConsent.verifiedAt).toLocaleDateString()}.
      </Alert>
    );
  async function send() {
    setError(undefined);
    try {
      const result = await requestCode({
        shopId: shop._id,
        expectedVersion: shop.version,
        consent: true,
        idempotencyKey: requestKey,
      }).unwrap();
      setRequestKey(newIdempotencyKey());
      setChallenge(result);
      setVerifyKey(newIdempotencyKey());
      setCode('');
    } catch (caught) {
      setError(caught as NormalizedApiError);
    }
  }
  async function verify() {
    if (!challenge || !consent) return;
    setError(undefined);
    try {
      await verifyCode({
        shopId: shop._id,
        expectedVersion: shop.version,
        consent: true,
        challengeId: challenge.challengeId,
        code,
        idempotencyKey: verifyKey,
      }).unwrap();
    } catch (caught) {
      setError(caught as NormalizedApiError);
    }
  }
  return (
    <Stack spacing={2}>
      <Typography variant="h3">Verify branch WhatsApp</Typography>
      <Alert severity="warning">
        Orders stay unavailable until {shop.contactPhone} is verified for order requests, acceptance
        and READY updates.
      </Alert>
      <FormControlLabel
        control={
          <Checkbox checked={consent} onChange={(event) => setConsent(event.target.checked)} />
        }
        label={`The contact using ${shop.contactPhone} agrees to receive WhatsApp order requests and status messages for this branch. I have their permission to send a code and will ask them to confirm this agreement before sharing it.`}
      />
      <Button
        onClick={() => void send()}
        disabled={!consent || requestState.isLoading || verifyState.isLoading}
      >
        {challenge ? 'Send a new contact code' : 'Send contact verification code'}
      </Button>
      {challenge && (
        <>
          <TextField
            label="Branch contact code"
            value={code}
            onChange={(event) => {
              setCode(event.target.value);
              setVerifyKey(newIdempotencyKey());
            }}
            inputMode="numeric"
            autoComplete="one-time-code"
          />
          <Button
            variant="contained"
            onClick={() => void verify()}
            disabled={!consent || !/^\d{6}$/.test(code) || verifyState.isLoading}
          >
            Verify contact and record consent
          </Button>
        </>
      )}
      {error && <ApiError error={error} />}
    </Stack>
  );
}
