import type { RefreshStatus } from "@/hooks/usePolling";

interface RefreshStatusIndicatorProps {
  status: RefreshStatus;
  lastUpdated: Date | null;
}

export function RefreshStatusIndicator({ status, lastUpdated }: RefreshStatusIndicatorProps) {
  const label =
    status === "refreshing" ? "Refreshing" : status === "error" ? "Error" : "Idle";
  const tone =
    status === "refreshing"
      ? "bg-blue-50 text-blue-600"
      : status === "error"
      ? "bg-red-50 text-red-600"
      : "bg-emerald-50 text-emerald-600";

  return (
    <span className={`inline-flex items-center gap-2 rounded-full px-3 py-1 text-xs font-semibold ${tone}`}>
      <span className="h-2 w-2 rounded-full bg-current opacity-70" aria-hidden="true" />
      Refresh: {label}
      {lastUpdated ? (
        <span className="text-[11px] font-normal opacity-70">
          {lastUpdated.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
        </span>
      ) : null}
    </span>
  );
}
