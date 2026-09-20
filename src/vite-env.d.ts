/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_API_BASE_URL?: string;
  readonly VITE_DEFAULT_PHONE_COUNTRY?: string;
  readonly VITE_DEFAULT_THEME?: string;
  readonly VITE_APP_LABEL?: string;
  readonly VITE_DEFAULT_TIMEZONE?: string;
  readonly VITE_ENABLE_MOCK_API?: string;
  readonly VITE_DEV_API_PROXY_TARGET?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
