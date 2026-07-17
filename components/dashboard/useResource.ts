"use client";

import { useCallback, useEffect, useState } from "react";

export interface Resource<T> {
  data: T | null;
  loading: boolean;
  error: boolean;
  reload: () => void;
}

/**
 * Fetch a stats endpoint with per-panel loading/error state and a retry. Re-runs
 * whenever the URL changes (site or range) or reload() is called.
 */
export function useResource<T>(url: string): Resource<T> {
  const [data, setData] = useState<T | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [nonce, setNonce] = useState(0);

  const reload = useCallback(() => setNonce((n) => n + 1), []);

  useEffect(() => {
    let active = true;
    setLoading(true);
    setError(false);
    fetch(url, { cache: "no-store" })
      .then(async (res) => {
        if (!res.ok) throw new Error(`status ${res.status}`);
        return (await res.json()) as T;
      })
      .then((json) => {
        if (!active) return;
        setData(json);
        setLoading(false);
      })
      .catch(() => {
        if (!active) return;
        setError(true);
        setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [url, nonce]);

  return { data, loading, error, reload };
}
