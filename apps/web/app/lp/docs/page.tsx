"use client";

import { useMemo } from "react";
import { usePolling, type RefreshStatus } from "@/hooks/usePolling";
import { formatDate } from "@/lib/format";

interface DocumentItem {
  name: string;
  url: string;
  size?: number;
  type?: string;
  investmentId: string;
  investmentName?: string;
  periodEnding?: any;
}

interface DocumentsResponse {
  documents: DocumentItem[];
}

function buildStatusBadge(status: RefreshStatus, lastUpdated: Date | null) {
  const label =
    status === "refreshing"
      ? "Refreshing"
      : status === "error"
      ? "Error"
      : "Idle";
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

function formatPeriod(value: any) {
  if (!value) return "—";
  const date = new Date(value);
  if (!Number.isNaN(date.getTime())) return formatDate(date.toISOString());
  return typeof value === "string" ? value : String(value);
}

export default function DocumentsPage() {
  const { data, status, error, initialized, lastUpdated } = usePolling<DocumentsResponse>("/api/lp/documents");

  const grouped = useMemo(() => {
    const sections = new Map<string, { name: string; documents: DocumentItem[] }>();
    (data?.documents || []).forEach((doc) => {
      const key = doc.investmentId || doc.investmentName || "unassigned";
      if (!sections.has(key)) {
        sections.set(key, { name: doc.investmentName || "Unassigned Investment", documents: [] });
      }
      sections.get(key)!.documents.push(doc);
    });
    return Array.from(sections.values()).map((section) => ({
      ...section,
      documents: section.documents.slice().sort((a, b) => {
        const aDate = a.periodEnding ? new Date(a.periodEnding).getTime() : 0;
        const bDate = b.periodEnding ? new Date(b.periodEnding).getTime() : 0;
        return bDate - aDate;
      }),
    }));
  }, [data]);

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h2 className="text-2xl font-semibold text-slate-900">Document Center</h2>
          <p className="text-sm text-slate-500">Secure access to statements, capital calls, and investor communications.</p>
        </div>
        {buildStatusBadge(status, lastUpdated)}
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
            <div key={section.name} className="space-y-4 rounded-2xl bg-white p-6 shadow-sm ring-1 ring-slate-200">
              <div>
                <h3 className="text-lg font-semibold text-slate-900">{section.name}</h3>
                <p className="text-sm text-slate-500">Latest files and partner communications.</p>
              </div>
              <div className="space-y-3">
                {section.documents.map((doc) => (
                  <a
                    key={`${doc.url}-${doc.name}`}
                    href={doc.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex items-center justify-between rounded-xl border border-slate-200 px-4 py-3 text-sm text-blue-700 transition hover:border-blue-400 hover:bg-blue-50"
                  >
                    <div>
                      <p className="font-medium text-slate-900">{doc.name}</p>
                      <p className="text-xs text-slate-500">
                        {doc.periodEnding ? `Period Ending: ${formatPeriod(doc.periodEnding)}` : "Document"}
                        {doc.size ? ` · ${(doc.size / (1024 * 1024)).toFixed(2)} MB` : ""}
                      </p>
                    </div>
                    <span className="text-xs font-semibold uppercase tracking-wide text-blue-600">Download</span>
                  </a>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
