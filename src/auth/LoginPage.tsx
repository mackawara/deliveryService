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
import { useNavigate, useSearchParams } from 'react-router-dom';

import type { WireOtpChallenge } from '@/api/dto/session';
import {
  useRequestOtpMutation,
  useResendOtpMutation,
  useVerifyOtpMutation,
} from '@/api/endpoints/session';
import { fieldErrorMap, type NormalizedApiError } from '@/api/errors';
import { appConfig } from '@/config';
import { useAppDispatch, useAppSelector } from '@/app/hooks';
import { useAuth } from '@/auth/useAuth';
import { safeReturnPath } from '@/auth/returnPath';
import { sessionCleared } from '@/auth/sessionSlice';
import { formatCountdown } from '@/lib/datetime';
import { ActionKey } from '@/lib/idempotency';
import { COUNTRY_CODES, looksLikePhone, maskPhone, toSubmittablePhone } from '@/lib/phone';
import { useCountdown } from '@/lib/useCountdown';

/**
 * The acknowledgement is identical for unknown, disabled and eligible numbers, so the
 * screen can never disclose whether a number belongs to staff (specification 5.1).
 */
const NEUTRAL_ACKNOWLEDGEMENT =
  'If this number is registered and eligible, a code will arrive on WhatsApp.';

const CODE_LENGTH = 6;

function errorMessage(error: NormalizedApiError | undefined): string | null {
  if (!error) return null;
  if (error.kind === 'rateLimited') {
    return error.retryAfterSeconds
      ? `Too many attempts. Try again in ${error.retryAfterSeconds} seconds.`
      : 'Too many attempts. Wait a moment before trying again.';
  }
  return error.message;
}

export function LoginPage() {
  const navigate = useNavigate();
  const dispatch = useAppDispatch();
  const [searchParams] = useSearchParams();
  const { status, refresh } = useAuth();

  const [step, setStep] = useState<'phone' | 'code'>('phone');
  const [countryCode, setCountryCode] = useState(appConfig.defaultPhoneCountry);
  const [localNumber, setLocalNumber] = useState('');
  const [consent, setConsent] = useState(false);
  const [code, setCode] = useState('');
  const [challenge, setChallenge] = useState<WireOtpChallenge | null>(null);
  const [formError, setFormError] = useState<string | null>(null);
  const [acknowledged, setAcknowledged] = useState(false);

  // One request key per deliberate send, reused when retrying the same request so a
  // network retry never sends two WhatsApp messages.
  const requestKey = useRef(new ActionKey());

  const [requestOtp, requestState] = useRequestOtpMutation();
  const [resendOtp, resendState] = useResendOtpMutation();
  const [verifyOtp, verifyState] = useVerifyOtpMutation();

  const expirySeconds = useCountdown(challenge?.expiresAt);
  const resendSeconds = useCountdown(challenge?.resendAt);
  const canResend = (resendSeconds ?? 0) <= 0 && !resendState.isLoading;
  const codeExpired = challenge !== null && (expirySeconds ?? 0) <= 0;

  const returnTo = safeReturnPath(searchParams.get('returnTo'));
  // The route guard and the expiry handler can both land here; either one means the
  // previous session ended.
  const expiredInStore = useAppSelector((state) => state.session.expired);
  const expiredSession = searchParams.get('reason') === 'expired' || expiredInStore;

  useEffect(() => {
    if (status === 'authenticated') navigate(returnTo, { replace: true });
  }, [status, navigate, returnTo]);

  // Authentication mutation state is dropped when the screen unmounts so no OTP
  // argument or result lingers in the store.
  useEffect(
    () => () => {
      requestState.reset();
      resendState.reset();
      verifyState.reset();
    },
    [requestState, resendState, verifyState],
  );

  const phoneErrors = fieldErrorMap(requestState.error as NormalizedApiError | undefined);

  async function onSubmitPhone(event: FormEvent) {
    event.preventDefault();
    setFormError(null);
    if (!looksLikePhone(countryCode, localNumber)) {
      setFormError('Enter the WhatsApp number registered for your staff account.');
      return;
    }
    if (!consent) {
      setFormError('Confirm that a login code may be sent to this WhatsApp number.');
      return;
    }
    try {
      const result = await requestOtp({
        phone: toSubmittablePhone(countryCode, localNumber),
        consent,
        requestKey: requestKey.current.next(),
      }).unwrap();
      setChallenge(result);
      setAcknowledged(true);
      setStep('code');
      setCode('');
    } catch (error) {
      setFormError(errorMessage(error as NormalizedApiError));
    }
  }

  async function onResend() {
    if (!challenge) return;
    setFormError(null);
    try {
      const result = await resendOtp({
        challengeId: challenge.challengeId,
        requestKey: requestKey.current.next(),
      }).unwrap();
      // The latest successfully queued challenge replaces the previous one; only the
      // current challenge is accepted even if an older message arrives late.
      setChallenge(result);
      setCode('');
    } catch (error) {
      setFormError(errorMessage(error as NormalizedApiError));
    }
  }

  async function onSubmitCode(event: FormEvent) {
    event.preventDefault();
    setFormError(null);
    if (!challenge) return;
    if (code.length !== CODE_LENGTH) {
      setFormError(`Enter the ${CODE_LENGTH}-digit code sent on WhatsApp.`);
      return;
    }
    try {
      await verifyOtp({ challengeId: challenge.challengeId, code }).unwrap();
      // A new session supersedes the previous expiry notice.
      dispatch(sessionCleared());
      // The server set the session cookie; read the identity before navigating. A
      // pending financial or dispatch command is never replayed by signing in.
      refresh();
    } catch (error) {
      const normalized = error as NormalizedApiError;
      if (normalized.kind === 'offline' || normalized.kind === 'timeout') {
        // The response may have been lost after the session was created; `/me` can
        // recover it. A consumed code is never accepted a second time.
        setFormError('The reply did not arrive. Checking whether the sign-in completed…');
        refresh();
        return;
      }
      setCode('');
      setFormError(errorMessage(normalized));
    }
  }

  function onChangeNumber() {
    // Abandons this browser's pending challenge and clears the code field.
    setChallenge(null);
    setCode('');
    setStep('phone');
    setFormError(null);
    setAcknowledged(false);
    requestKey.current.reset();
  }

  return (
    <Box
      sx={{
        minHeight: '100vh',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        p: 2,
        bgcolor: 'background.default',
      }}
    >
      <Card sx={{ width: '100%', maxWidth: 460 }}>
        <CardContent sx={{ p: 4 }}>
          <Stack spacing={3}>
            <Box>
              <Typography variant="h1" sx={{ fontSize: '1.5rem' }}>
                {appConfig.appLabel}
              </Typography>
              <Typography variant="body2" color="text.secondary">
                Staff sign-in with a WhatsApp one-time code
              </Typography>
            </Box>

            {expiredSession ? (
              <Alert severity="info">Your session ended. Sign in again to continue.</Alert>
            ) : null}

            {acknowledged ? <Alert severity="info">{NEUTRAL_ACKNOWLEDGEMENT}</Alert> : null}

            {formError ? (
              <Alert severity="error" role="alert">
                {formError}
              </Alert>
            ) : null}

            {step === 'phone' ? (
              <form onSubmit={onSubmitPhone} noValidate>
                <Stack spacing={2}>
                  <Stack direction="row" spacing={1}>
                    <TextField
                      select
                      label="Country"
                      value={countryCode}
                      onChange={(event) => setCountryCode(event.target.value)}
                      sx={{ minWidth: 150 }}
                      slotProps={{ htmlInput: { 'aria-label': 'Country calling code' } }}
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
                      value={localNumber}
                      onChange={(event) => setLocalNumber(event.target.value)}
                      error={Boolean(phoneErrors.phone)}
                      helperText={phoneErrors.phone ?? 'Local or international format is accepted.'}
                      autoComplete="tel"
                      inputMode="tel"
                      name="phone"
                    />
                  </Stack>

                  <FormControlLabel
                    control={
                      <Checkbox
                        checked={consent}
                        onChange={(event) => setConsent(event.target.checked)}
                        name="consent"
                      />
                    }
                    label="Send a login code to this WhatsApp number."
                  />

                  <Button
                    type="submit"
                    variant="contained"
                    disabled={requestState.isLoading}
                    fullWidth
                  >
                    {requestState.isLoading ? 'Sending…' : 'Send code on WhatsApp'}
                  </Button>
                </Stack>
              </form>
            ) : (
              <form onSubmit={onSubmitCode} noValidate>
                <Stack spacing={2}>
                  <Typography variant="body2" color="text.secondary">
                    Enter the {CODE_LENGTH}-digit code sent to{' '}
                    {maskPhone(toSubmittablePhone(countryCode, localNumber))}.
                  </Typography>

                  <TextField
                    required
                    fullWidth
                    label="Verification code"
                    value={code}
                    onChange={(event) =>
                      setCode(event.target.value.replace(/\D/g, '').slice(0, CODE_LENGTH))
                    }
                    // A single accessible field: paste, leading zeros and a numeric
                    // keyboard all work, and browser autofill is offered but not assumed.
                    autoComplete="one-time-code"
                    inputMode="numeric"
                    name="one-time-code"
                    autoFocus
                    slotProps={{
                      htmlInput: {
                        maxLength: CODE_LENGTH,
                        pattern: '[0-9]*',
                        style: { letterSpacing: '0.5em', fontSize: '1.25rem' },
                        'aria-describedby': 'code-expiry',
                      },
                    }}
                    helperText={
                      codeExpired
                        ? 'That code has expired. Request a new one.'
                        : `Expires in ${formatCountdown(expirySeconds)}`
                    }
                    error={codeExpired}
                    id="one-time-code"
                  />
                  <span id="code-expiry" hidden>
                    The code expires shortly after it is sent.
                  </span>

                  <Button
                    type="submit"
                    variant="contained"
                    fullWidth
                    disabled={verifyState.isLoading || code.length !== CODE_LENGTH}
                  >
                    {verifyState.isLoading ? 'Verifying…' : 'Verify & sign in'}
                  </Button>

                  <Stack direction="row" spacing={1} sx={{ justifyContent: 'space-between' }}>
                    <Button onClick={onResend} disabled={!canResend} variant="text">
                      {canResend ? 'Resend code' : `Resend in ${formatCountdown(resendSeconds)}`}
                    </Button>
                    <Button onClick={onChangeNumber} variant="text">
                      Change number
                    </Button>
                  </Stack>
                </Stack>
              </form>
            )}

            <Typography variant="caption" color="text.secondary">
              Staff accounts are provisioned by an administrator. This sign-in does not create
              accounts and is separate from customer and driver WhatsApp journeys.
            </Typography>
          </Stack>
        </CardContent>
      </Card>
    </Box>
  );
}
