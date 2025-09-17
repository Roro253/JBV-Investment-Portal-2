"use client";

import { createContext, useContext, type ReactNode } from "react";
import { usePolling, type RefreshStatus } from "@/hooks/usePolling";
import type { LpDataResponse } from "@/types/lp";

type LpDataContextValue = {
  data: LpDataResponse | null;
  status: RefreshStatus;
  error: Error | null;
  initialized: boolean;
  lastUpdated: Date | null;
  refresh: () => Promise<void>;
};

const LpDataContext = createContext<LpDataContextValue | undefined>(undefined);

export function LpDataProvider({ children }: { children: ReactNode }) {
  const polling = usePolling<LpDataResponse>("/api/lp/data");

  const value: LpDataContextValue = {
    data: polling.data,
    status: polling.status,
    error: polling.error,
    initialized: polling.initialized,
    lastUpdated: polling.lastUpdated,
    refresh: polling.refresh,
  };

  return <LpDataContext.Provider value={value}>{children}</LpDataContext.Provider>;
}

export function useLpData() {
  const ctx = useContext(LpDataContext);
  if (!ctx) {
    throw new Error("useLpData must be used within LpDataProvider");
  }
  return ctx;
}
