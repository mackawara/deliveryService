import ArrowBackIcon from '@mui/icons-material/ArrowBack';
import Alert from '@mui/material/Alert';
import Button from '@mui/material/Button';
import Divider from '@mui/material/Divider';
import Grid from '@mui/material/Grid';
import List from '@mui/material/List';
import ListItemButton from '@mui/material/ListItemButton';
import ListItemText from '@mui/material/ListItemText';
import Stack from '@mui/material/Stack';
import TextField from '@mui/material/TextField';
import Typography from '@mui/material/Typography';
import useMediaQuery from '@mui/material/useMediaQuery';
import { useTheme } from '@mui/material/styles';
import { useMemo, useState } from 'react';
import { Link as RouterLink } from 'react-router-dom';

import type { WireCandidate } from '@/api/dto/fleet';
import { useGetBookingQuery, useListBookingsQuery } from '@/api/endpoints/bookings';
import {
  useCreateOfferMutation,
  useCreateReassignmentMutation,
  useGetCandidatesQuery,
} from '@/api/endpoints/dispatch';
import type { NormalizedApiError } from '@/api/errors';
import { POLLING, polled } from '@/api/polling';
import { useHasAccess } from '@/auth/useAuth';
import { ApiError } from '@/components/ApiError';
import { EmptyState } from '@/components/EmptyState';
import { FormDialog } from '@/components/FormDialog';
import { KeyValue } from '@/components/KeyValue';
import { Money } from '@/components/Money';
import { PageHeader } from '@/components/PageHeader';
import { ReasonField, isReasonValid } from '@/components/ReasonField';
import { Section } from '@/components/Section';
import { StatusChip } from '@/components/StatusChip';
import { assignmentStateMeta, deliveryStatusMeta, describeStatus } from '@/components/statusMeta';
import { CandidateList } from '@/features/dispatch/CandidateList';
import { bookingReference } from '@/features/bookings/bookingHelpers';
import { useTownScope } from '@/app/useTownScope';
import { formatCountdown, formatDateTime } from '@/lib/datetime';
import { useCountdown } from '@/lib/useCountdown';
import { useGuardedAction } from '@/lib/useGuardedAction';
import { useQueryParam } from '@/lib/useUrlState';

/**
 * Dispatch workspace (specification section 4.3).
 *
 * Desktop shows queue, selected booking and candidates side by side; from 768px the
 * selected booking takes the full width with a clear back action. A sent offer is
 * "Awaiting driver acceptance" until refreshed server state confirms acceptance.
 */
export function DispatchPage() {
  const [selectedId, setSelectedId] = useQueryParam('booking');
  // A booking change also starts a fresh selection and reason capture, including URL navigation.
  return (
    <DispatchWorkspace
      key={selectedId ?? 'queue'}
      selectedId={selectedId}
      setSelectedId={setSelectedId}
    />
  );
}

function DispatchWorkspace({
  selectedId,
  setSelectedId,
}: {
  selectedId: string | null;
  setSelectedId: (id: string | null) => void;
}) {
  const theme = useTheme();
  const wide = useMediaQuery(theme.breakpoints.up('lg'));
  const { townId } = useTownScope();
  const canOverrideSuitability = useHasAccess({ anyRole: ['admin'] });

  const [selectedCandidate, setSelectedCandidate] = useState<WireCandidate | null>(null);
  const [offerDialogOpen, setOfferDialogOpen] = useState(false);
  const [reassignDialogOpen, setReassignDialogOpen] = useState(false);
  const [reassignReason, setReassignReason] = useState('');
  const [custodyNote, setCustodyNote] = useState('');
  const [suitabilityOverrideReason, setSuitabilityOverrideReason] = useState('');
  const [inspectionReason, setInspectionReason] = useState('');
  const needsSuitabilityOverride = selectedCandidate?.suitability.fits === false;
  const suitabilityOverrideValid =
    !needsSuitabilityOverride ||
    (canOverrideSuitability &&
      selectedCandidate?.suitability.overrideAllowed === true &&
      isReasonValid(suitabilityOverrideReason));
  const needsInspectionReason =
    selectedCandidate?.suitability.inspectionRequired === true && !needsSuitabilityOverride;
  function selectCandidate(candidate: WireCandidate) {
    setSelectedCandidate(candidate);
    setSuitabilityOverrideReason('');
    setInspectionReason('');
    setReassignReason('');
    setCustodyNote('');
    offer.reset();
    reassign.reset();
  }

  const queue = useListBookingsQuery(
    { townId, status: 'READY_FOR_DISPATCH', limit: 50 },
    polled(POLLING.dispatch),
  );
  const awaiting = useListBookingsQuery(
    { townId, status: 'ASSIGNED', limit: 50 },
    polled(POLLING.dispatch),
  );

  const detail = useGetBookingQuery(selectedId ?? '', {
    skip: !selectedId,
    ...polled(POLLING.dispatch),
  });
  const candidates = useGetCandidatesQuery(selectedId ?? '', {
    skip: !selectedId,
    ...polled(POLLING.dispatch),
  });

  const [createOffer] = useCreateOfferMutation();
  const [createReassignment] = useCreateReassignmentMutation();

  const booking = detail.data?.booking;
  const activeAssignment = useMemo(
    () => detail.data?.assignments.find((assignment) => assignment.active),
    [detail.data],
  );
  const offerRemaining = useCountdown(
    activeAssignment?.state === 'OFFERED' ? activeAssignment.offerExpiresAt : null,
  );
  const collected = booking
    ? ['COLLECTED', 'IN_TRANSIT', 'AT_DROPOFF'].includes(booking.status)
    : false;
  const selectionValid = Boolean(booking && booking.id === selectedId && selectedCandidate);
  const offerValid =
    selectionValid &&
    !activeAssignment &&
    suitabilityOverrideValid &&
    (!needsInspectionReason || isReasonValid(inspectionReason));
  const reassignValid =
    selectionValid &&
    Boolean(activeAssignment) &&
    suitabilityOverrideValid &&
    isReasonValid(reassignReason) &&
    (!collected || isReasonValid(custodyNote));

  const offer = useGuardedAction({
    allowUnconfirmedRetry: true,
    run: (_args: void, idempotencyKey: string) => {
      if (!booking || !selectedCandidate || !offerValid)
        throw new Error('unreachable: guarded by the dialog');
      return createOffer({
        bookingId: booking.id,
        driverId: selectedCandidate.driverId,
        vehicleId: selectedCandidate.vehicleId,
        expectedVersion: booking.version,
        ...(needsSuitabilityOverride
          ? { suitabilityOverrideReason: suitabilityOverrideReason.trim() }
          : needsInspectionReason
            ? { overrideReason: inspectionReason.trim() }
            : {}),
        idempotencyKey,
      }).unwrap();
    },
    refresh: () => {
      void detail.refetch();
      void candidates.refetch();
    },
    successMessage: 'Offer sent. It is awaiting driver acceptance.',
    onSuccess: () => {
      setOfferDialogOpen(false);
      setSelectedCandidate(null);
    },
  });

  const reassign = useGuardedAction({
    run: (_args: void, idempotencyKey: string) => {
      if (!booking || !selectedCandidate || !reassignValid)
        throw new Error('unreachable: guarded by the dialog');
      return createReassignment({
        bookingId: booking.id,
        driverId: selectedCandidate.driverId,
        vehicleId: selectedCandidate.vehicleId,
        reason: reassignReason.trim(),
        ...(needsSuitabilityOverride
          ? { suitabilityOverrideReason: suitabilityOverrideReason.trim() }
          : {}),
        custodyHandoverNote: custodyNote.trim() || undefined,
        expectedVersion: booking.version,
        idempotencyKey,
      }).unwrap();
    },
    refresh: () => {
      void detail.refetch();
      void candidates.refetch();
    },
    successMessage: 'Reassignment sent. The new driver must still accept.',
    onSuccess: () => {
      setReassignDialogOpen(false);
      setSelectedCandidate(null);
    },
  });

  const queueItems = [...(queue.data?.items ?? []), ...(awaiting.data?.items ?? [])];

  const suitabilityOverrideFields = needsSuitabilityOverride ? (
    <>
      <Alert severity="warning">
        This vehicle does not meet the package requirements:{' '}
        {selectedCandidate.suitability.reasons.join(' · ')}. An administrator must record why this
        vehicle can be used for this load.
      </Alert>
      <ReasonField
        label="Vehicle suitability override reason"
        value={suitabilityOverrideReason}
        onChange={setSuitabilityOverrideReason}
        disabled={offer.pending || reassign.pending}
        helperText="Explain the checked load and vehicle suitability. Recorded in the audit trail. At least three characters."
      />
    </>
  ) : null;

  const queuePanel = (
    <Section
      title="Dispatch queue"
      description="Bookings ready for dispatch and those already offered or assigned."
    >
      {queue.isLoading ? (
        <Typography variant="body2" color="text.secondary">
          Loading queue…
        </Typography>
      ) : queue.error ? (
        <ApiError error={queue.error as NormalizedApiError} onRetry={() => void queue.refetch()} />
      ) : queueItems.length === 0 ? (
        <EmptyState
          title="Nothing waiting for dispatch"
          description="Bookings appear here once holds are released and they are ready for a driver."
        />
      ) : (
        <List dense disablePadding>
          {queueItems.map((item) => (
            <ListItemButton
              key={item.id}
              selected={item.id === selectedId}
              onClick={() => {
                setSelectedId(item.id);
                setSelectedCandidate(null);
              }}
            >
              <ListItemText
                primary={bookingReference(item)}
                secondary={`${item.pickup.zoneCode ?? '—'} → ${item.dropoff.zoneCode ?? '—'}`}
              />
              <StatusChip descriptor={describeStatus(deliveryStatusMeta, item.status)} />
            </ListItemButton>
          ))}
        </List>
      )}
    </Section>
  );

  const bookingPanel = booking ? (
    <Section
      title={bookingReference(booking)}
      description="Review the booking, driver and vehicle before sending an offer."
      actions={
        <Button component={RouterLink} to={`/bookings/${booking.id}`} variant="text">
          Open booking
        </Button>
      }
    >
      <Stack spacing={2}>
        <Stack direction="row" spacing={1} sx={{ flexWrap: 'wrap', gap: 1 }}>
          <StatusChip
            descriptor={describeStatus(deliveryStatusMeta, booking.status)}
            size="medium"
          />
          {activeAssignment ? (
            <StatusChip
              descriptor={describeStatus(assignmentStateMeta, activeAssignment.state)}
              size="medium"
            />
          ) : null}
        </Stack>

        {activeAssignment?.state === 'OFFERED' ? (
          <Alert severity="info">
            Awaiting driver acceptance. The server-set offer expires in{' '}
            {formatCountdown(offerRemaining)} ({formatDateTime(activeAssignment.offerExpiresAt)}).
            Acceptance is confirmed by refreshed server state, not by this screen.
          </Alert>
        ) : null}

        <KeyValue
          entries={[
            {
              label: 'Pickup',
              value: `${booking.pickup.zoneCode ?? '—'} · ${booking.pickup.addressLine}`,
              wide: true,
            },
            {
              label: 'Drop-off',
              value: `${booking.dropoff.zoneCode ?? '—'} · ${booking.dropoff.addressLine}`,
              wide: true,
            },
            {
              label: 'Parcel',
              value: `${booking.parcel.quantity} × ${booking.parcel.categoryCode}`,
            },
            {
              label: 'Vehicle requirement',
              value: booking.vehicleRequirement.unresolved
                ? `Unresolved: ${booking.vehicleRequirement.reasons.join(', ')}`
                : booking.vehicleRequirement.allowedClasses.join(', '),
            },
            {
              label: 'Special handling',
              value: booking.parcel.specialHandling.join(', ') || 'None',
            },
            {
              label: 'Total load weight',
              value:
                booking.vehicleRequirement.totalWeightKg === undefined
                  ? 'Unknown'
                  : `${booking.vehicleRequirement.totalWeightKg} kg`,
            },
            {
              label: 'Largest item dimensions',
              value: booking.vehicleRequirement.largestItemDimensionsCm
                ? `${booking.vehicleRequirement.largestItemDimensionsCm.lengthCm} × ${booking.vehicleRequirement.largestItemDimensionsCm.widthCm} × ${booking.vehicleRequirement.largestItemDimensionsCm.heightCm} cm`
                : 'Unknown',
            },
            {
              label: 'Accepted price',
              value: <Money cents={booking.acceptedQuote?.totalCents ?? null} emphasis />,
            },
          ]}
        />

        {collected ? (
          <Alert severity="warning">
            This parcel is already in a driver's custody. A reassignment must record the custody
            handover the backend requires.
          </Alert>
        ) : null}
      </Stack>
    </Section>
  ) : (
    <Section
      title="No booking selected"
      description="Choose a booking from the queue to see candidates."
    >
      <EmptyState
        title="Select a booking"
        description="Candidates are loaded for the selected booking only."
      />
    </Section>
  );

  const candidatePanel = (
    <Section
      title="Driver candidates"
      description="Ranked by approximate geographic distance to pickup, then by longest idle time."
      actions={
        booking ? (
          <Button variant="text" onClick={() => void candidates.refetch()}>
            Refresh
          </Button>
        ) : undefined
      }
    >
      {!booking ? (
        <Typography variant="body2" color="text.secondary">
          Select a booking to load candidates.
        </Typography>
      ) : candidates.isLoading ? (
        <Typography variant="body2" color="text.secondary">
          Loading candidates…
        </Typography>
      ) : candidates.error ? (
        <ApiError
          error={candidates.error as NormalizedApiError}
          onRetry={() => void candidates.refetch()}
        />
      ) : candidates.data ? (
        <Stack spacing={2}>
          <CandidateList
            result={candidates.data}
            selectedDriverId={selectedCandidate?.driverId ?? null}
            selectedVehicleId={selectedCandidate?.vehicleId ?? null}
            onSelect={selectCandidate}
            canOverrideSuitability={canOverrideSuitability}
            disabled={offer.pending || reassign.pending}
          />
          <Divider />
          <Stack direction="row" spacing={1} sx={{ flexWrap: 'wrap', gap: 1 }}>
            <Button
              variant="contained"
              disabled={!selectedCandidate || Boolean(activeAssignment) || offer.pending}
              onClick={() => setOfferDialogOpen(true)}
            >
              Send offer
            </Button>
            <Button
              variant="outlined"
              disabled={!selectedCandidate || !activeAssignment || reassign.pending}
              onClick={() => setReassignDialogOpen(true)}
            >
              Reassign
            </Button>
          </Stack>
          {activeAssignment ? (
            <Typography variant="caption" color="text.secondary">
              A first assignment and a reassignment are separate commands. Reassignment needs a
              reason and, after collection, the custody handover information.
            </Typography>
          ) : null}
        </Stack>
      ) : null}
    </Section>
  );

  return (
    <>
      <PageHeader
        title="Dispatch"
        description="Match a booking to an available driver and vehicle."
        crumbs={[{ label: 'Operations' }, { label: 'Dispatch' }]}
        actions={
          !wide && selectedId ? (
            <Button startIcon={<ArrowBackIcon />} onClick={() => setSelectedId(null)}>
              Back to queue
            </Button>
          ) : undefined
        }
      />

      {wide ? (
        <Grid container spacing={2}>
          <Grid size={3}>{queuePanel}</Grid>
          <Grid size={5}>{bookingPanel}</Grid>
          <Grid size={4}>{candidatePanel}</Grid>
        </Grid>
      ) : selectedId ? (
        <Stack spacing={2}>
          {bookingPanel}
          {candidatePanel}
        </Stack>
      ) : (
        queuePanel
      )}

      <FormDialog
        open={offerDialogOpen}
        title="Send this offer?"
        description="The driver receives an offer on WhatsApp. It is not an assignment until they accept."
        submitLabel="Send offer"
        pending={offer.pending}
        error={offer.error}
        unconfirmed={offer.unconfirmed}
        onRetryUnconfirmed={() => void offer.retryUnconfirmed()}
        onClose={() => setOfferDialogOpen(false)}
        disabled={!offerValid}
        onSubmit={() => {
          if (offerValid) void offer.submit();
        }}
      >
        <KeyValue
          columns={1}
          entries={[
            { label: 'Booking', value: booking ? bookingReference(booking) : '—' },
            { label: 'Driver', value: selectedCandidate?.driverName },
            {
              label: 'Vehicle',
              value: selectedCandidate
                ? `${selectedCandidate.vehicleClass} · ${selectedCandidate.registration}`
                : undefined,
            },
            {
              label: 'Suitability',
              value: selectedCandidate?.suitability.fits
                ? 'Fits this load'
                : (selectedCandidate?.suitability.reasons.join(', ') ?? '—'),
            },
          ]}
        />
        {suitabilityOverrideFields}
        {needsInspectionReason ? (
          <ReasonField
            label="Packing inspection reason"
            value={inspectionReason}
            onChange={setInspectionReason}
            disabled={offer.pending}
            helperText="Record the packing inspection that confirms this load can be carried. At least three characters."
          />
        ) : null}
      </FormDialog>

      <FormDialog
        open={reassignDialogOpen}
        title="Reassign this booking"
        description="Reassignment replaces the current assignment and is recorded separately from a first offer."
        submitLabel="Send reassignment"
        pending={reassign.pending}
        error={reassign.error}
        unconfirmed={reassign.unconfirmed}
        onRetryUnconfirmed={() => void reassign.retryUnconfirmed()}
        disabled={!reassignValid}
        onClose={() => setReassignDialogOpen(false)}
        onSubmit={() => {
          if (reassignValid) void reassign.submit();
        }}
      >
        <KeyValue
          columns={1}
          entries={[
            { label: 'New driver', value: selectedCandidate?.driverName },
            {
              label: 'Vehicle',
              value: selectedCandidate
                ? `${selectedCandidate.vehicleClass} · ${selectedCandidate.registration}`
                : undefined,
            },
          ]}
        />
        {suitabilityOverrideFields}
        <ReasonField value={reassignReason} onChange={setReassignReason} />
        <TextField
          label="Custody handover note"
          value={custodyNote}
          onChange={(event) => setCustodyNote(event.target.value)}
          fullWidth
          multiline
          minRows={2}
          required={collected}
          helperText={
            collected
              ? 'Required: the parcel is already in a driver’s custody, so record how it changes hands.'
              : 'Optional before collection.'
          }
        />
      </FormDialog>
    </>
  );
}
