import Alert from '@mui/material/Alert';
import AlertTitle from '@mui/material/AlertTitle';
import Button from '@mui/material/Button';
import Checkbox from '@mui/material/Checkbox';
import FormControlLabel from '@mui/material/FormControlLabel';
import MenuItem from '@mui/material/MenuItem';
import Stack from '@mui/material/Stack';
import TextField from '@mui/material/TextField';
import Typography from '@mui/material/Typography';
import { useState } from 'react';

import type { WireStaffMember } from '@/api/dto/session';
import {
  useCreateStaffMutation,
  useListStaffQuery,
  useRequestStaffPhoneChangeMutation,
  useUpdateStaffMutation,
  useVerifyStaffPhoneChangeMutation,
} from '@/api/endpoints/staff';
import type { NormalizedApiError } from '@/api/errors';
import { useTownScope } from '@/app/useTownScope';
import { useAuth } from '@/auth/useAuth';
import { FormDialog } from '@/components/FormDialog';
import { KeyValue } from '@/components/KeyValue';
import { PageHeader } from '@/components/PageHeader';
import { ReasonField, isReasonValid } from '@/components/ReasonField';
import { ResourceTable, type Column } from '@/components/ResourceTable';
import { Section } from '@/components/Section';
import { StatusChip } from '@/components/StatusChip';
import { formatDateTime } from '@/lib/datetime';
import {
  CAPABILITY,
  STAFF_ROLES,
  describeRoles,
  hasAnyRole,
  hasCapability,
  type StaffRole,
} from '@/lib/permissions';
import { useGuardedAction } from '@/lib/useGuardedAction';

/**
 * Effective access and staff management (specification section 5.3).
 *
 * Everyone can read their own access. Provisioning is administrator-only, staff are
 * never created automatically by an OTP request, and a number change goes through
 * verification rather than a self-service bypass.
 */
export function AccessPage() {
  const { session } = useAuth();
  const { towns } = useTownScope();
  const canManage =
    hasAnyRole(session, ['admin']) && hasCapability(session, CAPABILITY.staffManage);

  const staffQuery = useListStaffQuery(undefined, { skip: !canManage });
  const [createStaff] = useCreateStaffMutation();
  const [updateStaff] = useUpdateStaffMutation();
  const [requestPhoneChange] = useRequestStaffPhoneChangeMutation();
  const [verifyPhoneChange] = useVerifyStaffPhoneChangeMutation();

  const [dialog, setDialog] = useState<'create' | 'edit' | 'phone' | 'verify' | null>(null);
  const [editing, setEditing] = useState<WireStaffMember | null>(null);
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [roles, setRoles] = useState<StaffRole[]>(['operator']);
  const [allTowns, setAllTowns] = useState(false);
  const [townIds, setTownIds] = useState<string[]>([]);
  const [status, setStatus] = useState<'ACTIVE' | 'SUSPENDED'>('ACTIVE');
  const [reason, setReason] = useState('');
  const [changeId, setChangeId] = useState('');
  const [code, setCode] = useState('');

  const staffUnavailable =
    staffQuery.isError &&
    ['notFound', 'server', 'client'].includes((staffQuery.error as NormalizedApiError).kind);

  const activeAdmins = (staffQuery.data ?? []).filter(
    (member) => member.status === 'ACTIVE' && member.roles.includes('admin'),
  );
  const removingLastAdmin =
    editing !== null &&
    editing.roles.includes('admin') &&
    activeAdmins.length <= 1 &&
    (status === 'SUSPENDED' || !roles.includes('admin'));

  const create = useGuardedAction({
    run: (_args: void, idempotencyKey: string) =>
      createStaff({
        name: name.trim(),
        phone: phone.trim(),
        roles,
        allTowns,
        townIds: allTowns ? [] : townIds,
        idempotencyKey,
      }).unwrap(),
    refresh: () => void staffQuery.refetch(),
    successMessage: 'Staff account created. They can now request a WhatsApp login code.',
    onSuccess: () => setDialog(null),
  });

  const update = useGuardedAction({
    run: (_args: void, idempotencyKey: string) => {
      if (!editing) throw new Error('unreachable: guarded by the dialog');
      return updateStaff({
        id: editing.id,
        roles,
        allTowns,
        townIds: allTowns ? [] : townIds,
        status,
        reason: reason.trim(),
        expectedVersion: editing.version,
        idempotencyKey,
      }).unwrap();
    },
    refresh: () => void staffQuery.refetch(),
    successMessage: 'Staff access updated. Role and town changes take effect immediately.',
    onSuccess: () => setDialog(null),
  });

  const phoneChange = useGuardedAction({
    run: (_args: void, idempotencyKey: string) => {
      if (!editing) throw new Error('unreachable: guarded by the dialog');
      return requestPhoneChange({
        id: editing.id,
        newPhone: phone.trim(),
        reason: reason.trim(),
        idempotencyKey,
      }).unwrap();
    },
    successMessage: 'Verification sent to the new number. Enter the code to activate it.',
    onSuccess: (result) => {
      setChangeId(result.changeId);
      setDialog('verify');
    },
  });

  const phoneVerify = useGuardedAction({
    run: () => {
      if (!editing) throw new Error('unreachable: guarded by the dialog');
      return verifyPhoneChange({ id: editing.id, changeId, code }).unwrap();
    },
    refresh: () => void staffQuery.refetch(),
    successMessage: 'New login number activated. Previous sessions and challenges were revoked.',
    onSuccess: () => {
      setDialog(null);
      setCode('');
    },
  });

  function openCreate() {
    setEditing(null);
    setName('');
    setPhone('');
    setRoles(['operator']);
    setAllTowns(false);
    setTownIds([]);
    create.reset();
    setDialog('create');
  }

  function openEdit(member: WireStaffMember) {
    setEditing(member);
    setRoles(member.roles);
    setAllTowns(member.townAccess.allTowns);
    setTownIds(member.townAccess.towns.map((town) => town.id));
    setStatus(member.status);
    setReason('');
    update.reset();
    setDialog('edit');
  }

  const columns: Array<Column<WireStaffMember>> = [
    {
      id: 'name',
      header: 'Staff member',
      render: (member) => (
        <Stack spacing={0.25}>
          <Typography variant="body2" sx={{ fontWeight: 600 }}>
            {member.name}
          </Typography>
          <Typography variant="caption" color="text.secondary">
            {member.maskedPhone}
          </Typography>
        </Stack>
      ),
    },
    { id: 'roles', header: 'Roles', render: (member) => describeRoles(member.roles) },
    {
      id: 'towns',
      header: 'Town access',
      render: (member) =>
        member.townAccess.allTowns
          ? 'All towns'
          : member.townAccess.towns.map((town) => town.name).join(', ') || 'No towns assigned',
    },
    {
      id: 'status',
      header: 'Status',
      render: (member) => (
        <StatusChip
          descriptor={{
            label: member.status === 'ACTIVE' ? 'Active' : 'Suspended',
            tone: member.status === 'ACTIVE' ? 'positive' : 'critical',
            icon: member.status === 'ACTIVE' ? 'available' : 'blocked',
          }}
        />
      ),
    },
    {
      id: 'lastSignIn',
      header: 'Last sign-in',
      render: (member) => (member.lastSignInAt ? formatDateTime(member.lastSignInAt) : 'Never'),
    },
    {
      id: 'actions',
      header: 'Actions',
      minWidth: 200,
      render: (member) => (
        <Stack direction="row" spacing={1}>
          <Button size="small" variant="outlined" onClick={() => openEdit(member)}>
            Edit access
          </Button>
          <Button
            size="small"
            variant="text"
            onClick={() => {
              setEditing(member);
              setPhone('');
              setReason('');
              phoneChange.reset();
              setDialog('phone');
            }}
          >
            Change number
          </Button>
        </Stack>
      ),
    },
  ];

  return (
    <>
      <PageHeader
        title="Access & staff"
        description="Your effective permissions, and staff provisioning for administrators."
        crumbs={[{ label: 'Settings' }, { label: 'Access' }]}
        actions={
          canManage ? (
            <Button variant="contained" onClick={openCreate}>
              Add staff member
            </Button>
          ) : undefined
        }
      />

      <Stack spacing={2}>
        <Section
          title="Your effective access"
          description="Granted by the server and re-checked on every request."
        >
          {session ? (
            <KeyValue
              entries={[
                { label: 'Name', value: session.user.name },
                { label: 'Login number', value: session.user.maskedPhone },
                { label: 'Roles', value: describeRoles(session.roles) },
                {
                  label: 'Town access',
                  value: session.townAccess.allTowns
                    ? 'All towns'
                    : session.townAccess.towns.map((town) => town.name).join(', ') ||
                      'No towns assigned',
                },
                { label: 'Session expires', value: formatDateTime(session.session.expiresAt) },
                { label: 'Idle timeout', value: formatDateTime(session.session.idleExpiresAt) },
                {
                  label: 'Capabilities',
                  value:
                    session.capabilities.length > 0
                      ? session.capabilities.join(', ')
                      : 'None reported',
                  wide: true,
                },
              ]}
            />
          ) : null}
          <Typography variant="caption" color="text.secondary" component="p" sx={{ mt: 2 }}>
            Holding an administrator role does not grant operator or finance access; each role is
            assigned explicitly.
          </Typography>
        </Section>

        {canManage ? (
          <Section
            title="Staff directory"
            description="Only pre-registered staff can receive a usable login challenge. Accounts are never created by an OTP request."
          >
            {staffUnavailable ? (
              <Alert severity="info">
                <AlertTitle>Staff endpoints not available</AlertTitle>
                <code>GET /api/v1/admin/staff</code> is a backend addition (specification sections
                5.4 and 11, priority P0). The management table appears once the endpoint is
                implemented.
              </Alert>
            ) : (
              <ResourceTable
                caption="Staff directory"
                columns={columns}
                rows={staffQuery.data ?? []}
                getRowId={(member) => member.id}
                isLoading={staffQuery.isLoading}
                isFetching={staffQuery.isFetching}
                error={staffQuery.error as NormalizedApiError | undefined}
                onRetry={() => void staffQuery.refetch()}
                emptyTitle="No staff accounts"
                emptyDescription="The first administrator is created by a server-only bootstrap procedure."
              />
            )}
          </Section>
        ) : (
          <Alert severity="info">
            Staff provisioning is restricted to administrators with the staff-management capability.
            Ask an administrator to change roles, towns or a login number.
          </Alert>
        )}
      </Stack>

      <FormDialog
        open={dialog === 'create'}
        title="Add a staff member"
        description="Roles and town scope are explicit. A town-scoped administrator cannot grant access beyond their own delegated authority; the server enforces that."
        submitLabel="Create staff account"
        pending={create.pending}
        error={create.error}
        unconfirmed={create.unconfirmed}
        onRetryUnconfirmed={() => void create.retryUnconfirmed()}
        disabled={name.trim().length < 2 || phone.trim().length < 6 || roles.length === 0}
        onClose={() => setDialog(null)}
        onSubmit={() => void create.submit()}
      >
        <TextField
          label="Name"
          value={name}
          onChange={(event) => setName(event.target.value)}
          fullWidth
          required
        />
        <TextField
          label="Registered WhatsApp number"
          value={phone}
          onChange={(event) => setPhone(event.target.value)}
          fullWidth
          required
          helperText="Normalized to E.164 by the server and unique among active staff."
        />
        <TextField
          select
          label="Roles"
          value={roles}
          onChange={(event) =>
            setRoles(
              (typeof event.target.value === 'string'
                ? event.target.value.split(',')
                : event.target.value) as StaffRole[],
            )
          }
          fullWidth
          required
          slotProps={{ select: { multiple: true } }}
        >
          {STAFF_ROLES.map((role) => (
            <MenuItem key={role} value={role}>
              {role}
            </MenuItem>
          ))}
        </TextField>
        <FormControlLabel
          control={
            <Checkbox checked={allTowns} onChange={(event) => setAllTowns(event.target.checked)} />
          }
          label="Access to all towns"
        />
        {!allTowns ? (
          <TextField
            select
            label="Towns"
            value={townIds}
            onChange={(event) =>
              setTownIds(
                typeof event.target.value === 'string'
                  ? event.target.value.split(',')
                  : event.target.value,
              )
            }
            fullWidth
            slotProps={{ select: { multiple: true } }}
            helperText="An empty list means no access, never unrestricted access."
          >
            {towns.map((town) => (
              <MenuItem key={town.id} value={town.id}>
                {town.name}
              </MenuItem>
            ))}
          </TextField>
        ) : null}
      </FormDialog>

      <FormDialog
        open={dialog === 'edit'}
        title={`Edit access for ${editing?.name ?? 'staff member'}`}
        description="Changes apply immediately server-side and the affected session is refreshed."
        submitLabel="Save access"
        pending={update.pending}
        error={update.error}
        unconfirmed={update.unconfirmed}
        onRetryUnconfirmed={() => void update.retryUnconfirmed()}
        disabled={!isReasonValid(reason) || roles.length === 0 || removingLastAdmin}
        onClose={() => setDialog(null)}
        onSubmit={() => void update.submit()}
      >
        {removingLastAdmin ? (
          <Alert severity="error">
            This would remove the last usable administrator. Grant the admin role to another active
            account first.
          </Alert>
        ) : null}
        <TextField
          select
          label="Roles"
          value={roles}
          onChange={(event) =>
            setRoles(
              (typeof event.target.value === 'string'
                ? event.target.value.split(',')
                : event.target.value) as StaffRole[],
            )
          }
          fullWidth
          slotProps={{ select: { multiple: true } }}
        >
          {STAFF_ROLES.map((role) => (
            <MenuItem key={role} value={role}>
              {role}
            </MenuItem>
          ))}
        </TextField>
        <FormControlLabel
          control={
            <Checkbox checked={allTowns} onChange={(event) => setAllTowns(event.target.checked)} />
          }
          label="Access to all towns"
        />
        {!allTowns ? (
          <TextField
            select
            label="Towns"
            value={townIds}
            onChange={(event) =>
              setTownIds(
                typeof event.target.value === 'string'
                  ? event.target.value.split(',')
                  : event.target.value,
              )
            }
            fullWidth
            slotProps={{ select: { multiple: true } }}
          >
            {towns.map((town) => (
              <MenuItem key={town.id} value={town.id}>
                {town.name}
              </MenuItem>
            ))}
          </TextField>
        ) : null}
        <TextField
          select
          label="Status"
          value={status}
          onChange={(event) => setStatus(event.target.value as 'ACTIVE' | 'SUSPENDED')}
          fullWidth
          helperText="Suspending an account revokes its sessions and outstanding login challenges."
        >
          <MenuItem value="ACTIVE">Active</MenuItem>
          <MenuItem value="SUSPENDED">Suspended</MenuItem>
        </TextField>
        <ReasonField value={reason} onChange={setReason} />
      </FormDialog>

      <FormDialog
        open={dialog === 'phone'}
        title={`Change the login number for ${editing?.name ?? 'staff member'}`}
        description="Verify the person by your own process first. The new number must then confirm a purpose-bound code before it becomes usable."
        submitLabel="Send verification"
        pending={phoneChange.pending}
        error={phoneChange.error}
        unconfirmed={phoneChange.unconfirmed}
        onRetryUnconfirmed={() => void phoneChange.retryUnconfirmed()}
        disabled={phone.trim().length < 6 || !isReasonValid(reason)}
        onClose={() => setDialog(null)}
        onSubmit={() => void phoneChange.submit()}
      >
        <TextField
          label="New WhatsApp number"
          value={phone}
          onChange={(event) => setPhone(event.target.value)}
          fullWidth
          required
        />
        <ReasonField
          value={reason}
          onChange={setReason}
          label="How the person was verified"
          helperText="Recorded in the audit trail with the change."
        />
      </FormDialog>

      <FormDialog
        open={dialog === 'verify'}
        title="Activate the new login number"
        description="Enter the code sent to the new number. Activation revokes the previous sessions and challenges."
        submitLabel="Activate number"
        pending={phoneVerify.pending}
        error={phoneVerify.error}
        unconfirmed={phoneVerify.unconfirmed}
        onRetryUnconfirmed={() => void phoneVerify.retryUnconfirmed()}
        disabled={code.trim().length < 4}
        onClose={() => setDialog(null)}
        onSubmit={() => void phoneVerify.submit()}
      >
        <TextField
          label="Verification code"
          value={code}
          onChange={(event) => setCode(event.target.value.replace(/\D/g, '').slice(0, 8))}
          fullWidth
          required
          inputMode="numeric"
          autoComplete="off"
        />
      </FormDialog>
    </>
  );
}
