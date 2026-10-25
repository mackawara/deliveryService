import MenuItem from '@mui/material/MenuItem';
import Stack from '@mui/material/Stack';
import TextField from '@mui/material/TextField';
import type { SettlementFrequency } from '@/api/dto/shop';
import { weekdays, type ScheduleDraft } from './settlement';

export function SettlementFields({
  value,
  onChange,
}: {
  value: ScheduleDraft;
  onChange: (value: ScheduleDraft) => void;
}) {
  return (
    <Stack spacing={2}>
      <TextField
        select
        label="Settlement frequency"
        value={value.frequency}
        onChange={(event) =>
          onChange({ ...value, frequency: event.target.value as SettlementFrequency, anchor: '' })
        }
      >
        {(['DAILY', 'WEEKLY', 'MONTHLY'] as const).map((frequency) => (
          <MenuItem key={frequency} value={frequency}>
            {frequency}
          </MenuItem>
        ))}
      </TextField>
      {value.frequency !== 'DAILY' && (
        <TextField
          required
          select
          label={value.frequency === 'WEEKLY' ? 'Settlement weekday' : 'Settlement day of month'}
          value={value.anchor}
          onChange={(event) => onChange({ ...value, anchor: event.target.value })}
        >
          {(value.frequency === 'WEEKLY'
            ? weekdays
            : Array.from({ length: 28 }, (_, i) => String(i + 1))
          ).map((label, i) => (
            <MenuItem key={label} value={String(value.frequency === 'WEEKLY' ? i : i + 1)}>
              {label}
            </MenuItem>
          ))}
        </TextField>
      )}
      <Stack direction="row" spacing={2}>
        <TextField
          required
          fullWidth
          label="Timezone"
          value={value.timezone}
          onChange={(event) => onChange({ ...value, timezone: event.target.value })}
        />
        <TextField
          required
          fullWidth
          label="Cut-off"
          type="time"
          value={value.cutoffTime}
          onChange={(event) => onChange({ ...value, cutoffTime: event.target.value })}
          slotProps={{ inputLabel: { shrink: true } }}
        />
      </Stack>
    </Stack>
  );
}
