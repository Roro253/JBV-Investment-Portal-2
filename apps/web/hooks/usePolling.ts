"use client";

import { useCallback, useEffect, useRef, useState } from "react";

export type RefreshStatus = "idle" | "refreshing" | "error";

export function usePolling<T = unknown>(
  url: string,
  options?: { interval?: number; fetcher?: () => Promise<T> }
) {
  const interval = options?.interval ?? 15000;
  const fetcher = options?.fetcher;
  const [data, setData] = useState<T | null>(null);
  const [status, setStatus] = useState<RefreshStatus>("idle");
  const [error, setError] = useState<Error | null>(null);
  const [initialized, setInitialized] = useState(false);
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);
  const abortControllerRef = useRef<AbortController | null>(null);
  const mountedRef = useRef(false);

  const performFetch = useCallback(async () => {
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
    }
    const controller = new AbortController();
    abortControllerRef.current = controller;
    setStatus("refreshing");
    setError(null);
    try {
      let result: T;
      if (fetcher) {
        result = await fetcher();
      } else {
        const response = await fetch(url, {
          cache: "no-store",
          credentials: "same-origin",
          signal: controller.signal,
        });
        if (!response.ok) {
          throw new Error(`Request failed with status ${response.status}`);
        }
        result = (await response.json()) as T;
      }
      if (!mountedRef.current) return;
      setData(result);
      setStatus("idle");
      setError(null);
      setLastUpdated(new Date());
    } catch (err: any) {
      if (controller.signal.aborted) {
        return;
      }
      if (!mountedRef.current) return;
      setStatus("error");
      setError(err instanceof Error ? err : new Error("Failed to fetch"));
    } finally {
      if (mountedRef.current) {
        setInitialized(true);
      }
    }
  }, [fetcher, url]);

  useEffect(() => {
    mountedRef.current = true;
    performFetch();

    const id = window.setInterval(() => {
      performFetch();
    }, interval);

    const handleFocus = () => {
      performFetch();
    };

    window.addEventListener("focus", handleFocus);

    return () => {
      mountedRef.current = false;
      window.removeEventListener("focus", handleFocus);
      window.clearInterval(id);
      if (abortControllerRef.current) {
        abortControllerRef.current.abort();
      }
    };
  }, [interval, performFetch]);

  return {
    data,
    status,
    error,
    initialized,
    lastUpdated,
    refresh: performFetch,
  };
}
