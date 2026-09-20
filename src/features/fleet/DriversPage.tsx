import Alert from '@mui/material/Alert';
import Button from '@mui/material/Button';
import MenuItem from '@mui/material/MenuItem';
import Stack from '@mui/material/Stack';
import TextField from '@mui/material/TextField';
import Typography from '@mui/material/Typography';
import { useState } from 'react';
import { useNavigate } from 'react-router-dom';

import { VEHICLE_CLASSES } from '@/api/dto/common';
import { DRIVER_STATUSES } from '@/api/dto/fleet';
import { useCreateDriverMutation, useListDriversQuery } from '@/api/endpoints/fleet';
import type { NormalizedApiError } from '@/api/errors';
import { POLLING, polled } from '@/api/polling';
import type { DriverRow } from '@/api/types';
import { useTownScope } from '@/app/useTownScope';
import { FormDialog } from '@/components/FormDialog';
import { LocationAge } from '@/components/LocationAge';
import { PageHeader } from '@/components/PageHeader';
import { ResourceTable, type Column } from '@/components/ResourceTable';
import { StatusChip } from '@/components/StatusChip';
import {
  availabilityMeta,
  describeStatus,
  driverApprovalMeta,
  driverStatusMeta,
} from '@/components/statusMeta';
import { useGuardedAction } from '@/lib/useGuardedAction';
import { useNumberQueryParam, useQueryParam } from '@/lib/useUrlState';

const PAGE_SIZE = 25;

/**
 * Driver management (specification section 4.4).
 *
 * Explicit availability, position age and approval state are shown separately, and
 * public driver signup stays outside the staff frontend.
 */
export function DriversPage() {
  const navigate = useNavigate();
  const { townId, towns } = useTownScope();
  const [status, setStatus] = useQueryParam('status');
  const [skip, setSkip] = useNumberQueryParam('skip', 0);
  const [createOpen, setCreateOpen] = useState(false);

  const query = useListDriversQuery(
    { townId, status: status as never, limit: PAGE_SIZE, skip },
    polled(POLLING.queue),
  );
  const [createDriver] = useCreateDriverMutation();

  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [staffReference, setStaffReference] = useState('');
  const [classes, setClasses] = useState<string[]>(['MOTORCYCLE']);
  const [formTownId, setFormTownId] = useState(townId ?? '');

  const create = useGuardedAction({
    run: () =>
      createDriver({
        townId: formTownId,
        name: name.trim(),
        phone: phone.trim(),
        staffReference: staffReference.trim() || undefined,
        allowedVehicleClasses: classes as never,
        ownershipModel: 'COMPANY',
      }).unwrap(),
    successMessage: 'Company driver created.',
    onSuccess: () => {
      setCreateOpen(false);
      setName('');
      setPhone('');
      setStaffReference('');
    },
  });

  const columns: Array<Column<DriverRow>> = [
    {
      id: 'name',
      header: 'Driver',
      minWidth: 160,
      render: (row) => (
        <Stack spacing={0.25}>
          <Typography variant="body2" sx={{ fontWeight: 600 }}>
            {row.driver.name}
          </Typography>
          <Typography variant="caption" color="text.secondary">
            {row.driver.normalizedPhone}
          </Typography>
        </Stack>
      ),
    },
    {
      id: 'town',
      header: 'Town',
      render: (row) =>
        towns.find((town) => town.id === row.driver.townId)?.name ?? row.driver.townId,
    },
    {
      id: 'status',
      header: 'Service status',
      render: (row) => (
        <Stack spacing={0.5}>
          <StatusChip descriptor={describeStatus(driverStatusMeta, row.driver.status)} />
          <StatusChip descriptor={describeStatus(driverApprovalMeta, row.driver.approvalState)} />
        </Stack>
      ),
    },
    {
      id: 'vehicle',
      header: 'Linked vehicle',
      render: (row) =>
        row.driver.assignedVehicleId ? (
          <Typography variant="body2">{row.driver.assignedVehicleId.slice(-6)}</Typography>
        ) : (
          <Typography variant="body2" color="text.secondary">
            None linked
          </Typography>
        ),
    },
    {
      id: 'availability',
      header: 'Availability',
      render: (row) =>
        row.presence ? (
          <Stack spacing={0.5}>
            <StatusChip descriptor={describeStatus(availabilityMeta, row.presence.availability)} />
            {row.presence.requestedPostJobStatus ? (
              <Typography variant="caption" color="warning.main">
                {row.presence.requestedPostJobStatus === 'BREAK' ? 'Break' : 'End shift'} after the
                current job
              </Typography>
            ) : null}
          </Stack>
        ) : (
          <Typography variant="body2" color="text.secondary">
            No presence record
          </Typography>
        ),
    },
    {
      id: 'location',
      header: 'Position age',
      render: (row) => (
        <LocationAge
          receivedAt={row.presence?.positionReceivedAt ?? null}
          source={row.presence?.positionSource}
        />
      ),
    },
    {
      id: 'job',
      header: 'Current job',
      render: (row) =>
        row.presence?.currentBookingId ? (
          <Typography variant="body2">{row.presence.currentBookingId.slice(-6)}</Typography>
        ) : (
          <Typography variant="body2" color="text.secondary">
            None
          </Typography>
        ),
    },
  ];

  return (
    <>
      <PageHeader
        title="Drivers"
        description="Company drivers, their vehicles and their availability."
        crumbs={[{ label: 'Operations' }, { label: 'Drivers' }]}
        actions={
          <Button
            variant="contained"
            onClick={() => setCreateOpen(true)}
            disabled={!townId && towns.length === 0}
          >
            Add company driver
          </Button>
        }
      />

      <Stack spacing={2}>
        <Stack direction="row" spacing={2} sx={{ flexWrap: 'wrap', gap: 2 }}>
          <TextField
            select
            size="small"
            label="Service status"
            value={status ?? ''}
            onChange={(event) => {
              setStatus(event.target.value || null);
              setSkip(0);
            }}
            sx={{ minWidth: 200 }}
          >
            <MenuItem value="">Any status</MenuItem>
            {DRIVER_STATUSES.map((value) => (
              <MenuItem key={value} value={value}>
                {describeStatus(driverStatusMeta, value).label}
              </MenuItem>
            ))}
          </TextField>
        </Stack>

        <Alert severity="info">
          A location update never marks a driver available, and availability changes requested
          during a job take effect once it finishes.
        </Alert>

        <ResourceTable
          caption="Drivers"
          columns={columns}
          rows={query.data?.items ?? []}
          getRowId={(row) => row.driver.id}
          isLoading={query.isLoading}
          isFetching={query.isFetching}
          error={query.error as NormalizedApiError | undefined}
          onRetry={() => void query.refetch()}
          emptyTitle="No drivers found"
          emptyDescription="Add a company driver, or switch town to see another fleet."
          onRowClick={(row) => navigate(`/drivers/${row.driver.id}`)}
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
        title="Add a company driver"
        description="Driver records are created by staff. Public and independent driver signup is not part of this dashboard."
        submitLabel="Create driver"
        pending={create.pending}
        error={create.error}
        unconfirmed={create.unconfirmed}
        onRetryUnconfirmed={() => void create.retryUnconfirmed()}
        disabled={
          name.trim().length < 2 ||
          phone.trim().length < 6 ||
          classes.length === 0 ||
          formTownId === ''
        }
        onClose={() => setCreateOpen(false)}
        onSubmit={() => void create.submit()}
      >
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
          label="Name"
          value={name}
          onChange={(event) => setName(event.target.value)}
          fullWidth
          required
        />
        <TextField
          label="WhatsApp number"
          value={phone}
          onChange={(event) => setPhone(event.target.value)}
          fullWidth
          required
          helperText="Normalized by the server."
        />
        <TextField
          label="Staff reference"
          value={staffReference}
          onChange={(event) => setStaffReference(event.target.value)}
          fullWidth
        />
        <TextField
          select
          label="Allowed vehicle classes"
          value={classes}
          onChange={(event) =>
            setClasses(
              typeof event.target.value === 'string'
                ? event.target.value.split(',')
                : event.target.value,
            )
          }
          fullWidth
          required
          slotProps={{ select: { multiple: true } }}
        >
          {VEHICLE_CLASSES.map((value) => (
            <MenuItem key={value} value={value}>
              {value.toLowerCase()}
            </MenuItem>
          ))}
        </TextField>
      </FormDialog>
    </>
  );
}
