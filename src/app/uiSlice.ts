import { createSlice, nanoid, type PayloadAction } from '@reduxjs/toolkit';

/**
 * Shared interface state (specification section 6): ordinary Redux holds UI
 * preferences and notifications only. Server data stays in the query cache and form
 * fields stay local to their form.
 */
export type NoticeTone = 'success' | 'info' | 'warning' | 'error';

export interface Notice {
  id: string;
  tone: NoticeTone;
  message: string;
  /** Optional safe identifier a user can quote to support. */
  correlationId?: string;
}

export interface UiState {
  /** Last town the user chose; the URL query parameter remains authoritative. */
  lastTownId: string | null;
  navigationOpen: boolean;
  notices: Notice[];
}

const initialState: UiState = {
  lastTownId: null,
  navigationOpen: false,
  notices: [],
};

const uiSlice = createSlice({
  name: 'ui',
  initialState,
  reducers: {
    townSelected(state, action: PayloadAction<string | null>) {
      state.lastTownId = action.payload;
    },
    navigationToggled(state, action: PayloadAction<boolean | undefined>) {
      state.navigationOpen = action.payload ?? !state.navigationOpen;
    },
    noticeShown: {
      reducer(state, action: PayloadAction<Notice>) {
        state.notices.push(action.payload);
      },
      prepare(payload: Omit<Notice, 'id'>) {
        return { payload: { ...payload, id: nanoid() } };
      },
    },
    noticeDismissed(state, action: PayloadAction<string>) {
      state.notices = state.notices.filter((notice) => notice.id !== action.payload);
    },
    uiCleared() {
      return { ...initialState };
    },
  },
});

export const { townSelected, navigationToggled, noticeShown, noticeDismissed, uiCleared } =
  uiSlice.actions;
export const uiReducer = uiSlice.reducer;
