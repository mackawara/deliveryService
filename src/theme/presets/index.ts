import { monochrome } from '@/theme/presets/monochrome';
import { orchid } from '@/theme/presets/orchid';
import type { BrandTokens } from '@/theme/tokens';

/**
 * Brand preset registry. Adding a third preset means adding a token file and one entry
 * here; no feature component changes (specification section 7).
 */
export const BRAND_PRESETS = {
  orchid,
  monochrome,
} satisfies Record<string, BrandTokens>;

export type BrandPresetId = keyof typeof BRAND_PRESETS;

export const BRAND_PRESET_IDS = Object.keys(BRAND_PRESETS) as BrandPresetId[];

export const DEFAULT_PRESET_ID: BrandPresetId = 'orchid';

export function isBrandPresetId(value: string | null | undefined): value is BrandPresetId {
  return typeof value === 'string' && Object.prototype.hasOwnProperty.call(BRAND_PRESETS, value);
}

/** Unknown preset identifiers fall back to the deployment default. */
export function resolvePreset(id: string | null | undefined, fallback: BrandPresetId): BrandTokens {
  if (isBrandPresetId(id)) return BRAND_PRESETS[id];
  return BRAND_PRESETS[fallback] ?? BRAND_PRESETS[DEFAULT_PRESET_ID];
}
