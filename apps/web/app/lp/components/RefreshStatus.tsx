"use client";

import type { PollingStatus } from "@/hooks/usePollingResource";

const LABELS: Record<PollingStatus, string> = {
  idle: "Idle",
  refreshing: "Refreshing",
  error: "Error",
};

export function RefreshStatus({ status }: { status: PollingStatus }) {
  const color =
    status === "refreshing"
      ? "bg-blue-100 text-blue-700"
      : status === "error"
      ? "bg-red-100 text-red-700"
      : "bg-slate-100 text-slate-600";

  return (
    <span className={`inline-flex items-center gap-1 rounded-full px-3 py-1 text-xs font-medium ${color}`}>
      <span className="h-2 w-2 rounded-full bg-current" />
      Refresh: {LABELS[status]}
    </span>
  );
}
