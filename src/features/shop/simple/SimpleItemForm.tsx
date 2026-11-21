import AddAPhotoIcon from '@mui/icons-material/AddAPhoto';
import Avatar from '@mui/material/Avatar';
import Button from '@mui/material/Button';
import Dialog from '@mui/material/Dialog';
import DialogActions from '@mui/material/DialogActions';
import DialogContent from '@mui/material/DialogContent';
import DialogTitle from '@mui/material/DialogTitle';
import InputAdornment from '@mui/material/InputAdornment';
import Stack from '@mui/material/Stack';
import TextField from '@mui/material/TextField';
import Typography from '@mui/material/Typography';
import useMediaQuery from '@mui/material/useMediaQuery';
import { useTheme } from '@mui/material/styles';
import { useEffect, useState, type FormEvent } from 'react';

import type { WireFoodItem } from '@/api/dto/shop';
import type { NormalizedApiError } from '@/api/errors';
import { ApiError } from '@/components/ApiError';
import { itemImage } from '../shopUtils';
import { parsePriceCents, priceText, readItemDraft, writeItemDraft } from './items';

export interface ItemValues {
  name: string;
  priceCents: number;
  description?: string;
  category?: string;
}

interface Props {
  shopId: string;
  /** Changes after "Save and add another" so the fields start empty again. */
  formKey?: string | number;
  item?: WireFoodItem;
  pending: boolean;
  error?: NormalizedApiError;
  onClose: () => void;
  onSave: (values: ItemValues, photo: File | undefined, addAnother: boolean) => void;
  onRemove?: () => void;
}

/** Name and price, with a photo expected but not required (issue 34). */
export function SimpleItemForm(props: Props) {
  const theme = useTheme();
  const phone = useMediaQuery(theme.breakpoints.down('sm'));
  // The dialog stays mounted between items, so focus is not lost or restored mid-flow.
  return (
    <Dialog
      open
      onClose={props.pending ? undefined : props.onClose}
      fullWidth
      maxWidth="sm"
      fullScreen={phone}
      aria-labelledby="simple-item-form-title"
    >
      <ItemFields key={props.formKey} {...props} />
    </Dialog>
  );
}

function ItemFields({ shopId, item, pending, error, onClose, onSave, onRemove }: Props) {
  const [draft, setDraft] = useState(() =>
    item ? { name: item.name, price: priceText(item.priceCents) } : readItemDraft(shopId),
  );
  const [description, setDescription] = useState(item?.description ?? '');
  const [category, setCategory] = useState(item?.category ?? '');
  const [photo, setPhoto] = useState<File>();
  const [touched, setTouched] = useState(false);

  useEffect(() => {
    if (!item) writeItemDraft(shopId, draft);
  }, [draft, item, shopId]);

  const priceCents = parsePriceCents(draft.price);
  const nameMissing = !draft.name.trim();
  const valid = !nameMissing && priceCents !== undefined;

  function save(addAnother: boolean) {
    setTouched(true);
    if (!valid || pending) return;
    onSave(
      {
        name: draft.name.trim(),
        priceCents: priceCents!,
        ...(item ? { description: description.trim(), category: category.trim() } : {}),
      },
      photo,
      addAnother,
    );
  }

  function submit(event: FormEvent) {
    event.preventDefault();
    save(false);
  }

  const preview = item ? itemImage(item) : undefined;
  return (
    <form onSubmit={submit} noValidate>
      <DialogTitle id="simple-item-form-title">{item ? 'Edit item' : 'Add an item'}</DialogTitle>
      <DialogContent>
        <Stack spacing={2.5} sx={{ pt: 1 }}>
          {error ? <ApiError error={error} /> : null}
          <TextField
            required
            autoFocus={!item}
            label="Item name"
            value={draft.name}
            onChange={(event) => setDraft({ ...draft, name: event.target.value })}
            error={touched && nameMissing}
            helperText={
              touched && nameMissing ? 'Enter the item name.' : 'For example, Sadza and beef'
            }
            slotProps={{ htmlInput: { maxLength: 100 } }}
          />
          <TextField
            required
            label="Price"
            value={draft.price}
            onChange={(event) => setDraft({ ...draft, price: event.target.value })}
            error={touched && priceCents === undefined}
            helperText={
              touched && priceCents === undefined
                ? 'Enter a price, for example 4.50.'
                : 'In US dollars'
            }
            slotProps={{
              htmlInput: { inputMode: 'decimal', pattern: '[0-9]*[.,]?[0-9]{0,2}' },
              input: { startAdornment: <InputAdornment position="start">$</InputAdornment> },
            }}
          />
          <Stack direction="row" spacing={2} sx={{ alignItems: 'center' }}>
            <Avatar src={preview} variant="rounded" sx={{ width: 64, height: 64 }}>
              <AddAPhotoIcon />
            </Avatar>
            <Stack spacing={0.5} sx={{ minWidth: 0 }}>
              <Button component="label" variant="outlined" sx={{ minHeight: 44 }}>
                {photo ? 'Change photo' : preview ? 'Replace photo' : 'Add a photo'}
                <input
                  hidden
                  type="file"
                  accept="image/jpeg,image/png"
                  aria-label="Item photo"
                  onChange={(event) => {
                    const picked = event.target.files?.[0];
                    event.target.value = '';
                    if (picked) setPhoto(picked);
                  }}
                />
              </Button>
              <Typography variant="caption" color="text.secondary" noWrap>
                {photo
                  ? photo.name
                  : preview
                    ? 'Customers can see this item.'
                    : 'Customers only see items with a photo. You can add it later.'}
              </Typography>
            </Stack>
          </Stack>
          {item ? (
            <>
              <TextField
                label="Description (optional)"
                value={description}
                onChange={(event) => setDescription(event.target.value)}
                multiline
                minRows={2}
                helperText="What comes with it, the size, or how spicy it is."
                slotProps={{ htmlInput: { maxLength: 1000 } }}
              />
              <TextField
                label="Category (optional)"
                value={category}
                onChange={(event) => setCategory(event.target.value)}
                helperText="For example, Mains, Drinks or Snacks"
                slotProps={{ htmlInput: { maxLength: 80 } }}
              />
            </>
          ) : null}
        </Stack>
      </DialogContent>
      <DialogActions sx={{ flexWrap: 'wrap', gap: 1, px: 3, pb: 2 }}>
        {onRemove ? (
          <Button
            color="warning"
            onClick={onRemove}
            disabled={pending}
            sx={{ mr: 'auto', minHeight: 44 }}
          >
            Remove item
          </Button>
        ) : null}
        <Button onClick={onClose} disabled={pending} sx={{ minHeight: 44 }}>
          Cancel
        </Button>
        {item ? null : (
          <Button
            variant="outlined"
            onClick={() => save(true)}
            disabled={pending}
            sx={{ minHeight: 44 }}
          >
            Save and add another
          </Button>
        )}
        <Button type="submit" variant="contained" disabled={pending} sx={{ minHeight: 44 }}>
          {pending ? 'Saving…' : 'Save'}
        </Button>
      </DialogActions>
    </form>
  );
}
