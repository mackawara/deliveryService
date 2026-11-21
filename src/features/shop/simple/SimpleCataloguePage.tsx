import AddIcon from '@mui/icons-material/Add';
import AddAPhotoIcon from '@mui/icons-material/AddAPhoto';
import EditIcon from '@mui/icons-material/Edit';
import RestaurantIcon from '@mui/icons-material/Restaurant';
import VisibilityOffIcon from '@mui/icons-material/VisibilityOff';
import Avatar from '@mui/material/Avatar';
import Button from '@mui/material/Button';
import Card from '@mui/material/Card';
import CardContent from '@mui/material/CardContent';
import Chip from '@mui/material/Chip';
import FormControlLabel from '@mui/material/FormControlLabel';
import Stack from '@mui/material/Stack';
import Switch from '@mui/material/Switch';
import Typography from '@mui/material/Typography';
import { useMemo, useState, type ReactNode } from 'react';
import { useParams } from 'react-router-dom';

import type { WireFoodItem } from '@/api/dto/shop';
import {
  useArchiveShopItemMutation,
  useCreateShopItemMutation,
  useGetShopQuery,
  useListShopItemsQuery,
  useUpdateShopItemMutation,
  useUploadShopImageMutation,
} from '@/api/endpoints/shop';
import type { NormalizedApiError } from '@/api/errors';
import { useAppDispatch } from '@/app/hooks';
import { noticeShown } from '@/app/uiSlice';
import { ApiError } from '@/components/ApiError';
import { newIdempotencyKey } from '@/lib/idempotency';
import { centsToUsd, itemImage, readImageBase64 } from '../shopUtils';
import { clearItemDraft, hasPhoto } from './items';
import { SimpleItemForm, type ItemValues } from './SimpleItemForm';

export interface SimpleCataloguePageProps {
  /** Called after every successful save, for the issue 34 follow-up prompts. */
  onItemSaved?: (item: WireFoodItem, context: { addAnother: boolean }) => void;
  /** Rendered above the list, for the "Make your shop better" card. */
  aside?: ReactNode;
}

type Dialog = { mode: 'new'; key: number } | { mode: 'edit'; item: WireFoodItem } | null;

export function SimpleCataloguePage({ onItemSaved, aside }: SimpleCataloguePageProps) {
  const { shopId = '' } = useParams();
  const dispatch = useAppDispatch();
  const shop = useGetShopQuery(shopId, { skip: !shopId });
  const items = useListShopItemsQuery({ shopId, limit: 100 }, { skip: !shopId });
  const [createItem] = useCreateShopItemMutation();
  const [updateItem] = useUpdateShopItemMutation();
  const [archiveItem] = useArchiveShopItemMutation();
  const [uploadImage] = useUploadShopImageMutation();
  const [dialog, setDialog] = useState<Dialog>(null);
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState<NormalizedApiError>();
  const [rowError, setRowError] = useState<NormalizedApiError>();
  const [busyItem, setBusyItem] = useState<string>();
  const rows = useMemo(
    () =>
      (items.data?.items ?? [])
        .filter((item) => item.status === 'ACTIVE')
        .sort((left, right) => left.displayOrder - right.displayOrder),
    [items.data],
  );

  async function attachPhoto(item: WireFoodItem, file: File): Promise<WireFoodItem> {
    const base64 = await readImageBase64(file);
    const result = await uploadImage({
      shopId,
      itemId: item._id,
      expectedVersion: item.version,
      base64,
      idempotencyKey: newIdempotencyKey(),
    }).unwrap();
    return {
      ...item,
      version: result.version,
      thumbnail: result.thumbnail,
      thumbnailBase64: result.base64,
    };
  }

  async function save(values: ItemValues, photo: File | undefined, addAnother: boolean) {
    if (!dialog || saving) return;
    setSaving(true);
    setFormError(undefined);
    let saved: WireFoodItem | undefined;
    try {
      saved =
        dialog.mode === 'new'
          ? await createItem({ shopId, ...values, idempotencyKey: newIdempotencyKey() }).unwrap()
          : await updateItem({
              shopId,
              itemId: dialog.item._id,
              expectedVersion: dialog.item.version,
              ...values,
              idempotencyKey: newIdempotencyKey(),
            }).unwrap();
      if (dialog.mode === 'new') clearItemDraft(shopId);
      if (photo) saved = await attachPhoto(saved, photo);
      dispatch(noticeShown({ tone: 'success', message: `${saved.name} saved.` }));
      setDialog(addAnother ? { mode: 'new', key: Date.now() } : null);
      onItemSaved?.(saved, { addAnother });
    } catch (caught) {
      setFormError(caught as NormalizedApiError);
      // The item itself may be saved even though the photo failed: show it in the list.
      if (saved) setDialog({ mode: 'edit', item: saved });
    } finally {
      setSaving(false);
    }
  }

  async function rowCommand(item: WireFoodItem, command: () => Promise<unknown>) {
    setBusyItem(item._id);
    setRowError(undefined);
    try {
      await command();
    } catch (caught) {
      setRowError(caught as NormalizedApiError);
      void items.refetch();
    } finally {
      setBusyItem(undefined);
    }
  }

  const toggleStock = (item: WireFoodItem, inStock: boolean) =>
    rowCommand(item, () =>
      updateItem({
        shopId,
        itemId: item._id,
        expectedVersion: item.version,
        inStock,
        idempotencyKey: newIdempotencyKey(),
      }).unwrap(),
    );

  const addPhoto = (item: WireFoodItem, file: File) =>
    rowCommand(item, async () => {
      const updated = await attachPhoto(item, file);
      onItemSaved?.(updated, { addAnother: false });
    });

  async function remove(item: WireFoodItem) {
    setSaving(true);
    try {
      await archiveItem({
        shopId,
        itemId: item._id,
        expectedVersion: item.version,
        idempotencyKey: newIdempotencyKey(),
      }).unwrap();
      setDialog(null);
    } catch (caught) {
      setFormError(caught as NormalizedApiError);
    } finally {
      setSaving(false);
    }
  }

  if (shop.isLoading || items.isLoading) return <Typography>Loading your items…</Typography>;
  if (shop.error || items.error)
    return (
      <ApiError
        error={(shop.error ?? items.error) as NormalizedApiError}
        onRetry={() => {
          void shop.refetch();
          void items.refetch();
        }}
      />
    );
  const openNew = () => {
    setFormError(undefined);
    setDialog({ mode: 'new', key: Date.now() });
  };

  return (
    <Stack spacing={2.5} sx={{ maxWidth: 760, mx: 'auto' }}>
      <Stack direction="row" sx={{ alignItems: 'center', justifyContent: 'space-between', gap: 1 }}>
        <Typography variant="h1">Your items</Typography>
        {rows.length ? (
          <Button
            variant="contained"
            startIcon={<AddIcon />}
            onClick={openNew}
            sx={{ minHeight: 44 }}
          >
            Add item
          </Button>
        ) : null}
      </Stack>
      {aside}
      {rowError ? <ApiError error={rowError} /> : null}
      {!rows.length ? (
        <Card>
          <CardContent>
            <Stack spacing={2} sx={{ alignItems: 'center', textAlign: 'center', py: 4 }}>
              <RestaurantIcon sx={{ fontSize: 48 }} color="primary" aria-hidden />
              <Typography variant="h2">No items yet</Typography>
              <Typography color="text.secondary">
                Add what you sell: a name and a price is enough to start.
              </Typography>
              <Button
                variant="contained"
                size="large"
                startIcon={<AddIcon />}
                onClick={openNew}
                sx={{ minHeight: 48 }}
              >
                Add your first item
              </Button>
            </Stack>
          </CardContent>
        </Card>
      ) : (
        <Stack spacing={1.5} component="ul" sx={{ listStyle: 'none', p: 0, m: 0 }}>
          {rows.map((item) => (
            <Card key={item._id} variant="outlined" component="li">
              <CardContent sx={{ '&:last-child': { pb: 2 } }}>
                <Stack direction="row" spacing={2} sx={{ alignItems: 'center' }}>
                  <Avatar src={itemImage(item)} variant="rounded" sx={{ width: 56, height: 56 }}>
                    <RestaurantIcon />
                  </Avatar>
                  <Stack sx={{ flex: 1, minWidth: 0 }}>
                    <Typography variant="h3" noWrap>
                      {item.name}
                    </Typography>
                    <Typography variant="body2" color="text.secondary">
                      {centsToUsd(item.priceCents)}
                    </Typography>
                  </Stack>
                  <Button
                    size="small"
                    startIcon={<EditIcon />}
                    onClick={() => {
                      setFormError(undefined);
                      setDialog({ mode: 'edit', item });
                    }}
                    sx={{ minHeight: 44 }}
                    aria-label={`Edit ${item.name}`}
                  >
                    Edit
                  </Button>
                </Stack>
                <Stack
                  direction="row"
                  sx={{
                    mt: 1,
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    flexWrap: 'wrap',
                    gap: 1,
                  }}
                >
                  <FormControlLabel
                    sx={{ minHeight: 44, ml: 0 }}
                    control={
                      <Switch
                        checked={item.inStock}
                        disabled={busyItem === item._id}
                        onChange={(event) => void toggleStock(item, event.target.checked)}
                        slotProps={{ input: { 'aria-label': `${item.name} in stock` } }}
                      />
                    }
                    label={item.inStock ? 'In stock' : 'Out of stock'}
                  />
                  {hasPhoto(item) ? null : (
                    <Stack
                      direction="row"
                      spacing={1}
                      sx={{ alignItems: 'center', flexWrap: 'wrap' }}
                    >
                      <Chip
                        color="warning"
                        icon={<VisibilityOffIcon />}
                        label="Hidden from customers: add a photo"
                        sx={{ maxWidth: '100%' }}
                      />
                      <Button
                        component="label"
                        size="small"
                        startIcon={<AddAPhotoIcon />}
                        disabled={busyItem === item._id}
                        sx={{ minHeight: 44 }}
                      >
                        {busyItem === item._id ? 'Adding…' : 'Add photo'}
                        <input
                          hidden
                          type="file"
                          accept="image/jpeg,image/png"
                          aria-label={`Photo for ${item.name}`}
                          onChange={(event) => {
                            const picked = event.target.files?.[0];
                            event.target.value = '';
                            if (picked) void addPhoto(item, picked);
                          }}
                        />
                      </Button>
                    </Stack>
                  )}
                </Stack>
              </CardContent>
            </Card>
          ))}
        </Stack>
      )}
      {dialog ? (
        <SimpleItemForm
          key={dialog.mode === 'new' ? 'new' : dialog.item._id}
          formKey={dialog.mode === 'new' ? dialog.key : undefined}
          shopId={shopId}
          item={dialog.mode === 'edit' ? dialog.item : undefined}
          pending={saving}
          error={formError}
          onClose={() => setDialog(null)}
          onSave={(values, photo, addAnother) => void save(values, photo, addAnother)}
          onRemove={dialog.mode === 'edit' ? () => void remove(dialog.item) : undefined}
        />
      ) : null}
    </Stack>
  );
}
