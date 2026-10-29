/// <reference types="vite/client" />
/// <reference types="google.maps" />

interface ImportMetaEnv {
  readonly VITE_API_BASE_URL?: string;
  readonly VITE_DEFAULT_PHONE_COUNTRY?: string;
  readonly VITE_DEFAULT_THEME?: string;
  readonly VITE_APP_LABEL?: string;
  readonly VITE_DEFAULT_TIMEZONE?: string;
  readonly VITE_ENABLE_MOCK_API?: string;
  readonly VITE_ENABLE_FOOD_SETTLEMENTS?: string;
  readonly VITE_ENABLE_FOOD_ECOCASH?: string;
  readonly VITE_GOOGLE_MAPS_API_KEY?: string;
  readonly VITE_DEV_API_PROXY_TARGET?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}

/** Replaced at build time by vite.config.ts (version, revision, build time). */
declare const __APP_BUILD__: { version: string; revision: string; buildTime: string };
