import AddBusinessIcon from '@mui/icons-material/AddBusiness';
import Alert from '@mui/material/Alert';
import Button from '@mui/material/Button';
import Card from '@mui/material/Card';
import CardContent from '@mui/material/CardContent';
import Checkbox from '@mui/material/Checkbox';
import FormControlLabel from '@mui/material/FormControlLabel';
import Link from '@mui/material/Link';
import MenuItem from '@mui/material/MenuItem';
import Stack from '@mui/material/Stack';
import TextField from '@mui/material/TextField';
import Typography from '@mui/material/Typography';
import { useEffect, useState, type FormEvent } from 'react';
import { useNavigate } from 'react-router-dom';

import {
  useCreateSimpleShopMutation,
  useGetCurrentShopTermsQuery,
  useListShopTownsQuery,
} from '@/api/endpoints/shop';
import type { NormalizedApiError } from '@/api/errors';
import { useOwnerAuth } from '@/auth/useOwnerAuth';
import { ApiError } from '@/components/ApiError';
import { useGuardedAction } from '@/lib/useGuardedAction';

import { ClaimShopCard } from './ClaimShopCard';

interface Draft {
  name: string;
  townId: string;
}

const DRAFT_DAYS = 7;

/** Typed input survives a dropped connection; the terms tick is never saved. */
function readDraft(key: string): Draft {
  try {
    const saved = JSON.parse(sessionStorage.getItem(key) ?? 'null');
    if (
      saved &&
      typeof saved.savedAt === 'number' &&
      Date.now() - saved.savedAt <= DRAFT_DAYS * 86_400_000 &&
      typeof saved.value?.name === 'string' &&
      typeof saved.value?.townId === 'string'
    )
      return { name: saved.value.name, townId: saved.value.townId };
  } catch {
    /* A broken draft starts empty. */
  }
  return { name: '', townId: '' };
}

/** Two inputs and a tick (issue 34). `another` adds the pilot-shop claim for extra shops. */
export function SimpleShopSetupPage({ another = false }: { another?: boolean }) {
  const { session } = useOwnerAuth();
  return session ? (
    <SetupForm key={session.owner.id} ownerId={session.owner.id} another={another} />
  ) : null;
}

function SetupForm({ ownerId, another }: { ownerId: string; another: boolean }) {
  const navigate = useNavigate();
  const draftKey = `shop-setup:v2:${ownerId}`;
  const [draft, setDraft] = useState(() => readDraft(draftKey));
  const [agreed, setAgreed] = useState(false);
  const towns = useListShopTownsQuery();
  const terms = useGetCurrentShopTermsQuery();
  const [createShop] = useCreateSimpleShopMutation();

  useEffect(() => {
    try {
      sessionStorage.setItem(draftKey, JSON.stringify({ savedAt: Date.now(), value: draft }));
    } catch {
      /* Setup still works when browser storage is unavailable. */
    }
  }, [draft, draftKey]);

  const create = useGuardedAction({
    run: (_: undefined, key: string) =>
      createShop({
        name: draft.name.trim(),
        townId: draft.townId,
        termsVersion: terms.data!.version,
        agreeToTerms: true,
        idempotencyKey: key,
      }).unwrap(),
    successMessage: 'Your shop is created.',
    onSuccess: (shop) => {
      try {
        sessionStorage.removeItem(draftKey);
      } catch {
        /* Optional draft storage. */
      }
      navigate(`/shop/${shop._id}/pin`);
    },
  });

  const townKnown = towns.data?.some((town) => town._id === draft.townId) ?? false;
  const ready = Boolean(draft.name.trim()) && townKnown && agreed && Boolean(terms.data);

  function submit(event: FormEvent) {
    event.preventDefault();
    if (ready && !create.pending) void create.submit();
  }

  return (
    <Stack spacing={3} sx={{ maxWidth: 560, mx: 'auto' }}>
      <Stack direction="row" spacing={1.5} sx={{ alignItems: 'center' }}>
        <AddBusinessIcon color="primary" />
        <Typography variant="h1">{another ? 'Add another shop' : 'Create your shop'}</Typography>
      </Stack>
      <Card>
        <CardContent>
          {terms.isLoading ? (
            <Typography>Loading…</Typography>
          ) : terms.error ? (
            <ApiError
              error={terms.error as NormalizedApiError}
              onRetry={() => void terms.refetch()}
            />
          ) : !terms.data ? (
            <Alert severity="info">
              Shop signup is closed for now while the terms and conditions are being prepared.
              Please try again later.
            </Alert>
          ) : (
            <Stack component="form" spacing={2.5} onSubmit={submit} noValidate>
              <Typography>
                Two quick details and you can start adding your items. You can change them later.
              </Typography>
              <TextField
                fullWidth
                required
                label="Shop name"
                value={draft.name}
                onChange={(event) => setDraft({ ...draft, name: event.target.value })}
                slotProps={{ htmlInput: { maxLength: 100, autoComplete: 'organization' } }}
              />
              {towns.error ? (
                <Alert
                  severity="error"
                  action={<Button onClick={() => void towns.refetch()}>Try again</Button>}
                >
                  The list of towns could not be loaded.
                </Alert>
              ) : null}
              <TextField
                fullWidth
                required
                select
                label="Town"
                value={townKnown ? draft.townId : ''}
                onChange={(event) => setDraft({ ...draft, townId: event.target.value })}
                disabled={towns.isLoading || !towns.data?.length}
              >
                {(towns.data ?? []).map((town) => (
                  <MenuItem key={town._id} value={town._id}>
                    {town.name}
                  </MenuItem>
                ))}
              </TextField>
              {!towns.isLoading && towns.data?.length === 0 ? (
                <Alert severity="info">
                  We are not taking shops in any town yet. What you typed is saved; try again later.
                </Alert>
              ) : null}
              <FormControlLabel
                sx={{ alignItems: 'center', minHeight: 44 }}
                control={
                  <Checkbox
                    checked={agreed}
                    onChange={(event) => setAgreed(event.target.checked)}
                  />
                }
                label={
                  <span>
                    I agree to the{' '}
                    <Link href={terms.data.url} target="_blank" rel="noopener noreferrer">
                      terms and conditions
                    </Link>
                  </span>
                }
              />
              {create.error ? <ApiError error={create.error} /> : null}
              <Button
                type="submit"
                variant="contained"
                size="large"
                disabled={!ready || create.pending}
                sx={{ minHeight: 48 }}
              >
                {create.pending ? 'Creating your shop…' : 'Create my shop'}
              </Button>
            </Stack>
          )}
        </CardContent>
      </Card>
      {another ? <ClaimShopCard /> : null}
    </Stack>
  );
}
