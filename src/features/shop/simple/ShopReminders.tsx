import Alert from '@mui/material/Alert';
import AlertTitle from '@mui/material/AlertTitle';
import Button from '@mui/material/Button';
import Checkbox from '@mui/material/Checkbox';
import FormControlLabel from '@mui/material/FormControlLabel';
import Link from '@mui/material/Link';
import Stack from '@mui/material/Stack';
import { useState } from 'react';
import { Link as RouterLink, useLocation } from 'react-router-dom';

import type { WireCurrentShopTerms, WireShop } from '@/api/dto/shop';
import { useAgreeShopTermsMutation, useGetCurrentShopTermsQuery } from '@/api/endpoints/shop';
import { ApiError } from '@/components/ApiError';
import { useGuardedAction } from '@/lib/useGuardedAction';
import { PIN_REASON } from './copy';

/** Shown in the shop shell until the pin is set and the current terms are agreed. */
export function ShopReminders({ shop }: { shop: WireShop }) {
  const location = useLocation();
  const terms = useGetCurrentShopTermsQuery();
  const onPinPage = location.pathname.endsWith('/pin');
  const termsChanged =
    terms.data && shop.termsAgreement?.version !== terms.data.version ? terms.data : undefined;
  if (onPinPage && !termsChanged) return null;
  return (
    <Stack spacing={1.5} sx={{ mb: 2 }}>
      {termsChanged ? (
        <TermsAgreement
          key={`${shop._id}:${termsChanged.version}`}
          shop={shop}
          terms={termsChanged}
        />
      ) : null}
      {!shop.pickup && !onPinPage ? (
        <Alert
          severity="warning"
          action={
            <Button
              color="inherit"
              component={RouterLink}
              to={`/shop/${shop._id}/pin`}
              sx={{ minHeight: 44 }}
            >
              Set pin
            </Button>
          }
        >
          <AlertTitle>Pin your shop on the map</AlertTitle>
          {PIN_REASON}
        </Alert>
      ) : null}
    </Stack>
  );
}

/** The same tick box as signup, once, after the terms version changes. */
function TermsAgreement({ shop, terms }: { shop: WireShop; terms: WireCurrentShopTerms }) {
  const [agreed, setAgreed] = useState(false);
  const [agree] = useAgreeShopTermsMutation();
  const action = useGuardedAction({
    run: (_: undefined, key: string) =>
      agree({
        shopId: shop._id,
        termsVersion: terms.version,
        expectedVersion: shop.version,
        idempotencyKey: key,
      }).unwrap(),
    successMessage: 'Thank you. Your agreement is saved.',
  });
  return (
    <Alert severity="info">
      <AlertTitle>The terms and conditions have changed</AlertTitle>
      <Stack spacing={1}>
        <span>Your shop keeps working. Please read and agree so it can be approved.</span>
        <FormControlLabel
          sx={{ minHeight: 44 }}
          control={
            <Checkbox checked={agreed} onChange={(event) => setAgreed(event.target.checked)} />
          }
          label={
            <span>
              I agree to the{' '}
              <Link href={terms.url} target="_blank" rel="noopener noreferrer">
                terms and conditions
              </Link>
            </span>
          }
        />
        {action.error ? <ApiError error={action.error} /> : null}
        <div>
          <Button
            variant="contained"
            onClick={() => void action.submit()}
            disabled={!agreed || action.pending}
            sx={{ minHeight: 44 }}
          >
            {action.pending ? 'Saving…' : 'Agree'}
          </Button>
        </div>
      </Stack>
    </Alert>
  );
}
