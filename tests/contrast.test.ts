import { describe, expect, it } from 'vitest';

import { BRAND_PRESETS, BRAND_PRESET_IDS } from '@/theme/presets';
import { STATUS_TONES } from '@/theme/tokens';

/** Relative luminance per WCAG 2.1. */
function luminance(hex: string): number {
  const value = hex.replace('#', '');
  const channels = [value.slice(0, 2), value.slice(2, 4), value.slice(4, 6)].map((part) => {
    const srgb = Number.parseInt(part, 16) / 255;
    return srgb <= 0.03928 ? srgb / 12.92 : ((srgb + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * channels[0]! + 0.7152 * channels[1]! + 0.0722 * channels[2]!;
}

function contrast(foreground: string, background: string): number {
  const first = luminance(foreground);
  const second = luminance(background);
  const lighter = Math.max(first, second);
  const darker = Math.min(first, second);
  return (lighter + 0.05) / (darker + 0.05);
}

/** Text needs 4.5:1; non-text interactive boundaries need 3:1. */
const TEXT_MINIMUM = 4.5;
const BOUNDARY_MINIMUM = 3;

describe.each(BRAND_PRESET_IDS)('%s preset contrast', (presetId) => {
  const { palette } = BRAND_PRESETS[presetId];

  it('keeps body and muted text readable on both surfaces', () => {
    expect(contrast(palette.text.primary, palette.background.surface)).toBeGreaterThanOrEqual(
      TEXT_MINIMUM,
    );
    expect(contrast(palette.text.primary, palette.background.page)).toBeGreaterThanOrEqual(
      TEXT_MINIMUM,
    );
    expect(contrast(palette.text.muted, palette.background.surface)).toBeGreaterThanOrEqual(
      TEXT_MINIMUM,
    );
    expect(contrast(palette.text.muted, palette.background.surfaceMuted)).toBeGreaterThanOrEqual(
      TEXT_MINIMUM,
    );
  });

  it('keeps contrast text readable on filled controls', () => {
    expect(contrast(palette.primary.contrastText, palette.primary.main)).toBeGreaterThanOrEqual(
      TEXT_MINIMUM,
    );
    expect(contrast(palette.secondary.contrastText, palette.secondary.main)).toBeGreaterThanOrEqual(
      TEXT_MINIMUM,
    );
    expect(contrast(palette.primary.softText, palette.primary.soft)).toBeGreaterThanOrEqual(
      TEXT_MINIMUM,
    );
    expect(contrast(palette.secondary.softText, palette.secondary.soft)).toBeGreaterThanOrEqual(
      TEXT_MINIMUM,
    );
  });

  it('validates control borders and the focus ring independently of the decorative divider', () => {
    expect(contrast(palette.border.control, palette.background.surface)).toBeGreaterThanOrEqual(
      BOUNDARY_MINIMUM,
    );
    expect(
      contrast(palette.border.controlHover, palette.background.surface),
    ).toBeGreaterThanOrEqual(BOUNDARY_MINIMUM);
    expect(contrast(palette.border.focusRing, palette.background.surface)).toBeGreaterThanOrEqual(
      BOUNDARY_MINIMUM,
    );
    expect(contrast(palette.border.focusRing, palette.background.page)).toBeGreaterThanOrEqual(
      BOUNDARY_MINIMUM,
    );
  });

  it.each(STATUS_TONES)('keeps the %s status chip readable and outlined', (tone) => {
    const tokens = palette.status[tone];
    expect(contrast(tokens.foreground, tokens.background)).toBeGreaterThanOrEqual(TEXT_MINIMUM);
    expect(contrast(tokens.border, palette.background.surface)).toBeGreaterThanOrEqual(
      BOUNDARY_MINIMUM,
    );
  });

  it('distinguishes statuses by border style as well as tone', () => {
    const styles = new Set(STATUS_TONES.map((tone) => palette.status[tone].borderStyle));
    expect(styles.size).toBeGreaterThan(1);
  });
});
