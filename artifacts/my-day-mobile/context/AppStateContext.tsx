import React, { createContext, useCallback, useContext } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import {
  useGetAppState,
  useSaveAppState,
  type AppState,
  type Task,
  type Capture,
} from '@workspace/api-client-react';

// ─────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────

type AppStateContextValue = {
  state: AppState | undefined;
  isLoading: boolean;
  isError: boolean;
  isSaving: boolean;
  refetch: () => void;
  toggleTask: (id: string) => void;
  addCapture: (text: string) => void;
  deleteCapture: (id: string) => void;
};

// ─────────────────────────────────────────────────────────
// Context
// ─────────────────────────────────────────────────────────

const AppStateContext = createContext<AppStateContextValue | undefined>(undefined);

// ─────────────────────────────────────────────────────────
// Provider
// ─────────────────────────────────────────────────────────

export function AppStateProvider({ children }: { children: React.ReactNode }) {
  const queryClient = useQueryClient();

  const {
    data: state,
    isLoading,
    isError,
    refetch,
  } = useGetAppState();

  const { mutate: save, isPending: isSaving } = useSaveAppState({
    mutation: {
      onSuccess: (savedState: AppState) => {
        // Update the cache with the confirmed server state
        queryClient.setQueryData(['getAppState'], savedState);
      },
    },
  });

  // ── Helpers ──────────────────────────────────────────────

  const optimisticSave = useCallback(
    (next: AppState) => {
      // Instantly update the cache so the UI reflects changes immediately
      queryClient.setQueryData(['getAppState'], next);
      // Then persist to the server — the generated hook wraps the body as { data: AppState }
      save({ data: next });
    },
    [queryClient, save],
  );

  // ── Mutations ─────────────────────────────────────────────

  const toggleTask = useCallback(
    (id: string) => {
      if (!state) return;
      const next: AppState = {
        ...state,
        tasks: state.tasks.map((t: Task) =>
          t.id === id ? { ...t, done: !t.done } : t,
        ),
      };
      optimisticSave(next);
    },
    [state, optimisticSave],
  );

  const addCapture = useCallback(
    (text: string) => {
      if (!state) return;
      const newCapture = {
        id: Date.now().toString() + Math.random().toString(36).substr(2, 9),
        text: text.trim(),
        createdAt: new Date().toLocaleString('en-US', {
          weekday: 'short',
          month: 'short',
          day: 'numeric',
          hour: '2-digit',
          minute: '2-digit',
        }),
        converted: false,
      };
      const next: AppState = {
        ...state,
        captures: [newCapture, ...state.captures],
      };
      optimisticSave(next);
    },
    [state, optimisticSave],
  );

  const deleteCapture = useCallback(
    (id: string) => {
      if (!state) return;
      const next: AppState = {
        ...state,
        captures: state.captures.filter((c: Capture) => c.id !== id),
      };
      optimisticSave(next);
    },
    [state, optimisticSave],
  );

  return (
    <AppStateContext.Provider
      value={{
        state,
        isLoading,
        isError,
        isSaving,
        refetch,
        toggleTask,
        addCapture,
        deleteCapture,
      }}
    >
      {children}
    </AppStateContext.Provider>
  );
}

// ─────────────────────────────────────────────────────────
// Hook
// ─────────────────────────────────────────────────────────

export function useAppState() {
  const ctx = useContext(AppStateContext);
  if (!ctx) {
    throw new Error('useAppState must be used inside <AppStateProvider>');
  }
  return ctx;
}
