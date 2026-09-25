import Alert from '@mui/material/Alert';
import Checkbox from '@mui/material/Checkbox';
import FormControlLabel from '@mui/material/FormControlLabel';
import Stack from '@mui/material/Stack';
import TextField from '@mui/material/TextField';

import type { OperatingHours } from '@/api/dto/configuration';
import { hasSplitShifts, hoursProblem } from '@/features/configuration/operatingHours';

/** Monday first, as staff read a working week; `day` stays 0 = Sunday on the wire. */
const DAYS: Array<{ day: number; label: string }> = [
  { day: 1, label: 'Monday' },
  { day: 2, label: 'Tuesday' },
  { day: 3, label: 'Wednesday' },
  { day: 4, label: 'Thursday' },
  { day: 5, label: 'Friday' },
  { day: 6, label: 'Saturday' },
  { day: 0, label: 'Sunday' },
];

export interface OperatingHoursEditorProps {
  value: OperatingHours[];
  onChange: (value: OperatingHours[]) => void;
  /** The hours as loaded, used to warn before split shifts are replaced. */
  initial?: OperatingHours[];
}

/**
 * One opening window per day, in the town's local time. The server also accepts split
 * shifts; those are kept unless their day is changed here, which replaces them.
 */
export function OperatingHoursEditor({ value, onChange, initial = [] }: OperatingHoursEditorProps) {
  function windowFor(day: number): OperatingHours | undefined {
    return value.find((window) => window.day === day);
  }

  function setDay(day: number, next: OperatingHours | null) {
    const others = value.filter((window) => window.day !== day);
    onChange(next ? [...others, next].sort((a, b) => a.day - b.day) : others);
  }

  return (
    <Stack spacing={1}>
      {hasSplitShifts(initial) ? (
        <Alert severity="warning">
          This town has more than one opening window on some days. Changing such a day here replaces
          its windows with the single one shown.
        </Alert>
      ) : null}
      {DAYS.map(({ day, label }) => {
        const window = windowFor(day);
        const problem = window ? hoursProblem(window) : null;
        return (
          <Stack
            key={day}
            direction={{ xs: 'column', sm: 'row' }}
            spacing={1}
            sx={{ alignItems: { sm: 'center' } }}
          >
            <FormControlLabel
              sx={{ minWidth: 150 }}
              control={
                <Checkbox
                  checked={window !== undefined}
                  onChange={(event) =>
                    setDay(
                      day,
                      event.target.checked ? { day, opensAt: '08:00', closesAt: '17:00' } : null,
                    )
                  }
                />
              }
              label={label}
            />
            {window ? (
              <>
                <TextField
                  size="small"
                  type="time"
                  label="Opens"
                  value={window.opensAt}
                  onChange={(event) => setDay(day, { ...window, opensAt: event.target.value })}
                  error={problem !== null}
                  slotProps={{
                    inputLabel: { shrink: true },
                    htmlInput: { 'aria-label': `${label} opens` },
                  }}
                />
                <TextField
                  size="small"
                  type="time"
                  label="Closes"
                  value={window.closesAt}
                  onChange={(event) => setDay(day, { ...window, closesAt: event.target.value })}
                  error={problem !== null}
                  helperText={problem ?? undefined}
                  slotProps={{
                    inputLabel: { shrink: true },
                    htmlInput: { 'aria-label': `${label} closes` },
                  }}
                />
              </>
            ) : null}
          </Stack>
        );
      })}
    </Stack>
  );
}
