import Button from '@mui/material/Button';
import Divider from '@mui/material/Divider';
import Stack from '@mui/material/Stack';
import Typography from '@mui/material/Typography';

import type { WireCandidate, WireCandidateResult } from '@/api/dto/fleet';
import { LocationAge } from '@/components/LocationAge';
import { StatusChip } from '@/components/StatusChip';
import { availabilityMeta, describeStatus } from '@/components/statusMeta';

function distanceLabel(candidate: WireCandidate): string {
  if (candidate.distanceMeters === null) return 'Distance unavailable';
  const km = candidate.distanceMeters / 1000;
  return `${km < 1 ? `${Math.round(candidate.distanceMeters)} m` : `${km.toFixed(1)} km`} — approximate geographic distance`;
}

function CandidateRow({
  candidate,
  onSelect,
  selected,
  disabled,
}: {
  candidate: WireCandidate;
  onSelect?: (candidate: WireCandidate) => void;
  selected: boolean;
  disabled?: boolean;
}) {
  return (
    <Stack
      spacing={0.5}
      sx={{
        p: 1.5,
        borderRadius: 1,
        border: 1,
        borderColor: selected ? 'primary.main' : 'divider',
        bgcolor: selected ? 'action.selected' : 'background.paper',
      }}
    >
      <Stack
        direction="row"
        spacing={1}
        sx={{ alignItems: 'center', justifyContent: 'space-between' }}
      >
        <Typography variant="subtitle2">{candidate.driverName}</Typography>
        <StatusChip descriptor={describeStatus(availabilityMeta, candidate.availability)} />
      </Stack>
      <Typography variant="body2" color="text.secondary">
        {candidate.vehicleClass.toLowerCase()} · {candidate.registration}
      </Typography>
      <Typography variant="body2">{distanceLabel(candidate)}</Typography>
      <LocationAge
        receivedAt={null}
        ageSeconds={candidate.locationAgeSeconds}
        fresh={candidate.locationFresh}
        source={candidate.positionSource}
      />
      {candidate.suitability.reasons.length > 0 ? (
        <Typography
          variant="caption"
          color={candidate.suitability.fits ? 'text.secondary' : 'error.main'}
        >
          {candidate.suitability.reasons.join(' · ')}
        </Typography>
      ) : null}
      {candidate.suitability.inspectionRequired ? (
        <Typography variant="caption" color="warning.main">
          Inspection required before this vehicle is used for this load.
        </Typography>
      ) : null}
      {onSelect ? (
        <Button
          size="small"
          variant={selected ? 'contained' : 'outlined'}
          onClick={() => onSelect(candidate)}
          disabled={disabled}
        >
          {selected ? 'Selected' : 'Select driver'}
        </Button>
      ) : null}
    </Stack>
  );
}

export interface CandidateListProps {
  result: WireCandidateResult;
  selectedDriverId: string | null;
  onSelect: (candidate: WireCandidate) => void;
  disabled?: boolean;
}

/**
 * Candidate groups (specification section 4.3).
 *
 * Eligible candidates, missing or stale locations and unsuitable vehicles are shown
 * separately. Distance is labelled as an approximate geographic distance; there is no
 * animated position and no driving ETA.
 */
export function CandidateList({
  result,
  selectedDriverId,
  onSelect,
  disabled,
}: CandidateListProps) {
  return (
    <Stack spacing={2}>
      {!result.pickupPointAvailable ? (
        <Typography variant="body2" color="warning.main">
          This booking has no pickup location pin, so candidates cannot be ranked by distance.
          Request a location pin from the booking, or contact drivers directly.
        </Typography>
      ) : null}

      <Stack spacing={1}>
        <Typography variant="subtitle2">Eligible ({result.ranked.length})</Typography>
        {result.ranked.length === 0 ? (
          <Typography variant="body2" color="text.secondary">
            No eligible driver and vehicle pair is available right now.
          </Typography>
        ) : (
          result.ranked.map((candidate) => (
            <CandidateRow
              key={`${candidate.driverId}-${candidate.vehicleId}`}
              candidate={candidate}
              onSelect={onSelect}
              selected={selectedDriverId === candidate.driverId}
              disabled={disabled}
            />
          ))
        )}
      </Stack>

      {result.staleLocation.length > 0 ? (
        <>
          <Divider />
          <Stack spacing={1}>
            <Typography variant="subtitle2">
              Missing or stale location ({result.staleLocation.length})
            </Typography>
            <Typography variant="caption" color="text.secondary">
              Eligible but excluded from ranking. Contact the driver to confirm where they are
              before offering.
            </Typography>
            {result.staleLocation.map((candidate) => (
              <CandidateRow
                key={`${candidate.driverId}-${candidate.vehicleId}`}
                candidate={candidate}
                onSelect={onSelect}
                selected={selectedDriverId === candidate.driverId}
                disabled={disabled}
              />
            ))}
          </Stack>
        </>
      ) : null}

      {result.unsuitable.length > 0 ? (
        <>
          <Divider />
          <Stack spacing={1}>
            <Typography variant="subtitle2">
              Unsuitable for this load ({result.unsuitable.length})
            </Typography>
            {result.unsuitable.map((candidate) => (
              <CandidateRow
                key={`${candidate.driverId}-${candidate.vehicleId}`}
                candidate={candidate}
                selected={false}
              />
            ))}
          </Stack>
        </>
      ) : null}
    </Stack>
  );
}
