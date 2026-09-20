import Alert from '@mui/material/Alert';
import Button from '@mui/material/Button';
import MenuItem from '@mui/material/MenuItem';
import Stack from '@mui/material/Stack';
import TextField from '@mui/material/TextField';
import Typography from '@mui/material/Typography';
import { useState } from 'react';
import { useNavigate } from 'react-router-dom';

import { HANDLING_CODES, VEHICLE_CLASSES } from '@/api/dto/common';
import { useCreateVehicleMutation, useListVehiclesQuery } from '@/api/endpoints/fleet';
import type { NormalizedApiError } from '@/api/errors';
import { POLLING, polled } from '@/api/polling';
import type { Vehicle } from '@/api/types';
import { useTownScope } from '@/app/useTownScope';
import { FormDialog } from '@/components/FormDialog';
import { PageHeader } from '@/components/PageHeader';
import { ResourceTable, type Column } from '@/components/ResourceTable';
import { StatusChip } from '@/components/StatusChip';
import { describeStatus, vehicleServiceMeta } from '@/components/statusMeta';
import { useGuardedAction } from '@/lib/useGuardedAction';
import { useNumberQueryParam, useQueryParam } from '@/lib/useUrlState';

const PAGE_SIZE = 25;
const SERVICE_STATUSES = ['IN_SERVICE', 'MAINTENANCE', 'OUT_OF_SERVICE'] as const;

/** Numeric capacity input; a blank field stays unknown rather than defaulting to zero. */
function CapacityField({
  label,
  value,
  onChange,
  unit,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  unit: string;
}) {
  return (
    <TextField
      label={label}
      value={value}
      onChange={(event) => onChange(event.target.value)}
      fullWidth
      required
      inputMode="decimal"
      helperText={`Measured in ${unit}. Leave blank only if it is genuinely unknown — it is never assumed.`}
      slotProps={{ input: { endAdornment: <Typography variant="caption">{unit}</Typography> } }}
    />
  );
}

/**
 * Vehicle management (specification section 4.4). Units sit beside every input and a
 * missing capacity is visibly incomplete, never zero or unlimited by default.
 */
export function VehiclesPage() {
  const navigate = useNavigate();
  const { townId, towns } = useTownScope();
  const [serviceStatus, setServiceStatus] = useQueryParam('serviceStatus');
  const [skip, setSkip] = useNumberQueryParam('skip', 0);
  const [createOpen, setCreateOpen] = useState(false);

  const query = useListVehiclesQuery(
    { townId, serviceStatus: serviceStatus as never, limit: PAGE_SIZE, skip },
    polled(POLLING.queue),
  );
  const [createVehicle] = useCreateVehicleMutation();

  const [registration, setRegistration] = useState('');
  const [vehicleClass, setVehicleClass] = useState<(typeof VEHICLE_CLASSES)[number]>('MOTORCYCLE');
  const [label, setLabel] = useState('');
  const [maxWeight, setMaxWeight] = useState('');
  const [length, setLength] = useState('');
  const [width, setWidth] = useState('');
  const [height, setHeight] = useState('');
  const [openingWidth, setOpeningWidth] = useState('');
  const [openingHeight, setOpeningHeight] = useState('');
  const [handling, setHandling] = useState<string[]>([]);
  const [formTownId, setFormTownId] = useState(townId ?? '');

  const numbers = [maxWeight, length, width, height, openingWidth, openingHeight].map((value) =>
    Number.parseFloat(value),
  );
  const capacityComplete = numbers.every((value) => Number.isFinite(value) && value > 0);

  const create = useGuardedAction({
    run: () =>
      createVehicle({
        townId: formTownId,
        registration: registration.trim(),
        vehicleClass,
        label: label.trim() || undefined,
        maxWeightKg: numbers[0]!,
        cargoDimensionsCm: { lengthCm: numbers[1]!, widthCm: numbers[2]!, heightCm: numbers[3]! },
        accessOpeningCm: { widthCm: numbers[4]!, heightCm: numbers[5]! },
        handlingCapabilities: handling as never,
      }).unwrap(),
    successMessage: 'Vehicle created.',
    onSuccess: () => {
      setCreateOpen(false);
      setRegistration('');
    },
  });

  const columns: Array<Column<Vehicle>> = [
    {
      id: 'registration',
      header: 'Registration',
      render: (vehicle) => (
        <Stack spacing={0.25}>
          <Typography variant="body2" sx={{ fontWeight: 600 }}>
            {vehicle.registration}
          </Typography>
          {vehicle.label ? (
            <Typography variant="caption" color="text.secondary">
              {vehicle.label}
            </Typography>
          ) : null}
        </Stack>
      ),
    },
    { id: 'class', header: 'Class', render: (vehicle) => vehicle.vehicleClass.toLowerCase() },
    {
      id: 'payload',
      header: 'Usable payload',
      align: 'right',
      render: (vehicle) => `${vehicle.capacity.maxWeightKg} kg`,
    },
    {
      id: 'cargo',
      header: 'Cargo (L×W×H)',
      render: (vehicle) =>
        `${vehicle.capacity.cargoDimensionsCm.lengthCm}×${vehicle.capacity.cargoDimensionsCm.widthCm}×${vehicle.capacity.cargoDimensionsCm.heightCm} cm`,
    },
    {
      id: 'opening',
      header: 'Opening (W×H)',
      render: (vehicle) =>
        `${vehicle.capacity.accessOpeningCm.widthCm}×${vehicle.capacity.accessOpeningCm.heightCm} cm`,
    },
    {
      id: 'handling',
      header: 'Handling',
      render: (vehicle) => vehicle.handlingCapabilities.join(', ') || 'None recorded',
    },
    {
      id: 'status',
      header: 'Service state',
      render: (vehicle) => (
        <StatusChip descriptor={describeStatus(vehicleServiceMeta, vehicle.serviceStatus)} />
      ),
    },
    {
      id: 'driver',
      header: 'Assigned driver',
      render: (vehicle) => vehicle.linkedDriverId?.slice(-6) ?? 'Unassigned',
    },
  ];

  return (
    <>
      <PageHeader
        title="Vehicles"
        description="Capacity, handling capability and service state."
        crumbs={[{ label: 'Operations' }, { label: 'Vehicles' }]}
        actions={
          <Button
            variant="contained"
            onClick={() => setCreateOpen(true)}
            disabled={towns.length === 0}
          >
            Add vehicle
          </Button>
        }
      />

      <Stack spacing={2}>
        <TextField
          select
          size="small"
          label="Service state"
          value={serviceStatus ?? ''}
          onChange={(event) => {
            setServiceStatus(event.target.value || null);
            setSkip(0);
          }}
          sx={{ minWidth: 220, maxWidth: 260 }}
        >
          <MenuItem value="">Any state</MenuItem>
          {SERVICE_STATUSES.map((value) => (
            <MenuItem key={value} value={value}>
              {describeStatus(vehicleServiceMeta, value).label}
            </MenuItem>
          ))}
        </TextField>

        <ResourceTable
          caption="Vehicles"
          columns={columns}
          rows={query.data?.items ?? []}
          getRowId={(vehicle) => vehicle.id}
          isLoading={query.isLoading}
          isFetching={query.isFetching}
          error={query.error as NormalizedApiError | undefined}
          onRetry={() => void query.refetch()}
          emptyTitle="No vehicles found"
          emptyDescription="Add a vehicle, or switch town to see another fleet."
          onRowClick={(vehicle) => navigate(`/vehicles/${vehicle.id}`)}
          page={{
            limit: PAGE_SIZE,
            skip,
            hasProbableNextPage: query.data?.hasProbableNextPage ?? false,
            onSkipChange: setSkip,
          }}
        />
      </Stack>

      <FormDialog
        open={createOpen}
        title="Add a vehicle"
        description="Capacity decides which loads this vehicle can carry, so every measurement is required."
        submitLabel="Create vehicle"
        pending={create.pending}
        error={create.error}
        unconfirmed={create.unconfirmed}
        onRetryUnconfirmed={() => void create.retryUnconfirmed()}
        disabled={registration.trim().length < 2 || !capacityComplete || formTownId === ''}
        onClose={() => setCreateOpen(false)}
        onSubmit={() => void create.submit()}
        maxWidth="md"
      >
        {!capacityComplete ? (
          <Alert severity="info">
            Capacity is incomplete. Missing capacity is never treated as zero or unlimited.
          </Alert>
        ) : null}
        <TextField
          select
          label="Town"
          value={formTownId}
          onChange={(event) => setFormTownId(event.target.value)}
          fullWidth
          required
        >
          {towns.map((town) => (
            <MenuItem key={town.id} value={town.id}>
              {town.name}
            </MenuItem>
          ))}
        </TextField>
        <TextField
          label="Registration"
          value={registration}
          onChange={(event) => setRegistration(event.target.value)}
          fullWidth
          required
        />
        <TextField
          select
          label="Class"
          value={vehicleClass}
          onChange={(event) => setVehicleClass(event.target.value as typeof vehicleClass)}
          fullWidth
        >
          {VEHICLE_CLASSES.map((value) => (
            <MenuItem key={value} value={value}>
              {value.toLowerCase()}
            </MenuItem>
          ))}
        </TextField>
        <TextField
          label="Label"
          value={label}
          onChange={(event) => setLabel(event.target.value)}
          fullWidth
        />
        <CapacityField label="Usable payload" value={maxWeight} onChange={setMaxWeight} unit="kg" />
        <Stack direction={{ xs: 'column', md: 'row' }} spacing={2}>
          <CapacityField label="Cargo length" value={length} onChange={setLength} unit="cm" />
          <CapacityField label="Cargo width" value={width} onChange={setWidth} unit="cm" />
          <CapacityField label="Cargo height" value={height} onChange={setHeight} unit="cm" />
        </Stack>
        <Stack direction={{ xs: 'column', md: 'row' }} spacing={2}>
          <CapacityField
            label="Opening width"
            value={openingWidth}
            onChange={setOpeningWidth}
            unit="cm"
          />
          <CapacityField
            label="Opening height"
            value={openingHeight}
            onChange={setOpeningHeight}
            unit="cm"
          />
        </Stack>
        <TextField
          select
          label="Handling capabilities"
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
          {HANDLING_CODES.map((code) => (
            <MenuItem key={code} value={code}>
              {code.replaceAll('_', ' ').toLowerCase()}
            </MenuItem>
          ))}
        </TextField>
      </FormDialog>
    </>
  );
}
