import AddPhotoAlternateIcon from '@mui/icons-material/AddPhotoAlternate';
import ArchiveIcon from '@mui/icons-material/Archive';
import EditIcon from '@mui/icons-material/Edit';
import Inventory2Icon from '@mui/icons-material/Inventory2';
import AddIcon from '@mui/icons-material/Add';
import Alert from '@mui/material/Alert';
import Avatar from '@mui/material/Avatar';
import Button from '@mui/material/Button';
import Card from '@mui/material/Card';
import CardContent from '@mui/material/CardContent';
import Checkbox from '@mui/material/Checkbox';
import Dialog from '@mui/material/Dialog';
import DialogActions from '@mui/material/DialogActions';
import DialogContent from '@mui/material/DialogContent';
import DialogTitle from '@mui/material/DialogTitle';
import FormControlLabel from '@mui/material/FormControlLabel';
import MenuItem from '@mui/material/MenuItem';
import Stack from '@mui/material/Stack';
import TextField from '@mui/material/TextField';
import Typography from '@mui/material/Typography';
import { useMemo, useState, type FormEvent } from 'react';
import { useParams } from 'react-router-dom';

import type { CreateItemBody, WireFoodItem, WirePackingProfile } from '@/api/dto/shop';
import {
  useArchiveShopItemMutation,
  useCreateShopItemMutation,
  useGetShopQuery,
  useListPackingProfilesQuery,
  useListShopItemsQuery,
  useUpdateShopItemMutation,
  useUploadShopImageMutation,
} from '@/api/endpoints/shop';
import type { NormalizedApiError } from '@/api/errors';
import { ApiError } from '@/components/ApiError';
import { EmptyState } from '@/components/EmptyState';
import { PageHeader } from '@/components/PageHeader';
import { newIdempotencyKey } from '@/lib/idempotency';
import { centsToUsd, itemImage, readImageBase64 } from '@/features/shop/shopUtils';

interface ItemFormProps {
  item?: WireFoodItem;
  profiles: WirePackingProfile[];
  pending: boolean;
  onClose: () => void;
  onSubmit: (body: CreateItemBody, file?: File) => void;
}

function ItemForm({ item, profiles, pending, onClose, onSubmit }: ItemFormProps) {
  const [name, setName] = useState(item?.name ?? '');
  const [description, setDescription] = useState(item?.description ?? '');
  const [category, setCategory] = useState(item?.category ?? '');
  const [price, setPrice] = useState(item ? (item.priceCents / 100).toFixed(2) : '');
  const [weight, setWeight] = useState(item ? String(item.deliverySize.weightGrams) : '');
  const [length, setLength] = useState(item ? String(item.deliverySize.dimensionsCm.length) : '');
  const [width, setWidth] = useState(item ? String(item.deliverySize.dimensionsCm.width) : '');
  const [height, setHeight] = useState(item ? String(item.deliverySize.dimensionsCm.height) : '');
  const [profileVersion, setProfileVersion] = useState(
    item ? String(item.deliverySize.profileVersion) : String(profiles[0]?.profileVersion ?? ''),
  );
  const [capacityUnits, setCapacityUnits] = useState(
    item?.deliverySize.capacityUnits === undefined ? '' : String(item.deliverySize.capacityUnits),
  );
  const [inStock, setInStock] = useState(item?.inStock ?? true);
  const [displayOrder, setDisplayOrder] = useState(item ? String(item.displayOrder) : '0');
  const [file, setFile] = useState<File>();
  const [error, setError] = useState('');
  const activeProfiles = profiles.filter(
    (profile) => profile.status === 'ACTIVE' && profile.capacityRule,
  );

  function submit(event: FormEvent) {
    event.preventDefault();
    const values = [
      Number(price),
      Number(weight),
      Number(length),
      Number(width),
      Number(height),
      Number(profileVersion),
      Number(displayOrder),
    ];
    if (
      !name.trim() ||
      !Number.isInteger(Math.round(values[0] * 100)) ||
      values[0] <= 0 ||
      !values.slice(1, 6).every((value) => Number.isFinite(value) && value > 0) ||
      !Number.isInteger(values[5])
    ) {
      setError(
        'Enter a name, a positive USD price, packaged weight, three dimensions and a packing profile.',
      );
      return;
    }
    const body: CreateItemBody = {
      name: name.trim(),
      description: description.trim() || undefined,
      category: category.trim() || undefined,
      priceCents: Math.round(Number(price) * 100),
      displayOrder: Number.isFinite(values[6]) ? values[6] : 0,
      inStock,
      deliverySize: {
        weightGrams: Number(weight),
        dimensionsCm: { length: Number(length), width: Number(width), height: Number(height) },
        profileVersion: Number(profileVersion),
        ...(capacityUnits.trim() ? { capacityUnits: Number(capacityUnits) } : {}),
      },
    };
    onSubmit(body, file);
  }

  return (
    <Dialog open onClose={pending ? undefined : onClose} fullWidth maxWidth="sm">
      <form onSubmit={submit} noValidate>
        <DialogTitle>{item ? 'Edit catalogue item' : 'Add catalogue item'}</DialogTitle>
        <DialogContent>
          <Stack spacing={2} sx={{ pt: 1 }}>
            <Typography variant="body2" color="text.secondary">
              Describe one fully packaged sale unit. The delivery size is used for vehicle capacity
              checks.
            </Typography>
            {error ? <Alert severity="error">{error}</Alert> : null}
            <Stack direction="row" spacing={2} sx={{ alignItems: 'center' }}>
              <Avatar
                src={itemImage(item ?? ({} as WireFoodItem))}
                variant="rounded"
                sx={{ width: 64, height: 64 }}
              >
                <AddPhotoAlternateIcon />
              </Avatar>
              <Button component="label" variant="outlined">
                {file ? file.name : 'Choose photo'}
                <input
                  hidden
                  type="file"
                  accept="image/jpeg,image/png"
                  onChange={(event) => {
                    const picked = event.target.files?.[0];
                    event.target.value = '';
                    if (picked) setFile(picked);
                  }}
                />
              </Button>
            </Stack>
            {!item ? (
              <Typography variant="caption" color="text.secondary">
                You can add the photo after the item is created; the API validates the actual image
                bytes.
              </Typography>
            ) : null}
            <TextField
              required
              label="Item name"
              value={name}
              onChange={(event) => setName(event.target.value)}
              slotProps={{ htmlInput: { maxLength: 100 } }}
            />
            <TextField
              label="Description"
              value={description}
              onChange={(event) => setDescription(event.target.value)}
              multiline
              minRows={2}
              slotProps={{ htmlInput: { maxLength: 1000 } }}
            />
            <TextField
              label="Category"
              value={category}
              onChange={(event) => setCategory(event.target.value)}
              helperText="Optional Flow label"
              slotProps={{ htmlInput: { maxLength: 80 } }}
            />
            <TextField
              required
              label="Price (USD)"
              value={price}
              onChange={(event) => setPrice(event.target.value)}
              type="number"
              slotProps={{ htmlInput: { min: 0.01, step: '0.01' } }}
            />
            <Stack direction={{ xs: 'column', sm: 'row' }} spacing={2}>
              <TextField
                required
                label="Packaged weight (g)"
                value={weight}
                onChange={(event) => setWeight(event.target.value)}
                type="number"
                slotProps={{ htmlInput: { min: 1, step: 1 } }}
              />
              <TextField
                label="Display order"
                value={displayOrder}
                onChange={(event) => setDisplayOrder(event.target.value)}
                type="number"
              />
            </Stack>
            <Typography variant="subtitle2">Packaged dimensions (cm)</Typography>
            <Stack direction="row" spacing={1.5}>
              <TextField
                required
                label="Length"
                value={length}
                onChange={(event) => setLength(event.target.value)}
                type="number"
                slotProps={{ htmlInput: { min: 0.1, step: '0.1' } }}
              />
              <TextField
                required
                label="Width"
                value={width}
                onChange={(event) => setWidth(event.target.value)}
                type="number"
                slotProps={{ htmlInput: { min: 0.1, step: '0.1' } }}
              />
              <TextField
                required
                label="Height"
                value={height}
                onChange={(event) => setHeight(event.target.value)}
                type="number"
                slotProps={{ htmlInput: { min: 0.1, step: '0.1' } }}
              />
            </Stack>
            <TextField
              required
              select
              label="Approved packing profile"
              value={profileVersion}
              onChange={(event) => setProfileVersion(event.target.value)}
            >
              {activeProfiles.map((profile) => (
                <MenuItem key={profile.profileVersion} value={profile.profileVersion}>
                  {profile.name} · v{profile.profileVersion}
                </MenuItem>
              ))}
              {!activeProfiles.length ? (
                <MenuItem value="" disabled>
                  No approved numeric profile
                </MenuItem>
              ) : null}
            </TextField>
            <TextField
              label="Capacity units (optional)"
              value={capacityUnits}
              onChange={(event) => setCapacityUnits(event.target.value)}
              type="number"
              slotProps={{ htmlInput: { min: 0.001, step: '0.001' } }}
              helperText="Leave blank for the server-calculated minimum."
            />
            <FormControlLabel
              control={
                <Checkbox
                  checked={inStock}
                  onChange={(event) => setInStock(event.target.checked)}
                />
              }
              label="In stock"
            />
          </Stack>
        </DialogContent>
        <DialogActions>
          <Button onClick={onClose} disabled={pending}>
            Cancel
          </Button>
          <Button type="submit" variant="contained" disabled={pending || !activeProfiles.length}>
            {pending ? 'Saving…' : item ? 'Save item' : 'Create item'}
          </Button>
        </DialogActions>
      </form>
    </Dialog>
  );
}

export function ShopCataloguePage() {
  const { shopId = '' } = useParams();
  const shop = useGetShopQuery(shopId, { skip: !shopId });
  const items = useListShopItemsQuery({ shopId }, { skip: !shopId });
  const profiles = useListPackingProfilesQuery(shopId, { skip: !shopId });
  const [createItem, createState] = useCreateShopItemMutation();
  const [updateItem, updateState] = useUpdateShopItemMutation();
  const [archiveItem, archiveState] = useArchiveShopItemMutation();
  const [uploadImage, uploadState] = useUploadShopImageMutation();
  const [dialog, setDialog] = useState<WireFoodItem | 'new' | null>(null);
  const [error, setError] = useState<NormalizedApiError>();
  const [filter, setFilter] = useState<'ALL' | 'ACTIVE' | 'ARCHIVED'>('ALL');
  const rows = useMemo(
    () =>
      (items.data?.items ?? [])
        .filter((item) => filter === 'ALL' || item.status === filter)
        .sort((left, right) => left.displayOrder - right.displayOrder),
    [filter, items.data],
  );

  async function save(body: CreateItemBody, file?: File) {
    setError(undefined);
    try {
      const saved =
        dialog === 'new'
          ? await createItem({ shopId, ...body, idempotencyKey: newIdempotencyKey() }).unwrap()
          : await updateItem({
              shopId,
              itemId: (dialog as WireFoodItem)._id,
              expectedVersion: (dialog as WireFoodItem).version,
              ...body,
              idempotencyKey: newIdempotencyKey(),
            }).unwrap();
      if (file) {
        const base64 = await readImageBase64(file);
        await uploadImage({
          shopId,
          itemId: saved._id,
          expectedVersion: saved.version,
          base64,
          idempotencyKey: newIdempotencyKey(),
        }).unwrap();
      }
      setDialog(null);
      await items.refetch();
    } catch (caught) {
      setError(caught as NormalizedApiError);
      await items.refetch();
    }
  }

  async function archive(item: WireFoodItem) {
    setError(undefined);
    try {
      await archiveItem({
        shopId,
        itemId: item._id,
        expectedVersion: item.version,
        idempotencyKey: newIdempotencyKey(),
      }).unwrap();
      await items.refetch();
    } catch (caught) {
      setError(caught as NormalizedApiError);
      await items.refetch();
    }
  }

  if (shop.isLoading || items.isLoading || profiles.isLoading)
    return <Typography>Loading catalogue…</Typography>;
  if (shop.error)
    return (
      <ApiError error={shop.error as NormalizedApiError} onRetry={() => void shop.refetch()} />
    );
  if (!shop.data) return null;
  const pending =
    createState.isLoading ||
    updateState.isLoading ||
    archiveState.isLoading ||
    uploadState.isLoading;
  return (
    <Stack spacing={3}>
      <PageHeader
        title="Catalogue"
        description="Manage the items customers see in the delivery Flow."
        crumbs={[{ label: shop.data.name, to: `/shop/${shopId}/profile` }, { label: 'Catalogue' }]}
        actions={
          <Button variant="contained" startIcon={<AddIcon />} onClick={() => setDialog('new')}>
            Add item
          </Button>
        }
      />
      <Alert severity={shop.data.approvalState === 'APPROVED' ? 'success' : 'info'}>
        {shop.data.approvalState === 'APPROVED'
          ? 'Approved branch: active, in-stock items can appear in the customer Flow.'
          : 'Awaiting approval: you can prepare this catalogue, but it is not customer-visible yet.'}
      </Alert>
      {error ? <ApiError error={error} /> : null}
      <Stack direction="row" spacing={1}>
        {(['ALL', 'ACTIVE', 'ARCHIVED'] as const).map((value) => (
          <Button
            key={value}
            variant={filter === value ? 'contained' : 'outlined'}
            size="small"
            onClick={() => setFilter(value)}
          >
            {value[0] + value.slice(1).toLowerCase()}
          </Button>
        ))}
      </Stack>
      {!rows.length ? (
        <Card>
          <CardContent>
            <EmptyState
              title={
                filter === 'ALL' ? 'No catalogue items yet' : `No ${filter.toLowerCase()} items`
              }
              description="Add a fully packaged item to start building this branch's menu."
              action={
                <Button variant="contained" onClick={() => setDialog('new')}>
                  Add item
                </Button>
              }
            />
          </CardContent>
        </Card>
      ) : (
        <Stack spacing={1.5}>
          {rows.map((item) => (
            <Card key={item._id} variant="outlined">
              <CardContent>
                <Stack
                  direction={{ xs: 'column', sm: 'row' }}
                  spacing={2}
                  sx={{ alignItems: { sm: 'center' } }}
                >
                  <Avatar src={itemImage(item)} variant="rounded" sx={{ width: 64, height: 64 }}>
                    <Inventory2Icon />
                  </Avatar>
                  <Stack sx={{ flex: 1, minWidth: 0 }}>
                    <Typography variant="h3">{item.name}</Typography>
                    <Typography variant="body2" color="text.secondary">
                      {item.category || 'Uncategorised'} · {centsToUsd(item.priceCents)} ·{' '}
                      {item.deliverySize.weightGrams}g · {item.deliverySize.dimensionsCm.length}×
                      {item.deliverySize.dimensionsCm.width}×{item.deliverySize.dimensionsCm.height}
                      cm
                    </Typography>
                    <Typography variant="caption" color="text.secondary">
                      {item.inStock ? 'In stock' : 'Out of stock'} · {item.status} · profile v
                      {item.deliverySize.profileVersion}
                    </Typography>
                  </Stack>
                  <Stack direction="row" spacing={1}>
                    <Button size="small" startIcon={<EditIcon />} onClick={() => setDialog(item)}>
                      Edit
                    </Button>
                    {item.status !== 'ARCHIVED' ? (
                      <Button
                        size="small"
                        color="warning"
                        startIcon={<ArchiveIcon />}
                        onClick={() => void archive(item)}
                        disabled={pending}
                      >
                        Archive
                      </Button>
                    ) : null}
                  </Stack>
                </Stack>
              </CardContent>
            </Card>
          ))}
        </Stack>
      )}
      {dialog ? (
        <ItemForm
          item={dialog === 'new' ? undefined : dialog}
          profiles={profiles.data ?? []}
          pending={pending}
          onClose={() => setDialog(null)}
          onSubmit={(body, file) => void save(body, file)}
        />
      ) : null}
    </Stack>
  );
}
