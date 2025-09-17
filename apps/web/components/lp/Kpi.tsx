import type { ReactNode } from "react";

interface KpiProps {
  label: ReactNode;
  value: ReactNode;
  description?: string;
  hint?: string;
}

export function Kpi({ label, value, description, hint }: KpiProps) {
  return (
    <div className="rounded-2xl bg-white p-6 shadow-sm ring-1 ring-slate-200">
      <div className="flex items-center gap-2 text-sm font-medium text-slate-500">
        <span>{label}</span>
        {hint ? (
          <span className="inline-flex items-center rounded-full bg-slate-100 px-2 py-0.5 text-[11px] text-slate-500" title={hint}>
            {hint}
          </span>
        ) : null}
      </div>
      <div className="mt-2 text-2xl font-semibold text-slate-900">{value}</div>
      {description ? <p className="mt-1 text-xs text-slate-400">{description}</p> : null}
    </div>
  );
}
