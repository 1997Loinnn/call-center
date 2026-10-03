import { useCallback, useEffect, useState, type DependencyList } from 'react';
import { errorMessage } from '../api/client';

/** Ma'lumot yuklash: { data, loading, error, reload }. deps o'zgarsa qayta yuklaydi. */
export function useAsync<T>(load: () => Promise<T>, deps: DependencyList) {
  const [data, setData] = useState<T>();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string>();

  // eslint-disable-next-line react-hooks/exhaustive-deps
  const reload = useCallback(load, deps);

  const run = useCallback(async () => {
    setLoading(true);
    setError(undefined);
    try {
      setData(await reload());
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setLoading(false);
    }
  }, [reload]);

  useEffect(() => {
    void run();
  }, [run]);

  return { data, loading, error, reload: run, setData };
}
