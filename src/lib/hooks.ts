import { useCallback, useEffect, useRef, useState } from 'react';
import { errorMessage } from './errors';

export function useLoad<T>(loader: () => Promise<T>, deps: ReadonlyArray<unknown>) {
  const [data, setData] = useState<T | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [tick, setTick] = useState(0);
  const seqRef = useRef(0);
  const loaderRef = useRef(loader);

  useEffect(() => {
    loaderRef.current = loader;
  });

  const reload = useCallback(() => {
    setTick((t) => t + 1);
  }, []);

  const depsKey = JSON.stringify(deps);

  useEffect(() => {
    let active = true;
    const seq = ++seqRef.current;

    void Promise.resolve()
      .then(() => {
        if (!active || seq !== seqRef.current) return undefined;
        setLoading(true);
        setError(null);
        return loaderRef.current();
      })
      .then((result) => {
        if (active && seq === seqRef.current && result !== undefined) {
          setData(result);
        }
      })
      .catch((err) => {
        if (active && seq === seqRef.current) {
          setError(errorMessage(err));
        }
      })
      .finally(() => {
        if (active && seq === seqRef.current) {
          setLoading(false);
        }
      });

    return () => {
      active = false;
    };
  }, [depsKey, tick]);

  return { data, loading, error, reload };
}

export function useAction<A extends unknown[], R>(action: (...args: A) => Promise<R>) {
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<{ tone: 'ok' | 'err'; text: string } | null>(null);

  const run = useCallback(
    async (...args: A): Promise<R | null> => {
      setBusy(true);
      setMessage(null);
      try {
        const out = await action(...args);
        return out;
      } catch (err) {
        setMessage({ tone: 'err', text: errorMessage(err) });
        return null;
      } finally {
        setBusy(false);
      }
    },
    [action],
  );

  return { run, busy, message, setMessage };
}

export function useNow(intervalMs = 30000): Date {
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const timer = window.setInterval(() => setNow(new Date()), intervalMs);
    return () => window.clearInterval(timer);
  }, [intervalMs]);
  return now;
}
