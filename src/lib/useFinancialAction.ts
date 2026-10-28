import { useCallback, useLayoutEffect, useMemo, useRef, useState } from 'react';

import { isNormalizedApiError, type NormalizedApiError } from '@/api/errors';
import { useAppDispatch } from '@/app/hooks';
import { noticeShown } from '@/app/uiSlice';
import { ActionKey } from '@/lib/idempotency';
import type { GuardedAction, GuardedActionOptions, UnconfirmedState } from '@/lib/useGuardedAction';

interface FinancialActionOptions<TArgs, TResult> extends GuardedActionOptions<TArgs, TResult> {
  /** Identity, permissions and branch of the form that owns this command. */
  scopeKey: string;
}

interface ActionScope {
  key: string;
}

interface ActionState {
  scope: ActionScope;
  pending: boolean;
  error?: NormalizedApiError;
  unconfirmed: UnconfirmedState;
}

/** A logical command keeps its payload, version and key until its outcome is known. */
export function useFinancialAction<TArgs, TResult>(
  options: FinancialActionOptions<TArgs, TResult>,
): GuardedAction<TArgs> {
  type Command = {
    scope: ActionScope;
    args: TArgs;
    key: string;
    run: FinancialActionOptions<TArgs, TResult>['run'];
    pending: boolean;
    unconfirmed: UnconfirmedState;
  };
  const dispatch = useAppDispatch();
  const scope = useMemo(() => ({ key: options.scopeKey }), [options.scopeKey]);
  const activeScope = useRef<ActionScope | null>(scope);
  const command = useRef<Command | null>(null);
  const [state, setState] = useState<ActionState>({
    scope,
    pending: false,
    unconfirmed: false,
  });

  useLayoutEffect(() => {
    activeScope.current = scope;
    return () => {
      activeScope.current = null;
    };
  }, [scope]);

  const execute = useCallback(
    async (snapshot: Command): Promise<boolean> => {
      // A ref closes the same-render double-click window before React can rerender.
      if (snapshot.pending || activeScope.current !== snapshot.scope) return false;
      snapshot.pending = true;
      setState({ scope: snapshot.scope, pending: true, unconfirmed: snapshot.unconfirmed });
      try {
        const result = await snapshot.run(snapshot.args, snapshot.key);
        if (activeScope.current !== snapshot.scope || command.current !== snapshot) return false;
        snapshot.unconfirmed = false;
        command.current = null;
        setState({ scope: snapshot.scope, pending: false, unconfirmed: false });
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
        if (activeScope.current !== snapshot.scope || command.current !== snapshot) return false;
        const error: NormalizedApiError = isNormalizedApiError(caught)
          ? caught
          : {
              kind: 'server',
              message: 'The outcome could not be confirmed. Refresh and review the record.',
            };
        const ambiguous = ['timeout', 'offline', 'server', 'unknown'].includes(error.kind);
        snapshot.unconfirmed = ambiguous
          ? options.allowUnconfirmedRetry
            ? 'retryable'
            : 'review'
          : false;
        setState({
          scope: snapshot.scope,
          pending: false,
          error,
          unconfirmed: snapshot.unconfirmed,
        });
        if (ambiguous || error.kind === 'conflict') options.refresh?.();
        return false;
      } finally {
        snapshot.pending = false;
      }
    },
    [dispatch, options],
  );

  const submit = useCallback(
    async (args?: TArgs) => {
      if (activeScope.current !== scope) return false;
      const current = command.current;
      if (current?.scope === scope && (current.pending || current.unconfirmed)) return false;
      const snapshot: Command = {
        scope,
        args: structuredClone(args) as TArgs,
        key: new ActionKey().next(),
        run: options.run,
        pending: false,
        unconfirmed: false,
      };
      command.current = snapshot;
      return execute(snapshot);
    },
    [execute, scope, options.run],
  );

  const retryUnconfirmed = useCallback(async () => {
    const snapshot = command.current;
    if (!options.allowUnconfirmedRetry || !snapshot?.unconfirmed || snapshot.scope !== scope)
      return false;
    return execute(snapshot);
  }, [execute, options.allowUnconfirmedRetry, scope]);

  const reset = useCallback(() => {
    if (activeScope.current !== scope) return;
    const snapshot = command.current;
    if (snapshot?.scope === scope && (snapshot.pending || snapshot.unconfirmed)) return;
    command.current = null;
    setState({ scope, pending: false, unconfirmed: false });
  }, [scope]);

  const current = state.scope === scope;
  return {
    submit,
    retryUnconfirmed,
    reset,
    pending: current && state.pending,
    error: current ? state.error : undefined,
    unconfirmed: current ? state.unconfirmed : false,
  };
}
