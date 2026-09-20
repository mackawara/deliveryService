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
  /** Enable only after the route's server-side replay semantics have been verified. */
  allowUnconfirmedRetry?: boolean;
}

export type UnconfirmedState = false | 'review' | 'retryable';

export interface GuardedAction<TArgs> {
  /** Starts a deliberate new action with a fresh idempotency key. */
  submit: (args?: TArgs) => Promise<boolean>;
  /** Re-sends the identical payload with the same key to resolve an uncertain outcome. */
  retryUnconfirmed: () => Promise<boolean>;
  pending: boolean;
  error: NormalizedApiError | undefined;
  /** True after a timeout: the command may or may not have been applied. */
  unconfirmed: UnconfirmedState;
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
  type Run = (args: TArgs, idempotencyKey: string) => Promise<TResult>;
  const dispatch = useAppDispatch();
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<NormalizedApiError | undefined>(undefined);
  const [unconfirmed, setUnconfirmed] = useState<UnconfirmedState>(false);
  const actionKey = useRef(new ActionKey());
  const lastArgs = useRef<TArgs>(undefined as TArgs);
  const lastRun = useRef<Run>(options.run);

  const execute = useCallback(
    async (
      args: TArgs,
      key: string,
      run: Run,
    ): Promise<boolean> => {
      setPending(true);
      setError(undefined);
      try {
        const result = await run(args, key);
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
          setUnconfirmed(options.allowUnconfirmedRetry ? 'retryable' : 'review');
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
      // Keep the submit-time closure as part of the request snapshot. Callers often
      // build a body from form state inside `run`; a later render must not change it.
      lastRun.current = options.run;
      // A deliberate new action always gets a new key.
      return execute(lastArgs.current, actionKey.current.next(), lastRun.current);
    },
    [execute, options.run],
  );

  const retryUnconfirmed = useCallback(async () => {
    if (!options.allowUnconfirmedRetry) return false;
    // The same payload with the same key: safe for routes with idempotent semantics.
    return execute(lastArgs.current, actionKey.current.current(), lastRun.current);
  }, [execute, options.allowUnconfirmedRetry]);

  const reset = useCallback(() => {
    setError(undefined);
    setUnconfirmed(false);
    actionKey.current.reset();
    lastArgs.current = undefined as TArgs;
    lastRun.current = options.run;
  }, [options.run]);

  return { submit, retryUnconfirmed, pending, error, unconfirmed, reset };
}
