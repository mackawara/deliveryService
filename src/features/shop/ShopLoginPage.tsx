import Alert from '@mui/material/Alert';
import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import Card from '@mui/material/Card';
import CardContent from '@mui/material/CardContent';
import Checkbox from '@mui/material/Checkbox';
import FormControlLabel from '@mui/material/FormControlLabel';
import MenuItem from '@mui/material/MenuItem';
import Stack from '@mui/material/Stack';
import TextField from '@mui/material/TextField';
import Typography from '@mui/material/Typography';
import { useEffect, useRef, useState, type FormEvent } from 'react';
import { Link as RouterLink, useNavigate, useSearchParams } from 'react-router-dom';

import type { WireOtpChallenge } from '@/api/dto/session';
import {
  useRequestShopOtpMutation,
  useResendShopOtpMutation,
  useVerifyShopOtpMutation,
} from '@/api/endpoints/shop';
import type { NormalizedApiError } from '@/api/errors';
import { appConfig } from '@/config';
import { safeReturnPath } from '@/auth/returnPath';
import { COUNTRY_CODES, looksLikePhone, toSubmittablePhone } from '@/lib/phone';
import { ActionKey } from '@/lib/idempotency';

const ACKNOWLEDGEMENT = 'If this number is eligible, a code will arrive on WhatsApp.';

function messageFor(error: NormalizedApiError | undefined): string {
  if (!error) return '';
  if (error.kind === 'rateLimited' && error.retryAfterSeconds) {
    return `Too many attempts. Try again in ${error.retryAfterSeconds} seconds.`;
  }
  return error.message;
}

export function ShopLoginPage({ mode = 'login' }: { mode?: 'login' | 'signup' }) {
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const [step, setStep] = useState<'phone' | 'code'>('phone');
  const [countryCode, setCountryCode] = useState(appConfig.defaultPhoneCountry);
  const [phone, setPhone] = useState('');
  const [consent, setConsent] = useState(false);
  const [code, setCode] = useState('');
  const [challenge, setChallenge] = useState<WireOtpChallenge | null>(null);
  const [seconds, setSeconds] = useState(0);
  const [resendSeconds, setResendSeconds] = useState(0);
  const [formError, setFormError] = useState('');
  const requestKey = useRef(new ActionKey());
  const [requestOtp, requestState] = useRequestShopOtpMutation();
  const [resendOtp, resendState] = useResendShopOtpMutation();
  const [verifyOtp, verifyState] = useVerifyShopOtpMutation();

  useEffect(() => {
    if (!challenge) return undefined;
    const tick = () => {
      setSeconds(Math.max(0, Math.ceil((Date.parse(challenge.expiresAt) - Date.now()) / 1000)));
      setResendSeconds(
        Math.max(0, Math.ceil((Date.parse(challenge.resendAt) - Date.now()) / 1000)),
      );
    };
    tick();
    const timer = window.setInterval(tick, 1000);
    return () => window.clearInterval(timer);
  }, [challenge]);

  const returnTo = safeReturnPath(
    params.get('returnTo') ?? (mode === 'signup' ? '/shop/setup' : '/shop'),
  );

  async function submitPhone(event: FormEvent) {
    event.preventDefault();
    setFormError('');
    if (!looksLikePhone(countryCode, phone)) {
      setFormError('Enter a valid WhatsApp number.');
      return;
    }
    if (!consent) {
      setFormError('Confirm that a sign-in code may be sent to this WhatsApp number.');
      return;
    }
    try {
      const result = await requestOtp({
        phone: toSubmittablePhone(countryCode, phone),
        consent: true,
        requestKey: requestKey.current.next(),
      }).unwrap();
      setChallenge(result);
      setCode('');
      setStep('code');
    } catch (error) {
      setFormError(messageFor(error as NormalizedApiError));
    }
  }

  async function resend() {
    if (!challenge || resendSeconds > 0) return;
    setFormError('');
    try {
      const result = await resendOtp({
        challengeId: challenge.challengeId,
        requestKey: requestKey.current.next(),
      }).unwrap();
      setChallenge(result);
      setCode('');
    } catch (error) {
      setFormError(messageFor(error as NormalizedApiError));
    }
  }

  async function submitCode(event: FormEvent) {
    event.preventDefault();
    setFormError('');
    if (!challenge || !/^\d{6}$/.test(code)) {
      setFormError('Enter the six-digit code sent on WhatsApp.');
      return;
    }
    try {
      await verifyOtp({ challengeId: challenge.challengeId, code }).unwrap();
      navigate(returnTo, { replace: true });
    } catch (error) {
      setCode('');
      setFormError(messageFor(error as NormalizedApiError));
    }
  }

  const busy = requestState.isLoading || resendState.isLoading || verifyState.isLoading;
  return (
    <Box
      sx={{
        minHeight: '100vh',
        display: 'grid',
        placeItems: 'center',
        p: 2,
        bgcolor: 'background.default',
      }}
    >
      <Card sx={{ width: '100%', maxWidth: 460 }}>
        <CardContent sx={{ p: { xs: 3, sm: 4 } }}>
          <Stack spacing={3}>
            <Box>
              <Typography variant="h1" sx={{ fontSize: '1.5rem' }}>
                {mode === 'signup' ? 'Create your shop account' : 'Shop owner sign in'}
              </Typography>
              <Typography variant="body2" color="text.secondary">
                Manage branches and your customer catalogue with a WhatsApp code.
              </Typography>
            </Box>
            <Alert severity="info">{ACKNOWLEDGEMENT}</Alert>
            {formError ? (
              <Alert severity="error" role="alert">
                {formError}
              </Alert>
            ) : null}
            {step === 'phone' ? (
              <form onSubmit={submitPhone} noValidate>
                <Stack spacing={2}>
                  <Stack direction="row" spacing={1}>
                    <TextField
                      select
                      label="Country"
                      value={countryCode}
                      onChange={(event) => setCountryCode(event.target.value)}
                      sx={{ minWidth: 145 }}
                    >
                      {COUNTRY_CODES.map((entry) => (
                        <MenuItem key={entry.code} value={entry.code}>
                          {entry.label}
                        </MenuItem>
                      ))}
                    </TextField>
                    <TextField
                      fullWidth
                      required
                      label="WhatsApp number"
                      value={phone}
                      onChange={(event) => setPhone(event.target.value)}
                      autoComplete="tel"
                      inputMode="tel"
                    />
                  </Stack>
                  <FormControlLabel
                    control={
                      <Checkbox
                        checked={consent}
                        onChange={(event) => setConsent(event.target.checked)}
                      />
                    }
                    label="Send a sign-in code to this WhatsApp number."
                  />
                  <Button type="submit" variant="contained" disabled={busy}>
                    {requestState.isLoading ? 'Sending code…' : 'Continue'}
                  </Button>
                </Stack>
              </form>
            ) : (
              <form onSubmit={submitCode} noValidate>
                <Stack spacing={2}>
                  <Typography variant="body2">
                    Enter the code sent to {toSubmittablePhone(countryCode, phone)}.
                  </Typography>
                  <TextField
                    fullWidth
                    required
                    label="WhatsApp code"
                    value={code}
                    onChange={(event) => setCode(event.target.value.replace(/\D/g, '').slice(0, 6))}
                    inputMode="numeric"
                    autoComplete="one-time-code"
                    autoFocus
                  />
                  <Button type="submit" variant="contained" disabled={busy || seconds === 0}>
                    {verifyState.isLoading ? 'Verifying…' : 'Verify number'}
                  </Button>
                  <Stack direction="row" spacing={2} sx={{ justifyContent: 'space-between' }}>
                    <Button
                      type="button"
                      onClick={() => {
                        setStep('phone');
                        setChallenge(null);
                        setCode('');
                        setFormError('');
                      }}
                      disabled={busy}
                    >
                      Change number
                    </Button>
                    <Button
                      type="button"
                      onClick={() => void resend()}
                      disabled={busy || resendSeconds > 0}
                    >
                      {resendSeconds > 0 ? `Resend in ${resendSeconds}s` : 'Resend code'}
                    </Button>
                  </Stack>
                  {seconds === 0 ? (
                    <Typography color="warning.main" variant="body2">
                      This code expired. Request a new one.
                    </Typography>
                  ) : null}
                </Stack>
              </form>
            )}
            <Typography variant="body2" color="text.secondary" sx={{ textAlign: 'center' }}>
              {mode === 'signup' ? 'Already have an account? ' : 'New shop owner? '}
              <Button
                component={RouterLink}
                to={mode === 'signup' ? '/shop/login' : '/shop/signup'}
                size="small"
              >
                {mode === 'signup' ? 'Sign in' : 'Create an account'}
              </Button>
            </Typography>
          </Stack>
        </CardContent>
      </Card>
    </Box>
  );
}
