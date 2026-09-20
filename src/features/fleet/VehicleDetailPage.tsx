import Button from '@mui/material/Button';
import MenuItem from '@mui/material/MenuItem';
import Skeleton from '@mui/material/Skeleton';
import Stack from '@mui/material/Stack';
import TextField from '@mui/material/TextField';
import { useState } from 'react';
import { useParams } from 'react-router-dom';

import { HANDLING_CODES } from '@/api/dto/common';
import { useListVehiclesQuery, useUpdateVehicleMutation } from '@/api/endpoints/fleet';
import type { NormalizedApiError } from '@/api/errors';
import { useTownScope } from '@/app/useTownScope';
import { ApiError } from '@/components/ApiError';
import { EmptyState } from '@/components/EmptyState';
import { FormDialog } from '@/components/FormDialog';
import { KeyValue } from '@/components/KeyValue';
import { PageHeader } from '@/components/PageHeader';
import { ReasonField } from '@/components/ReasonField';
import { Section } from '@/components/Section';
import { StatusChip } from '@/components/StatusChip';
import { describeStatus, vehicleServiceMeta } from '@/components/statusMeta';
import { useGuardedAction } from '@/lib/useGuardedAction';

const SERVICE_STATUSES = ['IN_SERVICE', 'MAINTENANCE', 'OUT_OF_SERVICE'] as const;

/**
 * Vehicle detail. Like drivers, there is no read-by-ID route yet (specification
 * section 11, P1), so the record comes from the town's vehicle list.
 */
export function VehicleDetailPage() {
  const { id = '' } = useParams();
  const { townId, towns } = useTownScope();
  const query = useListVehiclesQuery({ townId, limit: 100 });
  const vehicle = query.data?.items.find((entry) => entry.id === id);

  const [updateVehicle] = useUpdateVehicleMutation();
  const [open, setOpen] = useState(false);
  const [serviceStatus, setServiceStatus] =
    useState<(typeof SERVICE_STATUSES)[number]>('IN_SERVICE');
  const [handling, setHandling] = useState<string[]>([]);
  const [reason, setReason] = useState('');

  const update = useGuardedAction({
    run: () =>
      updateVehicle({
        id,
        serviceStatus,
        handlingCapabilities: handling as never,
        reason: reason.trim() || undefined,
        expectedVersion: vehicle?.version,
      }).unwrap(),
    refresh: () => void query.refetch(),
    successMessage: 'Vehicle updated.',
    onSuccess: () => setOpen(false),
  });

  if (query.isLoading) return <Skeleton height={280} />;

  if (!vehicle) {
    return (
      <>
        <PageHeader
          title="Vehicle"
          crumbs={[{ label: 'Vehicles', to: '/vehicles' }, { label: 'Detail' }]}
        />
        {query.error ? (
          <ApiError
            error={query.error as NormalizedApiError}
            onRetry={() => void query.refetch()}
          />
        ) : (
          <EmptyState
            title="This vehicle is not on the loaded page"
            description="A vehicle read-by-ID endpoint is a backend addition (specification section 11, P1). Open the vehicle from its town's list."
          />
        )}
      </>
    );
  }

  return (
    <>
      <PageHeader
        title={vehicle.registration}
        description={vehicle.label ?? vehicle.vehicleClass.toLowerCase()}
        crumbs={[{ label: 'Vehicles', to: '/vehicles' }, { label: vehicle.registration }]}
        meta={
          <Stack direction="row" spacing={1} sx={{ mt: 1 }}>
            <StatusChip
              descriptor={describeStatus(vehicleServiceMeta, vehicle.serviceStatus)}
              size="medium"
            />
          </Stack>
        }
        actions={
          <Button
            variant="contained"
            onClick={() => {
              setServiceStatus(vehicle.serviceStatus);
              setHandling(vehicle.handlingCapabilities);
              setOpen(true);
            }}
          >
            Edit vehicle
          </Button>
        }
      />

      <Section title="Capacity and capability">
        <KeyValue
          entries={[
            {
              label: 'Town',
              value: towns.find((town) => town.id === vehicle.townId)?.name ?? vehicle.townId,
            },
            { label: 'Class', value: vehicle.vehicleClass.toLowerCase() },
            { label: 'Usable payload', value: `${vehicle.capacity.maxWeightKg} kg` },
            {
              label: 'Cargo dimensions',
              value: `${vehicle.capacity.cargoDimensionsCm.lengthCm} × ${vehicle.capacity.cargoDimensionsCm.widthCm} × ${vehicle.capacity.cargoDimensionsCm.heightCm} cm`,
            },
            {
              label: 'Access opening',
              value: `${vehicle.capacity.accessOpeningCm.widthCm} × ${vehicle.capacity.accessOpeningCm.heightCm} cm`,
            },
            {
              label: 'Handling',
              value: vehicle.handlingCapabilities.join(', ') || 'None recorded',
            },
            { label: 'Assigned driver', value: vehicle.linkedDriverId },
          ]}
        />
      </Section>

      <FormDialog
        open={open}
        title="Edit vehicle"
        submitLabel="Save changes"
        pending={update.pending}
        error={update.error}
        unconfirmed={update.unconfirmed}
        onRetryUnconfirmed={() => void update.retryUnconfirmed()}
        onClose={() => setOpen(false)}
        onSubmit={() => void update.submit()}
      >
        <TextField
          select
          label="Service state"
          value={serviceStatus}
          onChange={(event) => setServiceStatus(event.target.value as typeof serviceStatus)}
          fullWidth
        >
          {SERVICE_STATUSES.map((value) => (
            <MenuItem key={value} value={value}>
              {describeStatus(vehicleServiceMeta, value).label}
            </MenuItem>
          ))}
        </TextField>
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
        <ReasonField value={reason} onChange={setReason} required={false} />
      </FormDialog>
    </>
  );
}
