import PaletteIcon from '@mui/icons-material/Palette';
import IconButton from '@mui/material/IconButton';
import ListItemText from '@mui/material/ListItemText';
import Menu from '@mui/material/Menu';
import MenuItem from '@mui/material/MenuItem';
import Radio from '@mui/material/Radio';
import Tooltip from '@mui/material/Tooltip';
import { useState } from 'react';

import { useThemeController } from '@/theme/useThemeController';

/**
 * Brand preset switch. Selecting a preset applies immediately, without a reload, a
 * sign-out or a lost form draft (specification section 7).
 */
export function ThemeSelector() {
  const { presetId, setPresetId, presets } = useThemeController();
  const [anchor, setAnchor] = useState<HTMLElement | null>(null);

  return (
    <>
      <Tooltip title="Brand theme">
        <IconButton
          onClick={(event) => setAnchor(event.currentTarget)}
          aria-label="Choose brand theme"
          aria-haspopup="menu"
          color="inherit"
        >
          <PaletteIcon />
        </IconButton>
      </Tooltip>
      <Menu anchorEl={anchor} open={Boolean(anchor)} onClose={() => setAnchor(null)}>
        {presets.map((preset) => (
          <MenuItem
            key={preset.id}
            selected={preset.id === presetId}
            onClick={() => {
              setPresetId(preset.id);
              setAnchor(null);
            }}
          >
            <Radio checked={preset.id === presetId} size="small" tabIndex={-1} />
            <ListItemText primary={preset.label} secondary={preset.description} />
          </MenuItem>
        ))}
      </Menu>
    </>
  );
}
