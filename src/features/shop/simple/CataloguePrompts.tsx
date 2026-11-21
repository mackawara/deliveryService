import AddAPhotoIcon from '@mui/icons-material/AddAPhoto';
import TipsAndUpdatesIcon from '@mui/icons-material/TipsAndUpdates';
import Button from '@mui/material/Button';
import Card from '@mui/material/Card';
import CardContent from '@mui/material/CardContent';
import Chip from '@mui/material/Chip';
import List from '@mui/material/List';
import ListItem from '@mui/material/ListItem';
import ListItemText from '@mui/material/ListItemText';
import Paper from '@mui/material/Paper';
import Snackbar from '@mui/material/Snackbar';
import Stack from '@mui/material/Stack';
import TextField from '@mui/material/TextField';
import Typography from '@mui/material/Typography';
import { useState } from 'react';
import { Link as RouterLink, useParams } from 'react-router-dom';

import type { WireFoodItem, WireSuggestion } from '@/api/dto/shop';
import {
  useGetShopOverviewQuery,
  useListShopItemsQuery,
  useUpdateShopItemMutation,
  useUploadShopImageMutation,
} from '@/api/endpoints/shop';
import type { NormalizedApiError } from '@/api/errors';
import { useOwnerAuth } from '@/auth/useOwnerAuth';
import { ApiError } from '@/components/ApiError';
import { newIdempotencyKey } from '@/lib/idempotency';
import { readImageBase64 } from '../shopUtils';
import { SimpleCataloguePage } from './SimpleCataloguePage';
import {
  groupSuggestions,
  popupSuggestion,
  readSnoozed,
  snooze,
  suggestionKey,
} from './suggestions';

type Prompt =
  | { kind: 'afterSave'; itemId: string; at: number }
  | { kind: 'open'; suggestion: WireSuggestion }
  | null;

const QUICK_CATEGORIES = ['Mains', 'Snacks', 'Drinks', 'Sides', 'Breakfast'];

/** The simple catalogue with the issue 34 prompts that encourage more detail. */
export function SimpleCatalogueWithPrompts() {
  const { shopId = '' } = useParams();
  // Snoozes and an open prompt belong to one shop: switching shop starts afresh.
  return <CatalogueWithPrompts key={shopId} shopId={shopId} />;
}

function CatalogueWithPrompts({ shopId }: { shopId: string }) {
  const { session } = useOwnerAuth();
  const ownerId = session?.owner.id ?? 'owner';
  const overview = useGetShopOverviewQuery(shopId, { skip: !shopId });
  const items = useListShopItemsQuery({ shopId, limit: 100 }, { skip: !shopId });
  const [prompt, setPrompt] = useState<Prompt>(null);
  const [snoozed, setSnoozed] = useState(() => readSnoozed(ownerId, shopId));
  const suggestions = overview.data?.suggestions ?? [];

  // Derived, never stored: a suggestion the API no longer returns is never shown.
  let active: WireSuggestion | undefined;
  if (prompt?.kind === 'afterSave' && (overview.fulfilledTimeStamp ?? 0) > prompt.at)
    active = popupSuggestion(suggestions, prompt.itemId, snoozed);
  if (prompt?.kind === 'open')
    active = suggestions.find((entry) => suggestionKey(entry) === suggestionKey(prompt.suggestion));
  const item = active?.itemId
    ? items.data?.items.find((entry) => entry._id === active.itemId)
    : undefined;

  return (
    <>
      <SimpleCataloguePage
        onItemSaved={(saved, { addAnother }) =>
          // "Save and add another" keeps the owner in the flow: no prompt in the way.
          setPrompt(addAnother ? null : { kind: 'afterSave', itemId: saved._id, at: Date.now() })
        }
        aside={
          <ShopBetterCard
            shopId={shopId}
            suggestions={suggestions}
            onOpen={(suggestion) => setPrompt({ kind: 'open', suggestion })}
          />
        }
      />
      {active && item ? (
        <SuggestionPopup
          key={suggestionKey(active)}
          shopId={shopId}
          item={item}
          suggestion={active}
          onDone={() => setPrompt(null)}
          onNotNow={() => {
            setSnoozed(snooze(ownerId, shopId, active));
            setPrompt(null);
          }}
        />
      ) : null}
    </>
  );
}

function ShopBetterCard({
  shopId,
  suggestions,
  onOpen,
}: {
  shopId: string;
  suggestions: WireSuggestion[];
  onOpen: (suggestion: WireSuggestion) => void;
}) {
  const groups = groupSuggestions(suggestions);
  if (!groups.length) return null;
  return (
    <Card variant="outlined" component="section" aria-labelledby="shop-better-title">
      <CardContent sx={{ '&:last-child': { pb: 1 } }}>
        <Stack direction="row" spacing={1} sx={{ alignItems: 'center' }}>
          <TipsAndUpdatesIcon color="primary" aria-hidden />
          <Typography variant="h2" id="shop-better-title">
            Make your shop better
          </Typography>
        </Stack>
        <List dense disablePadding>
          {groups.map((group) => {
            const first = group.entries[0];
            const toPin = group.code === 'ADD_PICKUP_PIN' || group.code === 'ADD_PICKUP_ADDRESS';
            return (
              <ListItem
                key={group.code}
                disableGutters
                secondaryAction={
                  toPin ? (
                    <Button
                      component={RouterLink}
                      to={`/shop/${shopId}/pin`}
                      sx={{ minHeight: 44 }}
                    >
                      Open map
                    </Button>
                  ) : first.itemId ? (
                    <Button onClick={() => onOpen(first)} sx={{ minHeight: 44 }}>
                      Fix one
                    </Button>
                  ) : null
                }
                sx={{ pr: 12, minHeight: 48 }}
              >
                <ListItemText primary={group.label} />
              </ListItem>
            );
          })}
        </List>
      </CardContent>
    </Card>
  );
}

const copy: Record<string, { title: (name: string) => string; body: string }> = {
  ADD_ITEM_PHOTO: {
    title: (name) => `Add a photo of ${name}?`,
    body: 'Customers only see items with a photo.',
  },
  ADD_ITEM_DESCRIPTION: {
    title: (name) => `Describe ${name}?`,
    body: 'A few words help customers choose: what comes with it, the size, how spicy.',
  },
  ADD_ITEM_CATEGORY: {
    title: (name) => `Choose a category for ${name}?`,
    body: 'Categories help customers find things on a longer menu.',
  },
};

/** A small, dismissible prompt that never blocks saving or navigating. */
function SuggestionPopup({
  shopId,
  item,
  suggestion,
  onDone,
  onNotNow,
}: {
  shopId: string;
  item: WireFoodItem;
  suggestion: WireSuggestion;
  onDone: () => void;
  onNotNow: () => void;
}) {
  const [text, setText] = useState('');
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<NormalizedApiError>();
  const [updateItem] = useUpdateShopItemMutation();
  const [uploadImage] = useUploadShopImageMutation();
  const words = copy[suggestion.code] ?? { title: () => suggestion.message, body: '' };

  async function run(command: () => Promise<unknown>) {
    setPending(true);
    setError(undefined);
    try {
      await command();
      onDone();
    } catch (caught) {
      setError(caught as NormalizedApiError);
    } finally {
      setPending(false);
    }
  }

  const saveText = (field: 'description' | 'category', value: string) =>
    run(() =>
      updateItem({
        shopId,
        itemId: item._id,
        expectedVersion: item.version,
        [field]: value.trim(),
        idempotencyKey: newIdempotencyKey(),
      }).unwrap(),
    );

  const savePhoto = (file: File) =>
    run(async () =>
      uploadImage({
        shopId,
        itemId: item._id,
        expectedVersion: item.version,
        base64: await readImageBase64(file),
        idempotencyKey: newIdempotencyKey(),
      }).unwrap(),
    );

  return (
    <Snackbar open anchorOrigin={{ vertical: 'bottom', horizontal: 'center' }}>
      <Paper
        elevation={6}
        role="dialog"
        aria-modal="false"
        aria-labelledby="suggestion-title"
        sx={{ p: 2, width: { xs: 'calc(100vw - 32px)', sm: 420 }, maxWidth: '100%' }}
      >
        <Stack spacing={1.5}>
          <Typography variant="subtitle1" id="suggestion-title" sx={{ fontWeight: 700 }}>
            {words.title(item.name)}
          </Typography>
          {words.body ? <Typography variant="body2">{words.body}</Typography> : null}
          {error ? <ApiError error={error} /> : null}
          {suggestion.code === 'ADD_ITEM_PHOTO' ? (
            <Button
              component="label"
              variant="contained"
              startIcon={<AddAPhotoIcon />}
              disabled={pending}
              sx={{ minHeight: 44 }}
            >
              {pending ? 'Adding…' : 'Take or choose a photo'}
              <input
                hidden
                type="file"
                accept="image/jpeg,image/png"
                aria-label={`Photo for ${item.name}`}
                onChange={(event) => {
                  const picked = event.target.files?.[0];
                  event.target.value = '';
                  if (picked) void savePhoto(picked);
                }}
              />
            </Button>
          ) : (
            <Stack
              component="form"
              spacing={1}
              onSubmit={(event) => {
                event.preventDefault();
                if (text.trim())
                  void saveText(
                    suggestion.code === 'ADD_ITEM_CATEGORY' ? 'category' : 'description',
                    text,
                  );
              }}
            >
              <TextField
                size="small"
                autoFocus
                label={suggestion.code === 'ADD_ITEM_CATEGORY' ? 'Category' : 'Description'}
                value={text}
                onChange={(event) => setText(event.target.value)}
                multiline={suggestion.code !== 'ADD_ITEM_CATEGORY'}
                slotProps={{
                  htmlInput: { maxLength: suggestion.code === 'ADD_ITEM_CATEGORY' ? 80 : 1000 },
                }}
              />
              {suggestion.code === 'ADD_ITEM_CATEGORY' ? (
                <Stack direction="row" sx={{ flexWrap: 'wrap', gap: 1 }}>
                  {QUICK_CATEGORIES.map((name) => (
                    <Chip key={name} label={name} onClick={() => setText(name)} />
                  ))}
                </Stack>
              ) : null}
              <Button
                type="submit"
                variant="contained"
                disabled={pending || !text.trim()}
                sx={{ minHeight: 44 }}
              >
                {pending ? 'Saving…' : 'Save'}
              </Button>
            </Stack>
          )}
          <Button onClick={onNotNow} disabled={pending} sx={{ minHeight: 44 }}>
            Not now
          </Button>
        </Stack>
      </Paper>
    </Snackbar>
  );
}
