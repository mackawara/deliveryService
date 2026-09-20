import MenuItem from '@mui/material/MenuItem';
import TextField from '@mui/material/TextField';

import { useTownScope, ALL_TOWNS } from '@/app/useTownScope';

/**
 * Town switch for the top bar. Changing town changes the query argument for every
 * town-scoped list, so records from the previous town are never shown under the new
 * heading (specification section 6).
 */
export function TownSelector({ onChanged }: { onChanged?: () => void }) {
  const { townId, setTownId, towns, allTowns, isLoading } = useTownScope();
  const selectedTownMissing = Boolean(townId && !towns.some((town) => town.id === townId));

  if (!allTowns && towns.length <= 1) {
    // A single-town account has nothing to choose; the heading still names the town.
    return null;
  }

  return (
    <TextField
      select
      size="small"
      label="Town"
      value={townId ?? ALL_TOWNS}
      disabled={isLoading}
      onChange={(event) => {
        const value = event.target.value;
        setTownId(value === ALL_TOWNS ? null : value);
        onChanged?.();
      }}
      sx={{ minWidth: 200 }}
    >
      {allTowns ? <MenuItem value={ALL_TOWNS}>All towns in my scope</MenuItem> : null}
      {selectedTownMissing && townId ? (
        <MenuItem value={townId} disabled>
          Loading selected town…
        </MenuItem>
      ) : null}
      {towns.map((town) => (
        <MenuItem key={town.id} value={town.id}>
          {town.name}
        </MenuItem>
      ))}
    </TextField>
  );
}
