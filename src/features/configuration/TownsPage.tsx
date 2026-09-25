import Alert from '@mui/material/Alert';
import Button from '@mui/material/Button';
import Checkbox from '@mui/material/Checkbox';
import FormControlLabel from '@mui/material/FormControlLabel';
import Link from '@mui/material/Link';
import MenuItem from '@mui/material/MenuItem';
import Stack from '@mui/material/Stack';
import TextField from '@mui/material/TextField';
import Typography from '@mui/material/Typography';
import { useState } from 'react';
import { Link as RouterLink } from 'react-router-dom';

import {
  TOWN_POLICY_FIELDS,
  type OperatingHours,
  type TownFeatures,
  type TownPolicy,
} from '@/api/dto/configuration';
import { useListTownsQuery, useUpdateTownMutation } from '@/api/endpoints/configuration';
import type { NormalizedApiError } from '@/api/errors';
import type { TownRow } from '@/api/types';
import { useTownScope } from '@/app/useTownScope';
import { useStaffSession } from '@/auth/useAuth';
import { FormDialog } from '@/components/FormDialog';
import { PageHeader } from '@/components/PageHeader';
import { PermissionGate } from '@/components/PermissionGate';
import { ReasonField } from '@/components/ReasonField';
import { ResourceTable, type Column } from '@/components/ResourceTable';
import { StatusChip } from '@/components/StatusChip';
import { CreateTownDialog } from '@/features/configuration/CreateTownDialog';
import { OperatingHoursEditor } from '@/features/configuration/OperatingHoursEditor';
import { operatingHoursValid } from '@/features/configuration/operatingHours';
import { parseGeoArea } from '@/features/configuration/geojson';
import { describeReadiness } from '@/features/configuration/readiness';
import { centsToInput, parseUsdToCents } from '@/lib/money';
import { hasAnyRole } from '@/lib/permissions';
import { useGuardedAction } from '@/lib/useGuardedAction';

const FEATURE_LABELS: Array<{ key: keyof TownFeatures; label: string }> = [
  { key: 'bookingEnabled', label: 'Booking enabled' },
  { key: 'cashOnDelivery', label: 'Cash on delivery' },
  { key: 'ecocash', label: 'EcoCash' },
  { key: 'paynowCheckout', label: 'Paynow checkout' },
  { key: 'independentDriverSignup', label: 'Independent driver signup' },
];

/** A whole number of bookings, or blank for no limit. */
function parseLimit(input: string): { ok: true; value: number | undefined } | { ok: false } {
  const trimmed = input.trim();
  if (trimmed === '') return { ok: true, value: undefined };
  if (!/^\d+$/.test(trimmed) || Number(trimmed) < 1) return { ok: false };
  return { ok: true, value: Number(trimmed) };
}

/** A positive USD amount, or blank for no limit. */
function parseValueLimit(input: string): { ok: true; value: number | undefined } | { ok: false } {
  if (input.trim() === '') return { ok: true, value: undefined };
  const parsed = parseUsdToCents(input);
  return parsed.ok && parsed.cents > 0 ? { ok: true, value: parsed.cents } : { ok: false };
}

/**
 * Towns and operating policy (specification section 4.8). Reads are open to operator
 * and admin; writes are administrator-only and the server enforces that.
 *
 * A new town starts closed to bookings. The launch checklist in each row names what is
 * still missing, in the order a first town is usually set up, and links to the page
 * that configures it.
 */
export function TownsPage() {
  const session = useStaffSession();
  const { setTownId } = useTownScope();
  const query = useListTownsQuery();
  const [updateTown] = useUpdateTownMutation();
  const [creating, setCreating] = useState(false);
  const [editing, setEditing] = useState<TownRow | null>(null);
  const [name, setName] = useState('');
  const [timezone, setTimezone] = useState('');
  const [serviceArea, setServiceArea] = useState('');
  const [operatingHours, setOperatingHours] = useState<OperatingHours[]>([]);
  const [policy, setPolicy] = useState<TownPolicy>({});
  const [features, setFeatures] = useState<Partial<TownFeatures>>({});
  const [status, setStatus] = useState<'ACTIVE' | 'DISABLED'>('ACTIVE');
  const [supportContact, setSupportContact] = useState('');
  const [maxOpenBookings, setMaxOpenBookings] = useState('');
  const [maxOpenValue, setMaxOpenValue] = useState('');
  const [reason, setReason] = useState('');

  const canCreateTown = hasAnyRole(session, ['admin']) && session?.townAccess.allTowns === true;

  const originalArea = editing ? JSON.stringify(editing.town.serviceArea, null, 2) : '';
  const areaChanged = editing !== null && serviceArea.trim() !== originalArea.trim();
  const parsedArea = areaChanged ? parseGeoArea(serviceArea) : null;
  const bookingsLimit = parseLimit(maxOpenBookings);
  const valueLimit = parseValueLimit(maxOpenValue);
  const formValid =
    name.trim().length >= 2 &&
    timezone.trim().length >= 3 &&
    (parsedArea === null || parsedArea.ok) &&
    operatingHoursValid(operatingHours) &&
    bookingsLimit.ok &&
    valueLimit.ok;

  const update = useGuardedAction({
    run: () => {
      if (!editing || !bookingsLimit.ok || !valueLimit.ok) {
        throw new Error('unreachable: guarded by the dialog');
      }
      return updateTown({
        id: editing.town.id,
        name: name.trim(),
        timezone: timezone.trim(),
        serviceArea: parsedArea?.ok ? parsedArea.area : undefined,
        operatingHours,
        policy,
        features,
        status,
        supportContact: supportContact.trim() || undefined,
        // Blank means no limit, so an empty object clears a limit set before.
        riskControls: {
          codExposure: {
            ...(bookingsLimit.value !== undefined ? { maxOpenBookings: bookingsLimit.value } : {}),
            ...(valueLimit.value !== undefined ? { maxOpenValueCents: valueLimit.value } : {}),
          },
        },
        reason: reason.trim() || undefined,
        expectedVersion: editing.town.version,
      }).unwrap();
    },
    refresh: () => void query.refetch(),
    successMessage: 'Town updated.',
    onSuccess: () => setEditing(null),
  });

  function openEditor(row: TownRow) {
    const exposure = row.town.riskControls?.codExposure;
    setEditing(row);
    setName(row.town.name);
    setTimezone(row.town.timezone);
    setServiceArea(JSON.stringify(row.town.serviceArea, null, 2));
    setOperatingHours(row.town.operatingHours);
    setPolicy(row.town.policy);
    setFeatures(row.town.features);
    setStatus(row.town.status);
    setSupportContact(row.town.supportContact ?? '');
    setMaxOpenBookings(exposure?.maxOpenBookings ? String(exposure.maxOpenBookings) : '');
    setMaxOpenValue(exposure?.maxOpenValueCents ? centsToInput(exposure.maxOpenValueCents) : '');
    setReason('');
    update.reset();
  }

  const columns: Array<Column<TownRow>> = [
    {
      id: 'name',
      header: 'Town',
      render: (row) => (
        <Stack spacing={0.25}>
          <Typography variant="body2" sx={{ fontWeight: 600 }}>
            {row.town.name}
          </Typography>
          <Typography variant="caption" color="text.secondary">
            {row.town.slug} · {row.town.timezone}
          </Typography>
        </Stack>
      ),
    },
    {
      id: 'status',
      header: 'Status',
      render: (row) => (
        <StatusChip
          descriptor={{
            label: row.town.status === 'ACTIVE' ? 'Active' : 'Disabled',
            tone: row.town.status === 'ACTIVE' ? 'positive' : 'neutral',
            icon: row.town.status === 'ACTIVE' ? 'available' : 'offline',
          }}
        />
      ),
    },
    {
      id: 'readiness',
      header: 'Launch readiness',
      minWidth: 240,
      render: (row) =>
        row.launchReadiness.ready ? (
          <StatusChip descriptor={{ label: 'Ready', tone: 'positive', icon: 'confirmed' }} />
        ) : (
          <Stack spacing={0.5}>
            <StatusChip descriptor={{ label: 'Not ready', tone: 'caution', icon: 'review' }} />
            <Typography variant="caption" color="text.secondary">
              Still needed:
            </Typography>
            <Stack component="ul" spacing={0.25} sx={{ m: 0, pl: 2 }}>
              {describeReadiness(row.launchReadiness.missing).map((item) => (
                <Typography key={item.key} component="li" variant="caption">
                  {item.path ? (
                    <Link component={RouterLink} to={`${item.path}?town=${row.town.id}`}>
                      {item.label}
                    </Link>
                  ) : (
                    item.label
                  )}
                </Typography>
              ))}
            </Stack>
          </Stack>
        ),
    },
    {
      id: 'features',
      header: 'Features',
      render: (row) => (
        <Stack spacing={0.25}>
          {FEATURE_LABELS.filter((feature) => row.town.features[feature.key]).map((feature) => (
            <Typography key={feature.key} variant="caption">
              {feature.label}
            </Typography>
          ))}
        </Stack>
      ),
    },
    {
      id: 'hours',
      header: 'Operating hours',
      render: (row) =>
        row.town.operatingHours.length === 0 ? (
          <Typography variant="body2" color="text.secondary">
            None configured
          </Typography>
        ) : (
          <Typography variant="body2">
            {row.town.operatingHours.length} day(s) configured
          </Typography>
        ),
    },
    {
      id: 'actions',
      header: 'Actions',
      render: (row) => (
        <PermissionGate
          requirement={{ anyRole: ['admin'] }}
          fallback={
            <Typography variant="caption" color="text.secondary">
              Read-only
            </Typography>
          }
        >
          <Button size="small" variant="outlined" onClick={() => openEditor(row)}>
            Edit
          </Button>
        </PermissionGate>
      ),
    },
  ];

  return (
    <>
      <PageHeader
        title="Towns"
        description="Service areas, operating policy and feature readiness."
        crumbs={[{ label: 'Administration' }, { label: 'Towns' }]}
        actions={
          canCreateTown ? (
            <Button variant="contained" onClick={() => setCreating(true)}>
              Add town
            </Button>
          ) : undefined
        }
      />

      <Stack spacing={2}>
        <Alert severity="info">
          Boundary editing uses GeoJSON coordinates. A rendered interactive basemap is a separate
          future integration, not a MongoDB feature.
        </Alert>

        <ResourceTable
          caption="Towns"
          columns={columns}
          rows={query.data ?? []}
          getRowId={(row) => row.town.id}
          isLoading={query.isLoading}
          isFetching={query.isFetching}
          error={query.error as NormalizedApiError | undefined}
          onRetry={() => void query.refetch()}
          emptyTitle="No towns configured"
          emptyDescription={
            canCreateTown
              ? 'Add the first town to start configuring the service.'
              : 'An administrator for all towns creates the first town before bookings can be taken.'
          }
        />
      </Stack>

      <CreateTownDialog
        open={creating}
        onClose={() => setCreating(false)}
        onCreated={(town) => {
          setCreating(false);
          // Work continues in the new town: zones, presets and rates are town scoped.
          setTownId(town.id);
        }}
      />

      <FormDialog
        open={editing !== null}
        title={`Edit ${editing?.town.name ?? 'town'}`}
        description="Policies are free text so the service never invents a charge or a rule it has not agreed."
        submitLabel="Save town"
        pending={update.pending}
        error={update.error}
        unconfirmed={update.unconfirmed}
        onRetryUnconfirmed={() => void update.retryUnconfirmed()}
        onClose={() => setEditing(null)}
        onSubmit={() => void update.submit()}
        disabled={!formValid}
        maxWidth="md"
      >
        <TextField
          label="Town name"
          value={name}
          onChange={(event) => setName(event.target.value)}
          required
          fullWidth
        />
        <TextField
          label="Timezone"
          value={timezone}
          onChange={(event) => setTimezone(event.target.value)}
          required
          fullWidth
          helperText="IANA name, e.g. Africa/Harare. Operating hours are read in this timezone."
        />
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

        <TextField
          label="Support contact"
          value={supportContact}
          onChange={(event) => setSupportContact(event.target.value)}
          fullWidth
        />

        <Typography variant="subtitle2">Operating hours</Typography>
        <OperatingHoursEditor
          value={operatingHours}
          onChange={setOperatingHours}
          initial={editing?.town.operatingHours}
        />

        <Typography variant="subtitle2">Feature readiness</Typography>
        <Stack>
          {FEATURE_LABELS.map((feature) => (
            <FormControlLabel
              key={feature.key}
              control={
                <Checkbox
                  checked={features[feature.key] ?? false}
                  onChange={(event) =>
                    setFeatures((current) => ({ ...current, [feature.key]: event.target.checked }))
                  }
                />
              }
              label={feature.label}
            />
          ))}
        </Stack>

        <Typography variant="subtitle2">Operating policy</Typography>
        {TOWN_POLICY_FIELDS.map((field) => (
          <TextField
            key={field.key}
            label={field.label}
            value={policy[field.key] ?? ''}
            onChange={(event) =>
              setPolicy((current) => ({ ...current, [field.key]: event.target.value }))
            }
            fullWidth
            multiline
            minRows={2}
          />
        ))}

        <Typography variant="subtitle2">Cash-on-delivery exposure</Typography>
        <Typography variant="body2" color="text.secondary">
          How much unpaid cash one customer may hold in this town. Blank means no limit; a booking
          over a limit is held for operator review rather than refused.
        </Typography>
        <Stack direction={{ xs: 'column', sm: 'row' }} spacing={2}>
          <TextField
            label="Open cash bookings per customer"
            value={maxOpenBookings}
            onChange={(event) => setMaxOpenBookings(event.target.value)}
            inputMode="numeric"
            error={!bookingsLimit.ok}
            helperText={bookingsLimit.ok ? undefined : 'A whole number of at least 1, or blank.'}
            fullWidth
          />
          <TextField
            label="Unpaid cash value per customer (USD)"
            value={maxOpenValue}
            onChange={(event) => setMaxOpenValue(event.target.value)}
            inputMode="decimal"
            error={!valueLimit.ok}
            helperText={valueLimit.ok ? undefined : 'A positive amount, or blank.'}
            fullWidth
          />
        </Stack>

        <Typography variant="subtitle2">Service area</Typography>
        <TextField
          label="Service area (GeoJSON)"
          value={serviceArea}
          onChange={(event) => setServiceArea(event.target.value)}
          fullWidth
          multiline
          minRows={4}
          maxRows={12}
          error={parsedArea?.ok === false}
          helperText={
            parsedArea === null
              ? 'Unchanged. Positions are [longitude, latitude].'
              : parsedArea.ok
                ? `Replaces the boundary: ${parsedArea.area.type} with ${parsedArea.pointCount} position(s).`
                : parsedArea.message
          }
        />

        <ReasonField value={reason} onChange={setReason} required={false} />
      </FormDialog>
    </>
  );
}
