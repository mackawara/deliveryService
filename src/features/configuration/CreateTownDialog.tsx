import TextField from '@mui/material/TextField';
import Typography from '@mui/material/Typography';
import { useState } from 'react';

import { useCreateTownMutation } from '@/api/endpoints/configuration';
import type { Town } from '@/api/types';
import { appConfig } from '@/config';
import { FormDialog } from '@/components/FormDialog';
import { parseGeoArea } from '@/features/configuration/geojson';
import { isValidSlug, slugify } from '@/features/configuration/slug';
import { useGuardedAction } from '@/lib/useGuardedAction';

export interface CreateTownDialogProps {
  open: boolean;
  onClose: () => void;
  onCreated: (town: Town) => void;
}

/**
 * Creates a town (specification section 4.8). The town starts closed to bookings with no
 * hours or policy: the server never invents them, and the launch checklist on the Towns
 * page names each step that remains.
 */
export function CreateTownDialog({ open, onClose, onCreated }: CreateTownDialogProps) {
  const [createTown] = useCreateTownMutation();
  const [name, setName] = useState('');
  const [slug, setSlug] = useState('');
  const [slugEdited, setSlugEdited] = useState(false);
  const [timezone, setTimezone] = useState(appConfig.defaultTimeZone);
  const [geojson, setGeojson] = useState('');
  const [supportContact, setSupportContact] = useState('');

  const effectiveSlug = slugEdited ? slug : slugify(name);
  const parsed = geojson.trim() === '' ? null : parseGeoArea(geojson);
  const slugValid = isValidSlug(effectiveSlug);
  const ready =
    name.trim().length >= 2 && slugValid && timezone.trim().length >= 3 && parsed?.ok === true;

  const create = useGuardedAction({
    run: () => {
      if (!parsed?.ok) throw new Error('unreachable: guarded by the dialog');
      return createTown({
        name: name.trim(),
        slug: effectiveSlug,
        timezone: timezone.trim(),
        serviceArea: parsed.area,
        supportContact: supportContact.trim() || undefined,
      }).unwrap();
    },
    successMessage: (town) =>
      `${town.name} created. It stays closed to bookings until launch is complete.`,
    onSuccess: (town) => {
      reset();
      onCreated(town);
    },
  });

  function reset() {
    setName('');
    setSlug('');
    setSlugEdited(false);
    setTimezone(appConfig.defaultTimeZone);
    setGeojson('');
    setSupportContact('');
    create.reset();
  }

  return (
    <FormDialog
      open={open}
      title="Add a town"
      description="The town starts closed to bookings. Hours, policy, zones, parcel presets, rates and a driver come next."
      submitLabel="Create town"
      pending={create.pending}
      error={create.error}
      unconfirmed={create.unconfirmed}
      disabled={!ready}
      onClose={() => {
        reset();
        onClose();
      }}
      onSubmit={() => void create.submit()}
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
        label="Slug"
        value={effectiveSlug}
        onChange={(event) => {
          setSlugEdited(true);
          setSlug(event.target.value);
        }}
        required
        fullWidth
        error={effectiveSlug !== '' && !slugValid}
        helperText="Lowercase letters, digits and dashes. It cannot be changed later."
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
        label="Service area (GeoJSON)"
        value={geojson}
        onChange={(event) => setGeojson(event.target.value)}
        required
        fullWidth
        multiline
        minRows={6}
        placeholder='{"type":"Polygon","coordinates":[[[26.4,-18.45],[26.6,-18.45],[26.6,-18.3],[26.4,-18.3],[26.4,-18.45]]]}'
        error={parsed?.ok === false}
        helperText={
          parsed === null
            ? 'Polygon or MultiPolygon, with [longitude, latitude] positions.'
            : parsed.ok
              ? `${parsed.area.type} with ${parsed.ringCount} ring(s) and ${parsed.pointCount} position(s).`
              : parsed.message
        }
      />
      <TextField
        label="Support contact"
        value={supportContact}
        onChange={(event) => setSupportContact(event.target.value)}
        fullWidth
      />
      <Typography variant="body2" color="text.secondary">
        Only an administrator for all towns can add a town.
      </Typography>
    </FormDialog>
  );
}
