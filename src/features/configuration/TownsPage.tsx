import Alert from '@mui/material/Alert';
import Button from '@mui/material/Button';
import Checkbox from '@mui/material/Checkbox';
import FormControlLabel from '@mui/material/FormControlLabel';
import MenuItem from '@mui/material/MenuItem';
import Stack from '@mui/material/Stack';
import TextField from '@mui/material/TextField';
import Typography from '@mui/material/Typography';
import { useState } from 'react';

import { TOWN_POLICY_FIELDS, type TownFeatures, type TownPolicy } from '@/api/dto/configuration';
import { useListTownsQuery, useUpdateTownMutation } from '@/api/endpoints/configuration';
import type { NormalizedApiError } from '@/api/errors';
import type { TownRow } from '@/api/types';
import { FormDialog } from '@/components/FormDialog';
import { PageHeader } from '@/components/PageHeader';
import { PermissionGate } from '@/components/PermissionGate';
import { ReasonField } from '@/components/ReasonField';
import { ResourceTable, type Column } from '@/components/ResourceTable';
import { StatusChip } from '@/components/StatusChip';
import { useGuardedAction } from '@/lib/useGuardedAction';

const FEATURE_LABELS: Array<{ key: keyof TownFeatures; label: string }> = [
  { key: 'bookingEnabled', label: 'Booking enabled' },
  { key: 'cashOnDelivery', label: 'Cash on delivery' },
  { key: 'ecocash', label: 'EcoCash' },
  { key: 'paynowCheckout', label: 'Paynow checkout' },
  { key: 'independentDriverSignup', label: 'Independent driver signup' },
];

/**
 * Towns and operating policy (specification section 4.8). Reads are open to operator
 * and admin; writes are administrator-only and the server enforces that.
 */
export function TownsPage() {
  const query = useListTownsQuery();
  const [updateTown] = useUpdateTownMutation();
  const [editing, setEditing] = useState<TownRow | null>(null);
  const [policy, setPolicy] = useState<TownPolicy>({});
  const [features, setFeatures] = useState<Partial<TownFeatures>>({});
  const [status, setStatus] = useState<'ACTIVE' | 'DISABLED'>('ACTIVE');
  const [supportContact, setSupportContact] = useState('');
  const [reason, setReason] = useState('');

  const update = useGuardedAction({
    run: () => {
      if (!editing) throw new Error('unreachable: guarded by the dialog');
      return updateTown({
        id: editing.town.id,
        policy,
        features,
        status,
        supportContact: supportContact.trim() || undefined,
        reason: reason.trim() || undefined,
        expectedVersion: editing.town.version,
      }).unwrap();
    },
    refresh: () => void query.refetch(),
    successMessage: 'Town updated.',
    onSuccess: () => setEditing(null),
  });

  function openEditor(row: TownRow) {
    setEditing(row);
    setPolicy(row.town.policy);
    setFeatures(row.town.features);
    setStatus(row.town.status);
    setSupportContact(row.town.supportContact ?? '');
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
              Missing: {row.launchReadiness.missing.join(', ')}
            </Typography>
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
          emptyDescription="An administrator creates the first town before bookings can be taken."
        />
      </Stack>

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
        maxWidth="md"
      >
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

        <ReasonField value={reason} onChange={setReason} required={false} />
      </FormDialog>
    </>
  );
}
