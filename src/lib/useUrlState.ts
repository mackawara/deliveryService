import { useCallback } from 'react';
import { useSearchParams } from 'react-router-dom';

/**
 * Filters, page offset and the selected town live in URL query parameters so a link can
 * be reloaded and shared. Personal phone numbers, tokens and sensitive search terms
 * stay in page state (specification section 3).
 */
export function useQueryParam(key: string): [string | null, (value: string | null) => void] {
  const [searchParams, setSearchParams] = useSearchParams();

  const setValue = useCallback(
    (value: string | null) => {
      setSearchParams(
        (current) => {
          const next = new URLSearchParams(current);
          if (value === null || value === '') next.delete(key);
          else next.set(key, value);
          return next;
        },
        { replace: true },
      );
    },
    [key, setSearchParams],
  );

  return [searchParams.get(key), setValue];
}

export function useNumberQueryParam(key: string, fallback = 0): [number, (value: number) => void] {
  const [raw, setRaw] = useQueryParam(key);
  const parsed = raw === null ? fallback : Number.parseInt(raw, 10);
  const value = Number.isFinite(parsed) && parsed >= 0 ? parsed : fallback;
  const setValue = useCallback(
    (next: number) => setRaw(next === fallback ? null : String(next)),
    [fallback, setRaw],
  );
  return [value, setValue];
}

/** Clears every filter parameter in one step, keeping unrelated parameters intact. */
export function useResetQueryParams(keys: string[]): () => void {
  const [, setSearchParams] = useSearchParams();
  // Call sites pass a literal array, so a joined string keeps the callback stable.
  const keyList = keys.join(',');
  return useCallback(() => {
    setSearchParams(
      (current) => {
        const next = new URLSearchParams(current);
        for (const key of keyList.split(',')) next.delete(key);
        return next;
      },
      { replace: true },
    );
  }, [setSearchParams, keyList]);
}
