import Alert from '@mui/material/Alert';
import Button from '@mui/material/Button';
import Grid from '@mui/material/Grid';
import MenuItem from '@mui/material/MenuItem';
import Skeleton from '@mui/material/Skeleton';
import Stack from '@mui/material/Stack';
import TextField from '@mui/material/TextField';
import Typography from '@mui/material/Typography';
import { useState } from 'react';
import { useParams } from 'react-router-dom';

import { DRIVER_APPROVAL_STATES, DRIVER_STATUSES } from '@/api/dto/fleet';
import {
  useRecordDriverLocationMutation,
  useSetDriverAvailabilityMutation,
} from '@/api/endpoints/dispatch';
import {
  useListDriversQuery,
  useListVehiclesQuery,
  useUpdateDriverMutation,
} from '@/api/endpoints/fleet';
import type { NormalizedApiError } from '@/api/errors';
import { POLLING, polled } from '@/api/polling';
import { useTownScope } from '@/app/useTownScope';
import { ApiError } from '@/components/ApiError';
import { EmptyState } from '@/components/EmptyState';
import { FormDialog } from '@/components/FormDialog';
import { KeyValue } from '@/components/KeyValue';
import { LocationAge } from '@/components/LocationAge';
import { PageHeader } from '@/components/PageHeader';
import { PermissionGate } from '@/components/PermissionGate';
import { ReasonField, isReasonValid } from '@/components/ReasonField';
import { Section } from '@/components/Section';
import { StatusChip } from '@/components/StatusChip';
import {
  availabilityMeta,
  describeStatus,
  driverApprovalMeta,
  driverStatusMeta,
} from '@/components/statusMeta';
import { formatDateTime } from '@/lib/datetime';
import { useGuardedAction } from '@/lib/useGuardedAction';

type DialogName = 'availability' | 'location' | 'edit' | 'approval' | null;

/**
 * Driver detail (specification section 4.4).
 *
 * The backend has no GET-by-ID driver route yet (section 11, P1), so the record is read
 * from the town's driver list and the page says so when a deep link cannot resolve.
 */
export function DriverDetailPage() {
  const { id = '' } = useParams();
  const { townId, towns } = useTownScope();
  const [dialog, setDialog] = useState<DialogName>(null);
  const close = () => setDialog(null);

  const query = useListDriversQuery({ townId, limit: 100 }, polled(POLLING.queue));
  const vehiclesQuery = useListVehiclesQuery({ townId, limit: 100 });
  const row = query.data?.items.find((entry) => entry.driver.id === id);

  const [setAvailability] = useSetDriverAvailabilityMutation();
  const [recordLocation] = useRecordDriverLocationMutation();
  const [updateDriver] = useUpdateDriverMutation();

  const [availabilityStatus, setAvailabilityStatus] = useState<'AVAILABLE' | 'BREAK' | 'OFF_DUTY'>(
    'AVAILABLE',
  );
  const [availabilityReason, setAvailabilityReason] = useState('');
  const [latitude, setLatitude] = useState('');
  const [longitude, setLongitude] = useState('');
  const [locationReason, setLocationReason] = useState('');
  const [vehicleId, setVehicleId] = useState('');
  const [editReason, setEditReason] = useState('');
  const [serviceStatus, setServiceStatus] = useState<(typeof DRIVER_STATUSES)[number]>('ACTIVE');
  const [approvalState, setApprovalState] =
    useState<(typeof DRIVER_APPROVAL_STATES)[number]>('APPROVED');

  const availability = useGuardedAction({
    run: (_args: void, idempotencyKey: string) =>
      setAvailability({
        driverId: id,
        status: availabilityStatus,
        reason: availabilityReason.trim(),
        expectedVersion: row?.presence?.version,
        idempotencyKey,
      }).unwrap(),
    refresh: () => void query.refetch(),
    successMessage: (result) =>
      result.deferred
        ? 'Recorded. It takes effect after the current job finishes.'
        : 'Availability updated.',
    onSuccess: close,
  });

  const location = useGuardedAction({
    run: () =>
      recordLocation({
        driverId: id,
        latitude: Number.parseFloat(latitude),
        longitude: Number.parseFloat(longitude),
        reason: locationReason.trim(),
        expectedVersion: row?.presence?.version,
      }).unwrap(),
    refresh: () => void query.refetch(),
    successMessage: 'Position recorded. This does not change the driver’s availability.',
    onSuccess: close,
  });

  const edit = useGuardedAction({
    run: () =>
      updateDriver({
        id,
        assignedVehicleId: vehicleId || undefined,
        reason: editReason.trim() || undefined,
        expectedVersion: row?.driver.version,
      }).unwrap(),
    refresh: () => void query.refetch(),
    successMessage: 'Driver updated.',
    onSuccess: close,
  });

  const approval = useGuardedAction({
    run: () =>
      updateDriver({
        id,
        status: serviceStatus,
        approvalState,
        reason: editReason.trim(),
        expectedVersion: row?.driver.version,
      }).unwrap(),
    refresh: () => void query.refetch(),
    successMessage: 'Approval or service status updated.',
    onSuccess: close,
  });

  if (query.isLoading) return <Skeleton height={320} />;

  if (!row) {
    return (
      <>
        <PageHeader
          title="Driver"
          crumbs={[{ label: 'Drivers', to: '/drivers' }, { label: 'Detail' }]}
        />
        {query.error ? (
          <ApiError
            error={query.error as NormalizedApiError}
            onRetry={() => void query.refetch()}
          />
        ) : (
          <EmptyState
            title="This driver is not on the loaded page"
            description="There is no driver read-by-ID endpoint yet (specification section 11, P1), so this page reads the town's driver list. Switch to the driver's town or open them from the list."
          />
        )}
      </>
    );
  }

  const { driver, presence } = row;
  const onJob = Boolean(presence?.currentBookingId);

  return (
    <>
      <PageHeader
        title={driver.name}
        description={driver.normalizedPhone}
        crumbs={[{ label: 'Drivers', to: '/drivers' }, { label: driver.name }]}
        meta={
          <Stack direction="row" spacing={1} sx={{ mt: 1, flexWrap: 'wrap', gap: 1 }}>
            <StatusChip
              descriptor={describeStatus(driverStatusMeta, driver.status)}
              size="medium"
            />
            <StatusChip
              descriptor={describeStatus(driverApprovalMeta, driver.approvalState)}
              size="medium"
            />
            {presence ? (
              <StatusChip
                descriptor={describeStatus(availabilityMeta, presence.availability)}
                size="medium"
              />
            ) : null}
          </Stack>
        }
        actions={
          <>
            <Button variant="outlined" onClick={() => setDialog('availability')}>
              Set availability
            </Button>
            <Button variant="outlined" onClick={() => setDialog('location')}>
              Record position
            </Button>
            <Button variant="outlined" onClick={() => setDialog('edit')}>
              Link vehicle
            </Button>
            <PermissionGate requirement={{ anyRole: ['admin'] }}>
              <Button variant="contained" onClick={() => setDialog('approval')}>
                Approval and service status
              </Button>
            </PermissionGate>
          </>
        }
      />

      <Grid container spacing={2}>
        <Grid size={{ xs: 12, md: 6 }}>
          <Section title="Driver record">
            <KeyValue
              entries={[
                {
                  label: 'Town',
                  value: towns.find((town) => town.id === driver.townId)?.name ?? driver.townId,
                },
                { label: 'Ownership', value: driver.ownershipModel },
                { label: 'Staff reference', value: driver.staffReference },
                { label: 'Allowed classes', value: driver.allowedVehicleClasses.join(', ') },
                { label: 'Linked vehicle', value: driver.assignedVehicleId },
                {
                  label: 'Licence expires',
                  value: driver.checks.licenseExpiresAt
                    ? formatDateTime(driver.checks.licenseExpiresAt)
                    : undefined,
                },
                {
                  label: 'Vehicle checked',
                  value: driver.checks.vehicleCheckedAt
                    ? formatDateTime(driver.checks.vehicleCheckedAt)
                    : undefined,
                },
                {
                  label: 'Suspension',
                  value: driver.suspension
                    ? `${driver.suspension.reason} (${formatDateTime(driver.suspension.at)})`
                    : undefined,
                  wide: true,
                },
              ]}
            />
          </Section>
        </Grid>

        <Grid size={{ xs: 12, md: 6 }}>
          <Section
            title="Presence"
            description="Availability and last known position, as recorded by the server."
          >
            {presence ? (
              <Stack spacing={2}>
                <KeyValue
                  entries={[
                    {
                      label: 'Availability',
                      value: describeStatus(availabilityMeta, presence.availability).label,
                    },
                    {
                      label: 'Requested after job',
                      value: presence.requestedPostJobStatus
                        ? presence.requestedPostJobStatus === 'BREAK'
                          ? 'Break'
                          : 'End shift'
                        : undefined,
                    },
                    { label: 'Current booking', value: presence.currentBookingId },
                    {
                      label: 'Shift started',
                      value: presence.shift.startedAt
                        ? formatDateTime(presence.shift.startedAt)
                        : undefined,
                    },
                    { label: 'Unavailable reason', value: presence.unavailableReason, wide: true },
                  ]}
                />
                <LocationAge
                  receivedAt={presence.positionReceivedAt ?? null}
                  source={presence.positionSource}
                />
              </Stack>
            ) : (
              <Typography variant="body2" color="text.secondary">
                No presence record for this driver yet.
              </Typography>
            )}
          </Section>
        </Grid>
      </Grid>

      <FormDialog
        open={dialog === 'availability'}
        title="Set driver availability"
        description="Busy and Reserved are operational states set by dispatch, so they cannot be chosen here."
        submitLabel="Apply"
        pending={availability.pending}
        error={availability.error}
        unconfirmed={availability.unconfirmed}
        onRetryUnconfirmed={() => void availability.retryUnconfirmed()}
        disabled={!isReasonValid(availabilityReason)}
        onClose={close}
        onSubmit={() => void availability.submit()}
      >
        {onJob && availabilityStatus !== 'AVAILABLE' ? (
          <Alert severity="info">
            This driver is on a job. The request will be recorded and take effect once the job
            finishes; it cannot erase an active job.
          </Alert>
        ) : null}
        <TextField
          select
          label="Availability"
          value={availabilityStatus}
          onChange={(event) =>
            setAvailabilityStatus(event.target.value as typeof availabilityStatus)
          }
          fullWidth
        >
          <MenuItem value="AVAILABLE">Available</MenuItem>
          <MenuItem value="BREAK">On break</MenuItem>
          <MenuItem value="OFF_DUTY">End shift</MenuItem>
        </TextField>
        <ReasonField
          value={availabilityReason}
          onChange={setAvailabilityReason}
          helperText="An operator override is always recorded with a reason."
        />
      </FormDialog>

      <FormDialog
        open={dialog === 'location'}
        title="Record a verified position"
        description="Recording a position never marks a driver available; that is a separate decision."
        submitLabel="Record position"
        pending={location.pending}
        error={location.error}
        unconfirmed={location.unconfirmed}
        onRetryUnconfirmed={() => void location.retryUnconfirmed()}
        disabled={
          !isReasonValid(locationReason) ||
          Number.isNaN(Number.parseFloat(latitude)) ||
          Number.isNaN(Number.parseFloat(longitude))
        }
        onClose={close}
        onSubmit={() => void location.submit()}
      >
        <TextField
          label="Latitude"
          value={latitude}
          onChange={(event) => setLatitude(event.target.value)}
          fullWidth
          required
          inputMode="decimal"
          helperText="Between -90 and 90."
        />
        <TextField
          label="Longitude"
          value={longitude}
          onChange={(event) => setLongitude(event.target.value)}
          fullWidth
          required
          inputMode="decimal"
          helperText="Between -180 and 180."
        />
        <ReasonField value={locationReason} onChange={setLocationReason} />
      </FormDialog>

      <FormDialog
        open={dialog === 'edit'}
        title="Link a vehicle"
        submitLabel="Save"
        pending={edit.pending}
        error={edit.error}
        unconfirmed={edit.unconfirmed}
        onRetryUnconfirmed={() => void edit.retryUnconfirmed()}
        onClose={close}
        onSubmit={() => void edit.submit()}
      >
        <TextField
          select
          label="Vehicle"
          value={vehicleId}
          onChange={(event) => setVehicleId(event.target.value)}
          fullWidth
        >
          <MenuItem value="">No vehicle</MenuItem>
          {(vehiclesQuery.data?.items ?? []).map((vehicle) => (
            <MenuItem key={vehicle.id} value={vehicle.id}>
              {vehicle.registration} · {vehicle.vehicleClass.toLowerCase()}
            </MenuItem>
          ))}
        </TextField>
        <ReasonField value={editReason} onChange={setEditReason} required={false} />
      </FormDialog>

      <FormDialog
        open={dialog === 'approval'}
        title="Approval and service status"
        description="These are administrator decisions on the backend; the server rejects them for other roles."
        submitLabel="Apply"
        pending={approval.pending}
        error={approval.error}
        unconfirmed={approval.unconfirmed}
        onRetryUnconfirmed={() => void approval.retryUnconfirmed()}
        disabled={!isReasonValid(editReason)}
        onClose={close}
        onSubmit={() => void approval.submit()}
      >
        <TextField
          select
          label="Service status"
          value={serviceStatus}
          onChange={(event) => setServiceStatus(event.target.value as typeof serviceStatus)}
          fullWidth
        >
          {DRIVER_STATUSES.map((value) => (
            <MenuItem key={value} value={value}>
              {describeStatus(driverStatusMeta, value).label}
            </MenuItem>
          ))}
        </TextField>
        <TextField
          select
          label="Approval state"
          value={approvalState}
          onChange={(event) => setApprovalState(event.target.value as typeof approvalState)}
          fullWidth
        >
          {DRIVER_APPROVAL_STATES.map((value) => (
            <MenuItem key={value} value={value}>
              {describeStatus(driverApprovalMeta, value).label}
            </MenuItem>
          ))}
        </TextField>
        <ReasonField value={editReason} onChange={setEditReason} />
      </FormDialog>
    </>
  );
}
