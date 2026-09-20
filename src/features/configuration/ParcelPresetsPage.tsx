import Button from '@mui/material/Button';
import MenuItem from '@mui/material/MenuItem';
import Stack from '@mui/material/Stack';
import TextField from '@mui/material/TextField';
import Typography from '@mui/material/Typography';
import { useState } from 'react';

import { HANDLING_CODES } from '@/api/dto/common';
import {
  useCreateParcelPresetMutation,
  useListParcelPresetsQuery,
  useUpdateParcelPresetMutation,
} from '@/api/endpoints/configuration';
import type { NormalizedApiError } from '@/api/errors';
import type { ParcelPreset } from '@/api/types';
import { useTownScope } from '@/app/useTownScope';
import { EmptyState } from '@/components/EmptyState';
import { FormDialog } from '@/components/FormDialog';
import { PageHeader } from '@/components/PageHeader';
import { PermissionGate } from '@/components/PermissionGate';
import { ReasonField } from '@/components/ReasonField';
import { ResourceTable, type Column } from '@/components/ResourceTable';
import { StatusChip } from '@/components/StatusChip';
import { useGuardedAction } from '@/lib/useGuardedAction';

/**
 * Parcel presets (specification section 4.8): labels, examples, dimensions, weight and
 * handling, matching the minimal-typing customer flow.
 */
export function ParcelPresetsPage() {
  const { townId, towns } = useTownScope();
  const query = useListParcelPresetsQuery(
    { townId: townId ?? '', includeRetired: true },
    { skip: !townId },
  );
  const [createPreset] = useCreateParcelPresetMutation();
  const [updatePreset] = useUpdateParcelPresetMutation();

  const [dialog, setDialog] = useState<'create' | 'edit' | null>(null);
  const [editing, setEditing] = useState<ParcelPreset | null>(null);
  const [code, setCode] = useState('');
  const [label, setLabel] = useState('');
  const [examples, setExamples] = useState('');
  const [parcelClass, setParcelClass] = useState('');
  const [maxWeight, setMaxWeight] = useState('');
  const [length, setLength] = useState('');
  const [width, setWidth] = useState('');
  const [height, setHeight] = useState('');
  const [handling, setHandling] = useState<string[]>([]);
  const [status, setStatus] = useState<'ACTIVE' | 'RETIRED'>('ACTIVE');
  const [reason, setReason] = useState('');

  const numbers = [maxWeight, length, width, height].map((value) => Number.parseFloat(value));
  const measurementsComplete = numbers.every((value) => Number.isFinite(value) && value > 0);

  const create = useGuardedAction({
    run: () => {
      if (!townId) throw new Error('unreachable: guarded by the dialog');
      return createPreset({
        townId,
        code: code.trim(),
        label: label.trim(),
        examples: examples
          .split(',')
          .map((example) => example.trim())
          .filter(Boolean),
        parcelClass: parcelClass.trim(),
        maxWeightKg: numbers[0]!,
        maxDimensionsCm: { lengthCm: numbers[1]!, widthCm: numbers[2]!, heightCm: numbers[3]! },
        supportedHandling: handling as never,
      }).unwrap();
    },
    refresh: () => void query.refetch(),
    successMessage: 'Parcel preset created.',
    onSuccess: () => setDialog(null),
  });

  const update = useGuardedAction({
    run: () => {
      if (!editing) throw new Error('unreachable: guarded by the dialog');
      return updatePreset({
        id: editing.id,
        label: label.trim(),
        examples: examples
          .split(',')
          .map((example) => example.trim())
          .filter(Boolean),
        supportedHandling: handling as never,
        status,
        reason: reason.trim() || undefined,
        expectedVersion: editing.version,
      }).unwrap();
    },
    refresh: () => void query.refetch(),
    successMessage: 'Parcel preset updated.',
    onSuccess: () => setDialog(null),
  });

  function openCreate() {
    setEditing(null);
    setCode('');
    setLabel('');
    setExamples('');
    setParcelClass('');
    setMaxWeight('');
    setLength('');
    setWidth('');
    setHeight('');
    setHandling([]);
    create.reset();
    setDialog('create');
  }

  function openEdit(preset: ParcelPreset) {
    setEditing(preset);
    setCode(preset.code);
    setLabel(preset.label);
    setExamples(preset.examples.join(', '));
    setParcelClass(preset.parcelClass);
    setMaxWeight(String(preset.maxWeightKg));
    setLength(String(preset.maxDimensionsCm.lengthCm));
    setWidth(String(preset.maxDimensionsCm.widthCm));
    setHeight(String(preset.maxDimensionsCm.heightCm));
    setHandling(preset.supportedHandling);
    setStatus(preset.status);
    setReason('');
    update.reset();
    setDialog('edit');
  }

  const columns: Array<Column<ParcelPreset>> = [
    {
      id: 'label',
      header: 'Preset',
      render: (preset) => (
        <Stack spacing={0.25}>
          <Typography variant="body2" sx={{ fontWeight: 600 }}>
            {preset.label}
          </Typography>
          <Typography variant="caption" color="text.secondary">
            {preset.code} · class {preset.parcelClass}
          </Typography>
        </Stack>
      ),
    },
    {
      id: 'examples',
      header: 'Examples',
      minWidth: 200,
      render: (preset) => preset.examples.join(', ') || '—',
    },
    {
      id: 'weight',
      header: 'Max weight',
      align: 'right',
      render: (preset) => `${preset.maxWeightKg} kg`,
    },
    {
      id: 'dimensions',
      header: 'Max dimensions',
      render: (preset) =>
        `${preset.maxDimensionsCm.lengthCm} × ${preset.maxDimensionsCm.widthCm} × ${preset.maxDimensionsCm.heightCm} cm`,
    },
    {
      id: 'handling',
      header: 'Handling',
      render: (preset) => preset.supportedHandling.join(', ') || 'None',
    },
    {
      id: 'status',
      header: 'Status',
      render: (preset) => (
        <StatusChip
          descriptor={{
            label: preset.status === 'ACTIVE' ? 'Active' : 'Retired',
            tone: preset.status === 'ACTIVE' ? 'positive' : 'neutral',
            icon: preset.status === 'ACTIVE' ? 'available' : 'closed',
          }}
        />
      ),
    },
    {
      id: 'actions',
      header: 'Actions',
      render: (preset) => (
        <PermissionGate
          requirement={{ anyRole: ['admin'] }}
          fallback={
            <Typography variant="caption" color="text.secondary">
              Read-only
            </Typography>
          }
        >
          <Button size="small" variant="outlined" onClick={() => openEdit(preset)}>
            Edit
          </Button>
        </PermissionGate>
      ),
    },
  ];

  if (!townId) {
    return (
      <>
        <PageHeader
          title="Parcel presets"
          crumbs={[{ label: 'Administration' }, { label: 'Parcel presets' }]}
        />
        <EmptyState
          title="Choose a town"
          description="Presets belong to one town. Select a town in the top bar."
        />
      </>
    );
  }

  return (
    <>
      <PageHeader
        title="Parcel presets"
        description={`Customer-facing presets for ${towns.find((town) => town.id === townId)?.name ?? 'the selected town'}.`}
        crumbs={[{ label: 'Administration' }, { label: 'Parcel presets' }]}
        actions={
          <PermissionGate requirement={{ anyRole: ['admin'] }}>
            <Button variant="contained" onClick={openCreate}>
              Add preset
            </Button>
          </PermissionGate>
        }
      />

      <ResourceTable
        caption="Parcel presets"
        columns={columns}
        rows={query.data ?? []}
        getRowId={(preset) => preset.id}
        isLoading={query.isLoading}
        isFetching={query.isFetching}
        error={query.error as NormalizedApiError | undefined}
        onRetry={() => void query.refetch()}
        emptyTitle="No parcel presets"
        emptyDescription="Presets keep the customer flow to a few taps; add the common parcel sizes."
      />

      <FormDialog
        open={dialog !== null}
        title={dialog === 'create' ? 'Add a parcel preset' : `Edit ${editing?.label ?? 'preset'}`}
        description="The declared limits are the upper bounds a customer accepts by choosing this preset."
        submitLabel={dialog === 'create' ? 'Create preset' : 'Save preset'}
        pending={dialog === 'create' ? create.pending : update.pending}
        error={dialog === 'create' ? create.error : update.error}
        unconfirmed={dialog === 'create' ? create.unconfirmed : update.unconfirmed}
        onRetryUnconfirmed={() =>
          void (dialog === 'create' ? create.retryUnconfirmed() : update.retryUnconfirmed())
        }
        disabled={
          label.trim() === '' ||
          (dialog === 'create' &&
            (code.trim() === '' || parcelClass.trim() === '' || !measurementsComplete))
        }
        onClose={() => setDialog(null)}
        onSubmit={() => void (dialog === 'create' ? create.submit() : update.submit())}
        maxWidth="md"
      >
        <TextField
          label="Code"
          value={code}
          onChange={(event) => setCode(event.target.value)}
          fullWidth
          required
          disabled={dialog === 'edit'}
        />
        <TextField
          label="Label"
          value={label}
          onChange={(event) => setLabel(event.target.value)}
          fullWidth
          required
        />
        <TextField
          label="Examples"
          value={examples}
          onChange={(event) => setExamples(event.target.value)}
          fullWidth
          helperText="Comma separated, e.g. shoebox, A4 documents."
        />
        <TextField
          label="Parcel class"
          value={parcelClass}
          onChange={(event) => setParcelClass(event.target.value)}
          fullWidth
          required
          disabled={dialog === 'edit'}
          helperText="Matches the class used by the rate card matrix."
        />
        <Stack direction={{ xs: 'column', md: 'row' }} spacing={2}>
          <TextField
            label="Max weight"
            value={maxWeight}
            onChange={(event) => setMaxWeight(event.target.value)}
            fullWidth
            required={dialog === 'create'}
            disabled={dialog === 'edit'}
            inputMode="decimal"
            slotProps={{ input: { endAdornment: <Typography variant="caption">kg</Typography> } }}
          />
          <TextField
            label="Max length"
            value={length}
            onChange={(event) => setLength(event.target.value)}
            fullWidth
            required={dialog === 'create'}
            disabled={dialog === 'edit'}
            inputMode="decimal"
            slotProps={{ input: { endAdornment: <Typography variant="caption">cm</Typography> } }}
          />
          <TextField
            label="Max width"
            value={width}
            onChange={(event) => setWidth(event.target.value)}
            fullWidth
            required={dialog === 'create'}
            disabled={dialog === 'edit'}
            inputMode="decimal"
            slotProps={{ input: { endAdornment: <Typography variant="caption">cm</Typography> } }}
          />
          <TextField
            label="Max height"
            value={height}
            onChange={(event) => setHeight(event.target.value)}
            fullWidth
            required={dialog === 'create'}
            disabled={dialog === 'edit'}
            inputMode="decimal"
            slotProps={{ input: { endAdornment: <Typography variant="caption">cm</Typography> } }}
          />
        </Stack>
        <TextField
          select
          label="Supported handling"
          value={handling}
          onChange={(event) =>
            setHandling(
              typeof event.target.value === 'string'
                ? event.target.value.split(',')
                : event.target.value,
            )
          }
          fullWidth
          slotProps={{ select: { multiple: true } }}
        >
          {HANDLING_CODES.map((codeValue) => (
            <MenuItem key={codeValue} value={codeValue}>
              {codeValue.replaceAll('_', ' ').toLowerCase()}
            </MenuItem>
          ))}
        </TextField>
        {dialog === 'edit' ? (
          <>
            <TextField
              select
              label="Status"
              value={status}
              onChange={(event) => setStatus(event.target.value as 'ACTIVE' | 'RETIRED')}
              fullWidth
            >
              <MenuItem value="ACTIVE">Active</MenuItem>
              <MenuItem value="RETIRED">Retired</MenuItem>
            </TextField>
            <ReasonField value={reason} onChange={setReason} required={false} />
          </>
        ) : null}
      </FormDialog>
    </>
  );
}
