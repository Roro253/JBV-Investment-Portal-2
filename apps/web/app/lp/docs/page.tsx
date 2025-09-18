"use client";

import { useMemo } from "react";
import { usePolling, type RefreshStatus } from "@/hooks/usePolling";
import { formatDate } from "@/lib/format";

interface DocumentItem {
  name: string;
  size?: number;
  type?: string;
  investmentId: string;
  investmentName?: string;
  periodEnding?: any;
  field: string;
  index: number;
}

interface DocumentsResponse {
  documents: DocumentItem[];
  note?: string;
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

function buildPeriodKey(value: any) {
  if (value === null || value === undefined) return "_none";
  try {
    return JSON.stringify(value);
  } catch {
    return String(value);
  }
}

function getPeriodSortValue(value: any) {
  if (!value) return Number.NEGATIVE_INFINITY;
  const date = new Date(value);
  if (!Number.isNaN(date.getTime())) return date.getTime();
  return Number.NEGATIVE_INFINITY;
}

export default function DocumentsPage() {
  const { data, status, error, initialized, lastUpdated } = usePolling<DocumentsResponse>("/api/lp/documents", {
    interval: 120000,
  });
  const note = data?.note;
  const noteMessage = useMemo(() => {
    if (note === "contact-not-found") {
      return "We couldn’t locate a matching Contact record for your login email. Please reach out to the investor relations team to confirm your access.";
    }
    if (note === "view-filtered") {
      return "Your Airtable view is currently filtering the investment rows tied to your documents. Adjust the view or contact an administrator if this is unexpected.";
    }
    return null;
  }, [note]);

  const grouped = useMemo(() => {
    const sections = new Map<
      string,
      {
        id: string;
        name: string;
        periods: Map<string, { periodEnding: any; documents: DocumentItem[] }>;
      }
    >();
    (data?.documents || []).forEach((doc) => {
      const key = doc.investmentId || doc.investmentName || "unassigned";
      if (!sections.has(key)) {
        sections.set(key, {
          id: key,
          name: doc.investmentName || "Unassigned Investment",
          periods: new Map(),
        });
      }
      const section = sections.get(key)!;
      const periodKey = buildPeriodKey(doc.periodEnding);
      if (!section.periods.has(periodKey)) {
        section.periods.set(periodKey, { periodEnding: doc.periodEnding, documents: [] });
      }
      section.periods.get(periodKey)!.documents.push(doc);
    });
    return Array.from(sections.values()).map((section) => ({
      id: section.id,
      name: section.name,
      periods: Array.from(section.periods.values())
        .map((period) => ({
          periodEnding: period.periodEnding,
          documents: period.documents.slice(),
        }))
        .sort((a, b) => getPeriodSortValue(b.periodEnding) - getPeriodSortValue(a.periodEnding)),
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

      {initialized && noteMessage && status !== "error" ? (
        <div className="rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-700">
          {noteMessage}
        </div>
      ) : null}

      {!initialized ? (
        <div className="h-64 animate-pulse rounded-2xl bg-gradient-to-br from-slate-200/80 to-slate-100" />
      ) : !grouped.length && status !== "error" ? (
        <div className="rounded-2xl border border-dashed border-slate-200 p-10 text-center text-sm text-slate-500">
          Documents shared with your investments will surface here automatically.
        </div>
      ) : (
        <div className="space-y-6">
          {grouped.map((section) => (
            <div key={section.id} className="space-y-6 rounded-2xl bg-white p-6 shadow-sm ring-1 ring-slate-200">
              <div>
                <h3 className="text-lg font-semibold text-slate-900">{section.name}</h3>
                <p className="text-sm text-slate-500">Latest files and partner communications.</p>
              </div>
              <div className="space-y-4">
                {section.periods.map((period) => {
                  const label = formatPeriod(period.periodEnding);
                  const heading = period.periodEnding ? `Period Ending: ${label}` : "General";
                  return (
                    <div key={`${section.id}-${buildPeriodKey(period.periodEnding)}`} className="space-y-3">
                      <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                        {heading}
                      </p>
                      <div className="space-y-3">
                        {period.documents.map((doc) => {
                          const downloadUrl = `/api/lp/documents/download?recordId=${encodeURIComponent(
                            doc.investmentId
                          )}&field=${encodeURIComponent(doc.field)}&index=${doc.index}`;
                          const docKey = `${doc.investmentId}-${doc.field}-${doc.index}`;
                          const sizeLabel = doc.size ? `${(doc.size / (1024 * 1024)).toFixed(2)} MB` : null;
                          return (
                            <a
                              key={docKey}
                              href={downloadUrl}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="flex items-center justify-between rounded-xl border border-slate-200 px-4 py-3 text-sm text-blue-700 transition hover:border-blue-400 hover:bg-blue-50"
                            >
                              <div>
                                <p className="font-medium text-slate-900">{doc.name}</p>
                                <p className="text-xs text-slate-500">{sizeLabel ? `Size: ${sizeLabel}` : "Secure proxy download"}</p>
                              </div>
                              <span className="text-xs font-semibold uppercase tracking-wide text-blue-600">Download</span>
                            </a>
                          );
                        })}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
