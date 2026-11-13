import { createSlice, type PayloadAction } from '@reduxjs/toolkit';

/**
 * Session transition state (specification section 6).
 *
 * The signed-in identities themselves live in the `/admin/me` and `/shop/me` query
 * caches. This slice only tracks transitions that both shells must agree on: a session
 * that expired, and a deliberate sign-out, which ends every session the browser holds.
 */
export interface SessionState {
  /** Raised by the base query when a protected staff request was rejected as unauthenticated. */
  expired: boolean;
  /** Set once the move to the login page has been started, so it is not repeated. */
  transitionHandled: boolean;
  /** Raised when a shop owner who was signed in is no longer. */
  ownerExpired: boolean;
  /** True from the moment a deliberate sign-out starts: identity polling stops at once. */
  signingOut: boolean;
  /**
   * Latched by a deliberate sign-out. While set, neither `/admin/me` nor `/shop/me` is
   * read, so a session the server could not confirm as revoked is never restored. It
   * clears only when the page loads afresh, which is what signing in again does.
   */
  locallySignedOut: boolean;
  /** True when the server did not confirm that the sessions were ended. */
  signOutUnconfirmed: boolean;
}

const initialState: SessionState = {
  expired: false,
  transitionHandled: false,
  ownerExpired: false,
  signingOut: false,
  locallySignedOut: false,
  signOutUnconfirmed: false,
};

const sessionSlice = createSlice({
  name: 'session',
  initialState,
  reducers: {
    sessionExpired(state) {
      // Idempotent: many failing requests still describe one expiry. A deliberate
      // sign-out already explains the 401s that follow it.
      if (!state.expired && !state.signingOut && !state.locallySignedOut) {
        state.expired = true;
        state.transitionHandled = false;
      }
    },
    sessionTransitionHandled(state) {
      state.transitionHandled = true;
    },
    ownerSessionExpired(state) {
      if (!state.signingOut && !state.locallySignedOut) state.ownerExpired = true;
    },
    signOutStarted(state) {
      state.signingOut = true;
    },
    signOutCompleted(state, action: PayloadAction<{ confirmed: boolean }>) {
      state.signingOut = false;
      state.locallySignedOut = true;
      state.signOutUnconfirmed = !action.payload.confirmed;
      state.expired = false;
      state.transitionHandled = false;
      state.ownerExpired = false;
    },
  },
});

export const {
  sessionExpired,
  sessionTransitionHandled,
  ownerSessionExpired,
  signOutStarted,
  signOutCompleted,
} = sessionSlice.actions;
export const sessionReducer = sessionSlice.reducer;
