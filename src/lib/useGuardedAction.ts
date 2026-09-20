import { useCallback, useRef, useState } from 'react';

import type { NormalizedApiError } from '@/api/errors';
import { useAppDispatch } from '@/app/hooks';
import { noticeShown } from '@/app/uiSlice';
import { ActionKey } from '@/lib/idempotency';

export interface GuardedActionOptions<TArgs, TResult> {
  /** Runs the mutation. The key is supplied; reuse only happens on an explicit retry. */
  run: (args: TArgs, idempotencyKey: string) => Promise<TResult>;
  /** Refetches the affected record when an outcome could not be confirmed. */
  refresh?: () => void;
  successMessage?: string | ((result: TResult) => string);
  onSuccess?: (result: TResult) => void;
}

export interface GuardedAction<TArgs> {
  /** Starts a deliberate new action with a fresh idempotency key. */
  submit: (args?: TArgs) => Promise<boolean>;
  /** Re-sends the identical payload with the same key to resolve an uncertain outcome. */
  retryUnconfirmed: () => Promise<boolean>;
  pending: boolean;
  error: NormalizedApiError | undefined;
  /** True after a timeout: the command may or may not have been applied. */
  unconfirmed: boolean;
  reset: () => void;
}

/**
 * Runs a guarded command exactly the way section 6 requires.
 *
 * One idempotency key per logical action, the control disabled while pending, no
 * optimistic state, and a timeout reported as "Outcome not confirmed" with the record
 * refetched instead of the command being replayed automatically.
 */
export function useGuardedAction<TArgs, TResult>(
  options: GuardedActionOptions<TArgs, TResult>,
): GuardedAction<TArgs> {
  const dispatch = useAppDispatch();
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<NormalizedApiError | undefined>(undefined);
  const [unconfirmed, setUnconfirmed] = useState(false);
  const actionKey = useRef(new ActionKey());
  const lastArgs = useRef<TArgs>(undefined as TArgs);

  const execute = useCallback(
    async (args: TArgs, key: string): Promise<boolean> => {
      setPending(true);
      setError(undefined);
      try {
        const result = await options.run(args, key);
        setUnconfirmed(false);
        actionKey.current.reset();
        if (options.successMessage) {
          dispatch(
            noticeShown({
              tone: 'success',
              message:
                typeof options.successMessage === 'function'
                  ? options.successMessage(result)
                  : options.successMessage,
            }),
          );
        }
        options.onSuccess?.(result);
        return true;
      } catch (caught) {
        const normalized = caught as NormalizedApiError;
        setError(normalized);
        if (normalized.kind === 'timeout' || normalized.kind === 'offline') {
          // The command may already have been applied; read the record back rather than
          // sending it again on the user's behalf.
          setUnconfirmed(true);
          options.refresh?.();
        }
        return false;
      } finally {
        setPending(false);
      }
    },
    [dispatch, options],
  );

  const submit = useCallback(
    async (args?: TArgs) => {
      lastArgs.current = (args ?? (undefined as TArgs)) as TArgs;
      // A deliberate new action always gets a new key.
      return execute(lastArgs.current, actionKey.current.next());
    },
    [execute],
  );

  const retryUnconfirmed = useCallback(async () => {
    // The same payload with the same key: safe for routes with idempotent semantics.
    return execute(lastArgs.current, actionKey.current.current());
  }, [execute]);

  const reset = useCallback(() => {
    setError(undefined);
    setUnconfirmed(false);
    actionKey.current.reset();
    lastArgs.current = undefined as TArgs;
  }, []);

  return { submit, retryUnconfirmed, pending, error, unconfirmed, reset };
}
