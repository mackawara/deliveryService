import { act, renderHook } from '@testing-library/react';
import type { ReactNode } from 'react';
import { Provider } from 'react-redux';
import { describe, expect, it, vi } from 'vitest';

import { createAppStore } from '@/app/store';
import { useFinancialAction } from '@/lib/useFinancialAction';

function wrapper({ children }: { children: ReactNode }) {
  return <Provider store={createAppStore()}>{children}</Provider>;
}

describe('financial command outcomes', () => {
  it('blocks same-render double submits and snapshots mutable input before sending', async () => {
    let finish!: () => void;
    const attempts: Array<{ amount: number; key: string }> = [];
    const run = vi.fn(async (args: { amount: number }, key: string) => {
      attempts.push({ amount: args.amount, key });
      await new Promise<void>((resolve) => {
        finish = resolve;
      });
      return {};
    });
    const { result } = renderHook(() => useFinancialAction({ scopeKey: 'staff:a', run }), {
      wrapper,
    });
    let first!: Promise<boolean>;
    const args = { amount: 300 };
    await act(async () => {
      first = result.current.submit(args);
      args.amount = 500;
      expect(await result.current.submit(args)).toBe(false);
    });
    expect(attempts).toHaveLength(1);
    expect(attempts[0].amount).toBe(300);
    await act(async () => {
      finish();
      await first;
    });
    expect(result.current.pending).toBe(false);
  });

  it('retains the exact key, version and payload through an ambiguous result and form edits', async () => {
    const attempts: Array<{ reference: string; version: number; key: string }> = [];
    const refresh = vi.fn();
    const { result, rerender } = renderHook(
      ({ reference }) =>
        useFinancialAction({
          scopeKey: 'owner:a:branch:b',
          allowUnconfirmedRetry: true,
          refresh,
          run: async (args: { version: number }, key: string) => {
            attempts.push({ reference, version: args.version, key });
            if (attempts.length === 1) throw { kind: 'timeout', message: 'Unconfirmed' };
            return {};
          },
        }),
      { wrapper, initialProps: { reference: 'BANK-ORIGINAL' } },
    );
    await act(async () => {
      await result.current.submit({ version: 3 });
    });
    expect(refresh).toHaveBeenCalledOnce();
    rerender({ reference: 'BANK-EDITED' });
    await act(async () => {
      result.current.reset();
      expect(await result.current.submit({ version: 4 })).toBe(false);
      await result.current.retryUnconfirmed();
    });
    expect(attempts).toHaveLength(2);
    expect(attempts[1]).toEqual(attempts[0]);
    expect(result.current.unconfirmed).toBe(false);
  });

  it('refreshes on conflict and preserves the error for deliberate review', async () => {
    const refresh = vi.fn();
    const onSuccess = vi.fn();
    const { result } = renderHook(
      () =>
        useFinancialAction({
          scopeKey: 'finance',
          refresh,
          onSuccess,
          run: async () => {
            throw { kind: 'conflict', message: 'Already changed', status: 409 };
          },
        }),
      { wrapper },
    );
    await act(async () => {
      expect(await result.current.submit()).toBe(false);
    });
    expect(refresh).toHaveBeenCalledOnce();
    expect(onSuccess).not.toHaveBeenCalled();
    expect(result.current.error?.kind).toBe('conflict');
  });

  it('suppresses late success after branch or identity scope changes', async () => {
    let finish!: () => void;
    const onSuccess = vi.fn();
    const run = async () =>
      new Promise<void>((resolve) => {
        finish = resolve;
      });
    const { result, rerender } = renderHook(
      ({ scopeKey }) =>
        useFinancialAction({
          scopeKey,
          run,
          onSuccess,
          successMessage: 'Paid',
        }),
      { wrapper, initialProps: { scopeKey: 'owner:a:branch:1' } },
    );
    let pending!: Promise<boolean>;
    await act(async () => {
      pending = result.current.submit();
    });
    rerender({ scopeKey: 'owner:a:branch:2' });
    await act(async () => {
      finish();
      expect(await pending).toBe(false);
    });
    expect(onSuccess).not.toHaveBeenCalled();
    expect(result.current.pending).toBe(false);
  });

  it('does not let an old request clear a newer command after returning to the same scope', async () => {
    const finish: Array<() => void> = [];
    const onSuccess = vi.fn();
    const { result, rerender } = renderHook(
      ({ scopeKey }) =>
        useFinancialAction({
          scopeKey,
          onSuccess,
          run: async (args: { reference: string }) => {
            await new Promise<void>((resolve) => {
              finish.push(resolve);
            });
            return args.reference;
          },
        }),
      { wrapper, initialProps: { scopeKey: 'town-a' } },
    );
    let oldA!: Promise<boolean>;
    let otherB!: Promise<boolean>;
    let newA!: Promise<boolean>;
    const oldControls = result.current;
    await act(async () => {
      oldA = result.current.submit({ reference: 'old-a' });
    });
    rerender({ scopeKey: 'town-b' });
    await act(async () => {
      otherB = result.current.submit({ reference: 'other-b' });
    });
    rerender({ scopeKey: 'town-a' });
    expect(result.current.pending).toBe(false);
    await act(async () => {
      newA = result.current.submit({ reference: 'new-a' });
    });
    await act(async () => {
      finish[0]();
      finish[1]();
      expect(await oldA).toBe(false);
      expect(await otherB).toBe(false);
    });
    expect(onSuccess).not.toHaveBeenCalled();
    expect(result.current.pending).toBe(true);
    await act(async () => {
      oldControls.reset();
      expect(await oldControls.submit({ reference: 'stale-callback' })).toBe(false);
      expect(await result.current.submit({ reference: 'duplicate' })).toBe(false);
      finish[2]();
      expect(await newA).toBe(true);
    });
    expect(onSuccess).toHaveBeenCalledExactlyOnceWith('new-a');
    expect(result.current.pending).toBe(false);
  });
});
