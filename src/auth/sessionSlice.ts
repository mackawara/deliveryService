import { createSlice, type PayloadAction } from '@reduxjs/toolkit';

/**
 * Session transition state (specification section 6).
 *
 * The signed-in identity itself lives in the `/me` query cache. This slice only tracks
 * the transition, so concurrent 401s produce exactly one move to the login page.
 */
export interface SessionState {
  /** Raised by the base query when a protected request was rejected as unauthenticated. */
  expired: boolean;
  /** Set once the transition has been performed, so it is not repeated. */
  transitionHandled: boolean;
  /** Validated same-origin relative path to return to after signing in. */
  returnPath: string | null;
  /** True while a deliberate sign-out is in progress. */
  signingOut: boolean;
}

const initialState: SessionState = {
  expired: false,
  transitionHandled: false,
  returnPath: null,
  signingOut: false,
};

const sessionSlice = createSlice({
  name: 'session',
  initialState,
  reducers: {
    sessionExpired(state) {
      // Idempotent: many failing requests still describe one expiry.
      if (!state.expired) {
        state.expired = true;
        state.transitionHandled = false;
      }
    },
    sessionTransitionHandled(state, action: PayloadAction<{ returnPath: string | null }>) {
      state.transitionHandled = true;
      state.returnPath = action.payload.returnPath;
    },
    signOutStarted(state) {
      state.signingOut = true;
    },
    sessionCleared() {
      return { ...initialState };
    },
  },
});

export const { sessionExpired, sessionTransitionHandled, signOutStarted, sessionCleared } =
  sessionSlice.actions;
export const sessionReducer = sessionSlice.reducer;
