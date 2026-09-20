import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useTheme } from '@mui/material/styles';
import TextField from '@mui/material/TextField';
import { describe, expect, it } from 'vitest';

import { AppearancePage } from '@/features/settings/AppearancePage';
import { PRESET_STORAGE_KEY } from '@/theme/ThemeController';
import { renderWithProviders } from './testUtils';

function ThemeProbe() {
  const theme = useTheme();
  return (
    <div>
      <span data-testid="preset-id">{theme.appTokens.id}</span>
      <span data-testid="primary">{theme.appTokens.palette.primary.main}</span>
      <TextField label="Draft note" defaultValue="" />
    </div>
  );
}

describe('brand theme switching', () => {
  it('starts on the deployment default preset', () => {
    renderWithProviders(<ThemeProbe />);
    expect(screen.getByTestId('preset-id')).toHaveTextContent('orchid');
  });

  it('switches presets immediately, keeps a form draft and persists only the preset id', async () => {
    const user = userEvent.setup();
    renderWithProviders(
      <>
        <AppearancePage />
        <ThemeProbe />
      </>,
    );

    const draft = screen.getByLabelText('Draft note');
    await user.type(draft, 'half-written note');

    const orchidPrimary = screen.getByTestId('primary').textContent;
    await user.click(screen.getByText('Black & white'));

    await waitFor(() => expect(screen.getByTestId('preset-id')).toHaveTextContent('monochrome'));
    expect(screen.getByTestId('primary').textContent).not.toBe(orchidPrimary);

    // The draft survives the switch: no reload, no remount, no lost input.
    expect(draft).toHaveValue('half-written note');

    // Only the preset identifier is stored.
    expect(window.localStorage.getItem(PRESET_STORAGE_KEY)).toBe('monochrome');
    const stored = Object.keys(window.localStorage);
    expect(stored.every((key) => key.startsWith('delivery-dashboard.'))).toBe(true);
  });

  it('falls back to the default when the stored preset id is unknown', () => {
    window.localStorage.setItem(PRESET_STORAGE_KEY, 'not-a-preset');
    renderWithProviders(<ThemeProbe />);
    expect(screen.getByTestId('preset-id')).toHaveTextContent('orchid');
  });

  it('follows a preset change made in another tab', async () => {
    renderWithProviders(<ThemeProbe />);
    window.localStorage.setItem(PRESET_STORAGE_KEY, 'monochrome');
    window.dispatchEvent(
      new StorageEvent('storage', { key: PRESET_STORAGE_KEY, newValue: 'monochrome' }),
    );
    await waitFor(() => expect(screen.getByTestId('preset-id')).toHaveTextContent('monochrome'));
  });
});
