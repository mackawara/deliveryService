import { configureStore, type Action } from '@reduxjs/toolkit';
import { setupListeners } from '@reduxjs/toolkit/query/react';

// Importing the barrel guarantees every feature's endpoints are injected before the
// store is created.
import '@/api';
import { baseApi } from '@/api/baseApi';
import { setSessionExpiryListener } from '@/api/baseQuery';
import { sessionExpired, sessionReducer } from '@/auth/sessionSlice';
import { uiReducer } from '@/app/uiSlice';

/** Authentication endpoints whose arguments and results must never reach dev tooling. */
const SENSITIVE_ENDPOINTS = new Set([
  'requestOtp',
  'resendOtp',
  'verifyOtp',
  'getCsrf',
  'verifyStaffPhoneChange',
]);

const REDACTED = '[redacted]';

interface RtkQueryActionMeta {
  arg?: { endpointName?: string; originalArgs?: unknown };
}

/**
 * Redacts OTP codes, phone numbers and CSRF tokens from Redux DevTools and any action
 * logging (specification section 6). Never log OTPs, cookies or session identifiers.
 */
function actionSanitizer<A extends Action>(action: A): A {
  const meta = (action as unknown as { meta?: RtkQueryActionMeta }).meta;
  const endpointName = meta?.arg?.endpointName;
  if (!endpointName || !SENSITIVE_ENDPOINTS.has(endpointName)) return action;
  return {
    ...action,
    payload: REDACTED,
    meta: { ...meta, arg: { ...meta.arg, originalArgs: REDACTED } },
  } as unknown as A;
}

const reducer = {
  [baseApi.reducerPath]: baseApi.reducer,
  session: sessionReducer,
  ui: uiReducer,
};

/** The query cache may hold masked staff details; keep it out of dev tooling. */
function stateSanitizer<S>(state: S): S {
  return { ...(state as object), [baseApi.reducerPath]: REDACTED } as S;
}

const devToolsOptions = { actionSanitizer, stateSanitizer };

export function createAppStore() {
  const store = configureStore({
    reducer,
    middleware: (getDefaultMiddleware) => getDefaultMiddleware().concat(baseApi.middleware),
    devTools: import.meta.env.DEV ? devToolsOptions : false,
  });

  // Refetch on reconnect and on window focus (specification section 6).
  setupListeners(store.dispatch);

  // One login transition for concurrent unauthenticated failures.
  setSessionExpiryListener(() => {
    store.dispatch(sessionExpired());
  });

  return store;
}

export type AppStore = ReturnType<typeof createAppStore>;
export type RootState = ReturnType<AppStore['getState']>;
export type AppDispatch = AppStore['dispatch'];
