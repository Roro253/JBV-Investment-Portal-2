"use client";

import { useMemo } from "react";

import { DocCard } from "@/components/lp/DocCard";
import { RefreshStatusIndicator } from "@/components/lp/RefreshStatusIndicator";
import { formatDate } from "@/lib/format";
import { usePolling } from "@/hooks/usePolling";

interface DocumentItem {
  name: string;
  downloadUrl: string;
  size?: number;
  type?: string;
  investmentId: string;
  investmentName?: string;
  periodEnding?: any;
}

interface DocumentsResponse {
  documents: DocumentItem[];
}

function formatPeriod(value: any) {
  if (!value) return "—";
  const date = new Date(value);
  if (!Number.isNaN(date.getTime())) return formatDate(date.toISOString());
  return typeof value === "string" ? value : String(value);
}

export default function DocumentsPage() {
  const { data, status, error, initialized, lastUpdated } = usePolling<DocumentsResponse>("/api/lp/documents");

  const grouped = useMemo(() => {
    const sections = new Map<string, { name: string; periods: Map<string, DocumentItem[]> }>();
    (data?.documents || []).forEach((doc) => {
      const name = doc.investmentName || "Unassigned Investment";
      const key = doc.investmentId || name;
      if (!sections.has(key)) {
        sections.set(key, { name, periods: new Map() });
      }
      const section = sections.get(key)!;
      const periodKey = doc.periodEnding ? formatPeriod(doc.periodEnding) : "General";
      if (!section.periods.has(periodKey)) {
        section.periods.set(periodKey, []);
      }
      section.periods.get(periodKey)!.push(doc);
    });
    return Array.from(sections.entries()).map(([investmentKey, { name, periods }]) => ({
      investmentKey,
      investmentName: name,
      periods: Array.from(periods.entries()).map(([period, docs]) => ({ period, docs })),
    }));
  }, [data]);

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h2 className="text-2xl font-semibold text-slate-900">Document Center</h2>
          <p className="text-sm text-slate-500">Secure access to statements, capital calls, and investor communications.</p>
        </div>
        <RefreshStatusIndicator status={status} lastUpdated={lastUpdated} />
      </div>

      {status === "error" && error ? (
        <div className="rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-600">
          We were unable to refresh your document library. Please retry in a moment.
        </div>
      ) : null}

      {!initialized ? (
        <div className="h-64 animate-pulse rounded-2xl bg-gradient-to-br from-slate-200/80 to-slate-100" />
      ) : !grouped.length ? (
        <div className="rounded-2xl border border-dashed border-slate-200 p-10 text-center text-sm text-slate-500">
          Documents shared with your investments will surface here automatically.
        </div>
      ) : (
        <div className="space-y-6">
          {grouped.map((section) => (
            <div key={section.investmentKey} className="space-y-4 rounded-2xl bg-white p-6 shadow-sm ring-1 ring-slate-200">
              <div>
                <h3 className="text-lg font-semibold text-slate-900">{section.investmentName}</h3>
                <p className="text-sm text-slate-500">Latest files and partner communications.</p>
              </div>
              <div className="space-y-5">
                {section.periods.map((periodGroup) => (
                  <div key={periodGroup.period} className="space-y-3">
                    <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">{periodGroup.period}</p>
                    <div className="space-y-3">
                      {periodGroup.docs
                        .slice()
                        .sort((a, b) => (a.name || "").localeCompare(b.name || ""))
                        .map((doc) => {
                          const sizeLabel = doc.size ? `${(doc.size / (1024 * 1024)).toFixed(2)} MB` : undefined;
                          return (
                            <DocCard key={`${doc.downloadUrl}-${doc.name}`} name={doc.name} href={doc.downloadUrl} meta={sizeLabel} />
                          );
                        })}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
