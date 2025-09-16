"use client";

import { useCallback, useEffect, useRef, useState } from "react";

export type PollingStatus = "idle" | "refreshing" | "error";

interface Options {
  intervalMs?: number;
}

export function usePollingResource<T>(url: string, options: Options = {}) {
  const { intervalMs = 15000 } = options;
  const [data, setData] = useState<T | null>(null);
  const [status, setStatus] = useState<PollingStatus>("refreshing");
  const [error, setError] = useState<Error | null>(null);
  const [hasLoaded, setHasLoaded] = useState(false);
  const fetchingRef = useRef(false);

  const refresh = useCallback(async () => {
    if (fetchingRef.current) return;
    fetchingRef.current = true;
    setStatus("refreshing");
    try {
      const response = await fetch(url, { cache: "no-store" });
      if (!response.ok) {
        throw new Error(`Request failed with status ${response.status}`);
      }
      const json = (await response.json()) as T;
      setData(json);
      setError(null);
      setHasLoaded(true);
      setStatus("idle");
    } catch (err) {
      setError(err as Error);
      setStatus("error");
    } finally {
      fetchingRef.current = false;
    }
  }, [url]);

  useEffect(() => {
    refresh();
    const id = window.setInterval(() => {
      refresh();
    }, intervalMs);
    return () => {
      window.clearInterval(id);
    };
  }, [intervalMs, refresh]);

  useEffect(() => {
    const handler = () => {
      refresh();
    };
    window.addEventListener("focus", handler);
    return () => {
      window.removeEventListener("focus", handler);
    };
  }, [refresh]);

  return { data, status, error, refresh, hasLoaded } as const;
}
