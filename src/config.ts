/**
 * Public frontend configuration (specification section 10).
 *
 * Only non-secret deployment inputs live here: API base URL, default phone country
 * code, default theme, application label and display timezone. WhatsApp credentials,
 * session/OTP secrets and authentication-template settings stay server-side.
 */
import { DEFAULT_PRESET_ID, isBrandPresetId, type BrandPresetId } from '@/theme/presets';

function readString(value: string | undefined, fallback: string): string {
  const trimmed = value?.trim();
  return trimmed && trimmed.length > 0 ? trimmed : fallback;
}

function readBoolean(value: string | undefined, fallback: boolean): boolean {
  if (value === undefined) return fallback;
  return value.trim().toLowerCase() === 'true';
}

function readPresetId(value: string | undefined): BrandPresetId {
  const candidate = value?.trim();
  return isBrandPresetId(candidate) ? candidate : DEFAULT_PRESET_ID;
}

export interface AppConfig {
  /** Base URL every delivery-service request is built from. */
  apiBaseUrl: string;
  /** Country code pre-selected on the staff login form. */
  defaultPhoneCountry: string;
  /** Brand preset used until the browser has a saved preference. */
  defaultPresetId: BrandPresetId;
  /** Product label used in the shell and document title. */
  appLabel: string;
  /** Timezone used to render API timestamps until a town supplies its own. */
  defaultTimeZone: string;
  /** Browser Maps key, restricted to the dashboard website and Maps JavaScript API. */
  googleMapsApiKey: string;
  /** Dev/test only: serve API contracts from in-browser mock handlers. */
  enableMockApi: boolean;
  /** Enable only with the matching, deployed food-settlement API and approved policy. */
  enableFoodSettlements: boolean;
  /** Independent, default-off EcoCash panel gate; backend provider readiness remains required. */
  enableFoodEcoCash: boolean;
}

export const appConfig: AppConfig = {
  apiBaseUrl: readString(import.meta.env.VITE_API_BASE_URL, '/api/v1'),
  defaultPhoneCountry: readString(import.meta.env.VITE_DEFAULT_PHONE_COUNTRY, '+263'),
  defaultPresetId: readPresetId(import.meta.env.VITE_DEFAULT_THEME),
  appLabel: readString(import.meta.env.VITE_APP_LABEL, 'Delivery Dashboard'),
  defaultTimeZone: readString(import.meta.env.VITE_DEFAULT_TIMEZONE, 'Africa/Harare'),
  googleMapsApiKey: readString(import.meta.env.VITE_GOOGLE_MAPS_API_KEY, ''),
  enableMockApi: readBoolean(import.meta.env.VITE_ENABLE_MOCK_API, false) && import.meta.env.DEV,
  enableFoodSettlements: readBoolean(import.meta.env.VITE_ENABLE_FOOD_SETTLEMENTS, false),
  enableFoodEcoCash: readBoolean(import.meta.env.VITE_ENABLE_FOOD_ECOCASH, false),
};

/**
 * Which build this is. Stamped by the release workflow; `0.0.0-dev` / `unknown` when
 * built locally. `/version.json` in the deployed bundle carries the same values.
 */
export const buildInfo = __APP_BUILD__;
