import Alert from '@mui/material/Alert';
import Button from '@mui/material/Button';
import MenuItem from '@mui/material/MenuItem';
import Stack from '@mui/material/Stack';
import TextField from '@mui/material/TextField';
import Typography from '@mui/material/Typography';
import { useState } from 'react';

import {
  useCreateZoneMutation,
  useListZonesQuery,
  useUpdateZoneMutation,
} from '@/api/endpoints/configuration';
import type { NormalizedApiError } from '@/api/errors';
import type { Zone } from '@/api/types';
import { useTownScope } from '@/app/useTownScope';
import { EmptyState } from '@/components/EmptyState';
import { FormDialog } from '@/components/FormDialog';
import { PageHeader } from '@/components/PageHeader';
import { PermissionGate } from '@/components/PermissionGate';
import { ReasonField } from '@/components/ReasonField';
import { ResourceTable, type Column } from '@/components/ResourceTable';
import { StatusChip } from '@/components/StatusChip';
import { parseGeoArea } from '@/features/configuration/geojson';
import { useGuardedAction } from '@/lib/useGuardedAction';

/**
 * Zones and boundary data (specification section 4.8).
 *
 * The MVP supports coordinate editing and GeoJSON import with validation and a preview
 * of what was parsed. Overlaps are resolved by priority: the lower number wins.
 */
export function ZonesPage() {
  const { townId, towns } = useTownScope();
  const query = useListZonesQuery(
    { townId: townId ?? '', includeDisabled: true },
    { skip: !townId },
  );
  const [createZone] = useCreateZoneMutation();
  const [updateZone] = useUpdateZoneMutation();

  const [dialog, setDialog] = useState<'create' | 'edit' | null>(null);
  const [editing, setEditing] = useState<Zone | null>(null);
  const [code, setCode] = useState('');
  const [label, setLabel] = useState('');
  const [aliases, setAliases] = useState('');
  const [priority, setPriority] = useState('100');
  const [status, setStatus] = useState<'ACTIVE' | 'DISABLED'>('ACTIVE');
  const [geojson, setGeojson] = useState('');
  const [reason, setReason] = useState('');

  const parsed = geojson.trim() === '' ? null : parseGeoArea(geojson);

  const create = useGuardedAction({
    run: () => {
      if (!parsed?.ok || !townId) throw new Error('unreachable: guarded by the dialog');
      return createZone({
        townId,
        code: code.trim(),
        label: label.trim(),
        aliases: aliases
          .split(',')
          .map((alias) => alias.trim())
          .filter(Boolean),
        polygon: parsed.area,
        priority: Number.parseInt(priority, 10),
      }).unwrap();
    },
    refresh: () => void query.refetch(),
    successMessage: 'Zone created.',
    onSuccess: () => setDialog(null),
  });

  const update = useGuardedAction({
    run: () => {
      if (!editing) throw new Error('unreachable: guarded by the dialog');
      return updateZone({
        id: editing.id,
        label: label.trim(),
        aliases: aliases
          .split(',')
          .map((alias) => alias.trim())
          .filter(Boolean),
        polygon: parsed?.ok ? parsed.area : undefined,
        priority: Number.parseInt(priority, 10),
        status,
        reason: reason.trim() || undefined,
        expectedVersion: editing.version,
      }).unwrap();
    },
    refresh: () => void query.refetch(),
    successMessage: 'Zone updated.',
    onSuccess: () => setDialog(null),
  });

  function openCreate() {
    setEditing(null);
    setCode('');
    setLabel('');
    setAliases('');
    setPriority('100');
    setGeojson('');
    setReason('');
    create.reset();
    setDialog('create');
  }

  function openEdit(zone: Zone) {
    setEditing(zone);
    setCode(zone.code);
    setLabel(zone.label);
    setAliases(zone.aliases.join(', '));
    setPriority(String(zone.priority));
    setStatus(zone.status);
    setGeojson(JSON.stringify(zone.polygon, null, 2));
    setReason('');
    update.reset();
    setDialog('edit');
  }

  const columns: Array<Column<Zone>> = [
    {
      id: 'code',
      header: 'Code',
      render: (zone) => (
        <Stack spacing={0.25}>
          <Typography variant="body2" sx={{ fontWeight: 600 }}>
            {zone.code}
          </Typography>
          <Typography variant="caption" color="text.secondary">
            {zone.label}
          </Typography>
        </Stack>
      ),
    },
    { id: 'aliases', header: 'Aliases', render: (zone) => zone.aliases.join(', ') || 'None' },
    {
      id: 'priority',
      header: 'Priority',
      align: 'right',
      render: (zone) => zone.priority,
    },
    {
      id: 'boundary',
      header: 'Boundary',
      render: (zone) => `${zone.polygon.type}`,
    },
    {
      id: 'status',
      header: 'Status',
      render: (zone) => (
        <StatusChip
          descriptor={{
            label: zone.status === 'ACTIVE' ? 'Active' : 'Disabled',
            tone: zone.status === 'ACTIVE' ? 'positive' : 'neutral',
            icon: zone.status === 'ACTIVE' ? 'available' : 'offline',
          }}
        />
      ),
    },
    {
      id: 'actions',
      header: 'Actions',
      render: (zone) => (
        <PermissionGate
          requirement={{ anyRole: ['admin'] }}
          fallback={
            <Typography variant="caption" color="text.secondary">
              Read-only
            </Typography>
          }
        >
          <Button size="small" variant="outlined" onClick={() => openEdit(zone)}>
            Edit
          </Button>
        </PermissionGate>
      ),
    },
  ];

  if (!townId) {
    return (
      <>
        <PageHeader title="Zones" crumbs={[{ label: 'Administration' }, { label: 'Zones' }]} />
        <EmptyState
          title="Choose a town"
          description="Zones belong to one town. Select a town in the top bar to manage its boundaries."
        />
      </>
    );
  }

  return (
    <>
      <PageHeader
        title="Zones"
        description={`Boundaries for ${towns.find((town) => town.id === townId)?.name ?? 'the selected town'}.`}
        crumbs={[{ label: 'Administration' }, { label: 'Zones' }]}
        actions={
          <PermissionGate requirement={{ anyRole: ['admin'] }}>
            <Button variant="contained" onClick={openCreate}>
              Add zone
            </Button>
          </PermissionGate>
        }
      />

      <Stack spacing={2}>
        <Alert severity="info">
          Coordinates are GeoJSON [longitude, latitude]. Where boundaries overlap, the zone with the
          lower priority number wins. There is no interactive basemap in this release.
        </Alert>

        <ResourceTable
          caption="Zones"
          columns={columns}
          rows={query.data ?? []}
          getRowId={(zone) => zone.id}
          isLoading={query.isLoading}
          isFetching={query.isFetching}
          error={query.error as NormalizedApiError | undefined}
          onRetry={() => void query.refetch()}
          emptyTitle="No zones configured"
          emptyDescription="Add the town's zones before publishing a rate card."
        />
      </Stack>

      <FormDialog
        open={dialog !== null}
        title={dialog === 'create' ? 'Add a zone' : `Edit ${editing?.code ?? 'zone'}`}
        description="Paste a GeoJSON Polygon or MultiPolygon. It is validated here and again by the server."
        submitLabel={dialog === 'create' ? 'Create zone' : 'Save zone'}
        pending={dialog === 'create' ? create.pending : update.pending}
        error={dialog === 'create' ? create.error : update.error}
        unconfirmed={dialog === 'create' ? create.unconfirmed : update.unconfirmed}
        onRetryUnconfirmed={() =>
          void (dialog === 'create' ? create.retryUnconfirmed() : update.retryUnconfirmed())
        }
        disabled={
          label.trim() === '' ||
          (dialog === 'create' && (code.trim() === '' || !parsed?.ok)) ||
          (geojson.trim() !== '' && parsed !== null && !parsed.ok)
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
          helperText={
            dialog === 'edit'
              ? 'A zone code cannot be changed once quotes reference it.'
              : undefined
          }
        />
        <TextField
          label="Label"
          value={label}
          onChange={(event) => setLabel(event.target.value)}
          fullWidth
          required
        />
        <TextField
          label="Aliases"
          value={aliases}
          onChange={(event) => setAliases(event.target.value)}
          fullWidth
          helperText="Comma separated names customers use for this area."
        />
        <TextField
          label="Priority"
          value={priority}
          onChange={(event) => setPriority(event.target.value)}
          fullWidth
          inputMode="numeric"
          helperText="Lower numbers win where boundaries overlap."
        />
        {dialog === 'edit' ? (
          <TextField
            select
            label="Status"
            value={status}
            onChange={(event) => setStatus(event.target.value as 'ACTIVE' | 'DISABLED')}
            fullWidth
          >
            <MenuItem value="ACTIVE">Active</MenuItem>
            <MenuItem value="DISABLED">Disabled</MenuItem>
          </TextField>
        ) : null}
        <TextField
          label="Boundary GeoJSON"
          value={geojson}
          onChange={(event) => setGeojson(event.target.value)}
          fullWidth
          required={dialog === 'create'}
          multiline
          minRows={6}
          error={parsed !== null && !parsed.ok}
          helperText={
            parsed === null
              ? 'Polygon or MultiPolygon, coordinates as [longitude, latitude].'
              : parsed.ok
                ? `Parsed ${parsed.ringCount} ring(s) and ${parsed.pointCount} position(s).`
                : parsed.message
          }
        />
        {dialog === 'edit' ? (
          <ReasonField value={reason} onChange={setReason} required={false} />
        ) : null}
      </FormDialog>
    </>
  );
}
