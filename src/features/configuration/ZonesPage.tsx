import Accordion from '@mui/material/Accordion';
import AccordionDetails from '@mui/material/AccordionDetails';
import AccordionSummary from '@mui/material/AccordionSummary';
import ExpandMoreIcon from '@mui/icons-material/ExpandMore';
import Alert from '@mui/material/Alert';
import Checkbox from '@mui/material/Checkbox';
import FormControlLabel from '@mui/material/FormControlLabel';
import { lazy, Suspense, useMemo, useState } from 'react';
import Button from '@mui/material/Button';
import MenuItem from '@mui/material/MenuItem';
import Stack from '@mui/material/Stack';
import TextField from '@mui/material/TextField';
import Typography from '@mui/material/Typography';

import {
  useCreateZoneMutation,
  useListTownsQuery,
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
import type { GeoArea } from '@/api/dto/common';
import { checkZoneBoundary, suggestZoneCode } from '@/features/configuration/zoneBoundary';
import { parseGeoArea } from '@/features/configuration/geojson';
import { useGuardedAction } from '@/lib/useGuardedAction';

const ZoneBoundaryMap = lazy(() =>
  import('./ZoneBoundaryMap').then((module) => ({ default: module.ZoneBoundaryMap })),
);

/**
 * Zones and boundary data (specification section 4.8).
 *
 * Administrators draw and edit boundaries on Google Maps. The API still receives
 * GeoJSON, with an advanced text editor retained for imports and map outages.
 */
export function ZonesPage() {
  const { townId, towns } = useTownScope();
  const query = useListZonesQuery(
    { townId: townId ?? '', includeDisabled: true },
    { skip: !townId },
  );
  const townsQuery = useListTownsQuery();
  const town = townsQuery.data?.find((row) => row.town.id === townId)?.town;
  const [createZone] = useCreateZoneMutation();
  const [updateZone] = useUpdateZoneMutation();

  const [dialog, setDialog] = useState<'create' | 'edit' | null>(null);
  const [editing, setEditing] = useState<Zone | null>(null);
  const [code, setCode] = useState('');
  const [label, setLabel] = useState('');
  const [codeEdited, setCodeEdited] = useState(false);
  const [drawing, setDrawing] = useState(false);
  const [overlapConfirmed, setOverlapConfirmed] = useState(false);
  const [aliases, setAliases] = useState('');
  const [priority, setPriority] = useState('100');
  const [status, setStatus] = useState<'ACTIVE' | 'DISABLED'>('ACTIVE');
  const [geojson, setGeojson] = useState('');
  const [reason, setReason] = useState('');

  const parsed = useMemo(() => (geojson.trim() === '' ? null : parseGeoArea(geojson)), [geojson]);
  const boundary = parsed?.ok ? parsed.area : null;
  const boundaryChanged =
    dialog === 'create' ||
    (editing !== null && JSON.stringify(boundary) !== JSON.stringify(editing.polygon));
  const checks = useMemo(
    () =>
      boundary && town
        ? checkZoneBoundary(boundary, town.serviceArea, query.data ?? [], editing?.id)
        : null,
    [boundary, town, query.data, editing?.id],
  );
  const effectiveCode =
    dialog === 'create' && !codeEdited
      ? suggestZoneCode(
          label,
          (query.data ?? []).map((zone) => zone.code),
        )
      : code;
  const overlapRulesChanged =
    boundaryChanged ||
    (editing !== null && (Number(priority) !== editing.priority || status !== editing.status));
  const priorityValid = /^-?\d+$/.test(priority.trim()) && Number.isSafeInteger(Number(priority));
  const equalPriorityOverlap =
    checks?.overlaps.some((zone) => zone.priority === Number(priority)) ?? false;
  const formValid =
    label.trim() !== '' &&
    effectiveCode.trim() !== '' &&
    parsed?.ok === true &&
    priorityValid &&
    !drawing &&
    town !== undefined &&
    !townsQuery.isError &&
    query.data !== undefined &&
    !query.isError &&
    (!boundaryChanged || (!checks?.error && !checks?.outsideTown)) &&
    (status === 'DISABLED' ||
      !overlapRulesChanged ||
      (!equalPriorityOverlap && (!checks?.overlaps.length || overlapConfirmed)));

  function changeBoundary(area: GeoArea | null) {
    setGeojson(area ? JSON.stringify(area, null, 2) : '');
    setOverlapConfirmed(false);
  }

  const create = useGuardedAction({
    run: () => {
      if (!parsed?.ok || !townId) throw new Error('unreachable: guarded by the dialog');
      return createZone({
        townId,
        code: effectiveCode.trim(),
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
        polygon: boundaryChanged && parsed?.ok ? parsed.area : undefined,
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
    setCodeEdited(false);
    setStatus('ACTIVE');
    setDrawing(false);
    setOverlapConfirmed(false);
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
    setCodeEdited(true);
    setDrawing(false);
    setOverlapConfirmed(false);
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
          Add a zone by naming the area and drawing its boundary on the map. Open Edit to adjust an
          existing boundary.
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
        description="Name the area, draw its boundary, then save. Existing zones and the town boundary help you place it."
        submitLabel={dialog === 'create' ? 'Create zone' : 'Save zone'}
        pending={dialog === 'create' ? create.pending : update.pending}
        error={dialog === 'create' ? create.error : update.error}
        unconfirmed={dialog === 'create' ? create.unconfirmed : update.unconfirmed}
        onRetryUnconfirmed={() =>
          void (dialog === 'create' ? create.retryUnconfirmed() : update.retryUnconfirmed())
        }
        disabled={!formValid}
        onClose={() => setDialog(null)}
        onSubmit={() => void (dialog === 'create' ? create.submit() : update.submit())}
        maxWidth="md"
      >
        <TextField
          label="Zone name"
          value={label}
          required
          fullWidth
          onChange={(event) => setLabel(event.target.value)}
          placeholder="e.g. Empumalanga"
        />
        {dialog === 'create' && effectiveCode && (
          <Typography variant="caption" color="text.secondary">
            Zone code: {effectiveCode}
          </Typography>
        )}
        {(!town || townsQuery.isError || query.isError) && (
          <Alert severity="warning">
            Town boundaries and neighbouring zones must load before you can save.
          </Alert>
        )}
        {dialog !== null && town && (
          <Suspense fallback={<Typography>Loading boundary editor…</Typography>}>
            <ZoneBoundaryMap
              value={boundary}
              townArea={town.serviceArea}
              zones={query.data ?? []}
              editingId={editing?.id}
              onChange={changeBoundary}
              onDrawingChange={setDrawing}
            />
          </Suspense>
        )}
        {checks?.error && (
          <Alert severity={boundaryChanged ? 'error' : 'warning'}>{checks.error}</Alert>
        )}
        {checks?.outsideTown && (
          <Alert severity={boundaryChanged ? 'error' : 'warning'}>
            Part of this zone is outside the town boundary. Adjust the zone or review the town's
            service area.
          </Alert>
        )}
        {checks?.warning && <Alert severity="warning">{checks.warning}</Alert>}
        {checks && checks.overlaps.length > 0 && (
          <Alert severity="warning">
            Overlaps: {checks.overlaps.map((zone) => zone.label).join(', ')}.
            {equalPriorityOverlap
              ? ' These zones have the same priority and would make location matching ambiguous. Set a different priority under Advanced settings or adjust the boundary.'
              : ' The lower priority number wins for locations inside the overlap.'}
            {overlapRulesChanged && status === 'ACTIVE' && !equalPriorityOverlap && (
              <FormControlLabel
                control={
                  <Checkbox
                    checked={overlapConfirmed}
                    onChange={(event) => setOverlapConfirmed(event.target.checked)}
                  />
                }
                label="This overlap is intentional; use the configured priorities."
              />
            )}
          </Alert>
        )}
        {!boundary && (
          <Typography variant="body2" color="text.secondary">
            A boundary is required before saving.
          </Typography>
        )}
        <Accordion disableGutters>
          <AccordionSummary expandIcon={<ExpandMoreIcon />}>Advanced settings</AccordionSummary>
          <AccordionDetails>
            <Stack spacing={2}>
              <TextField
                label="Code"
                value={effectiveCode}
                fullWidth
                required
                disabled={dialog === 'edit'}
                onChange={(event) => {
                  setCode(event.target.value);
                  setCodeEdited(true);
                }}
                helperText={
                  dialog === 'edit'
                    ? 'The code stays fixed because tariffs and bookings reference it.'
                    : 'Suggested from the zone name; change it before creating the zone if needed.'
                }
              />
              <TextField
                label="Aliases"
                value={aliases}
                onChange={(event) => setAliases(event.target.value)}
                fullWidth
                helperText="Optional comma-separated names customers use for this area."
              />
              <TextField
                label="Priority"
                value={priority}
                fullWidth
                inputMode="numeric"
                error={!priorityValid}
                onChange={(event) => {
                  setPriority(event.target.value);
                  setOverlapConfirmed(false);
                }}
                helperText="A whole number. Lower numbers win where boundaries intentionally overlap."
              />
              {dialog === 'edit' && (
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
              )}
              <TextField
                label="Boundary GeoJSON"
                value={geojson}
                fullWidth
                multiline
                minRows={6}
                onChange={(event) => {
                  setGeojson(event.target.value);
                  setOverlapConfirmed(false);
                }}
                error={parsed !== null && !parsed.ok}
                helperText={
                  parsed === null
                    ? 'Optional import or fallback: paste a Polygon or MultiPolygon using [longitude, latitude].'
                    : parsed.ok
                      ? `Parsed ${parsed.ringCount} ring(s) and ${parsed.pointCount} position(s).`
                      : parsed.message
                }
              />
            </Stack>
          </AccordionDetails>
        </Accordion>
        {dialog === 'edit' ? (
          <ReasonField value={reason} onChange={setReason} required={false} />
        ) : null}
      </FormDialog>
    </>
  );
}
