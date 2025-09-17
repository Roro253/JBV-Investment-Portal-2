"use client";

import { useMemo } from "react";

import { normalizeFieldKey } from "@/lib/airtable-shared";
import { toCsv } from "@/lib/csv";
import { formatCurrencyUSD, formatDate, formatNumber, formatPercent } from "@/lib/format";
import { usePolling, type RefreshStatus } from "@/hooks/usePolling";

type SummaryRecord = {
  id: string;
  fields: Record<string, any>;
  _updatedTime: string | null;
};

type SummaryResponse = {
  fieldOrder: string[];
  records: SummaryRecord[];
};

function buildStatusBadge(status: RefreshStatus, lastUpdated: Date | null) {
  const label = status === "refreshing" ? "Refreshing" : status === "error" ? "Error" : "Idle";
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

function parseNumberValue(value: any): number | null {
  if (typeof value === "number") {
    return Number.isFinite(value) ? value : null;
  }
  if (typeof value === "string") {
    const cleaned = value.replace(/[^0-9.-]+/g, "");
    if (!cleaned) return null;
    const parsed = Number(cleaned);
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
}

function isCurrencyField(normalized: string) {
  return /commitment|capital|nav|distribution|gain|loss|cost|contributed|value|amount|fmv|paid/.test(normalized);
}

function isPercentField(normalized: string) {
  return /percent|irr|yield|rate/.test(normalized);
}

function isMoicField(normalized: string) {
  return /moic|multiple/.test(normalized);
}

function isDateField(normalized: string) {
  return /date|period|as of|paid/.test(normalized);
}

function formatPrimitiveValue(field: string, value: number | string) {
  const normalized = normalizeFieldKey(field);
  if (typeof value === "number") {
    if (isCurrencyField(normalized)) {
      return formatCurrencyUSD(value);
    }
    if (isPercentField(normalized)) {
      return formatPercent(value);
    }
    if (isMoicField(normalized)) {
      return `${formatNumber(value, 2)}x`;
    }
    return formatNumber(value, 2);
  }

  const trimmed = value.trim();
  if (!trimmed) return "—";

  if (isDateField(normalized)) {
    const formatted = formatDate(value);
    if (formatted !== "—") return formatted;
  }

  const parsed = parseNumberValue(value);
  if (parsed !== null) {
    if (isCurrencyField(normalized)) {
      return formatCurrencyUSD(parsed);
    }
    if (isPercentField(normalized)) {
      return formatPercent(parsed);
    }
    if (isMoicField(normalized)) {
      return `${formatNumber(parsed, 2)}x`;
    }
  }

  if (isPercentField(normalized) && /%$/.test(trimmed)) {
    return trimmed;
  }

  if (isMoicField(normalized) && /x$/i.test(trimmed)) {
    return trimmed;
  }

  return trimmed;
}

function renderAttachmentLinks(recordId: string, field: string, attachments: any[]) {
  const hasLinks = attachments.some((item) => item && typeof item === "object" && typeof item.url === "string");
  if (!hasLinks) {
    return <span className="text-slate-500">—</span>;
  }

  return (
    <div className="flex flex-wrap gap-2">
      {attachments.map((attachment, index) => {
        if (!attachment || typeof attachment !== "object" || typeof attachment.url !== "string") {
          return null;
        }
        const downloadUrl = `/api/lp/documents/download?recordId=${encodeURIComponent(
          recordId
        )}&field=${encodeURIComponent(field)}&index=${index}`;
        const label = attachment.name || attachment.filename || attachment.title || `Document ${index + 1}`;
        return (
          <a
            key={`${recordId}-${field}-${index}`}
            href={downloadUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center rounded-full border border-blue-200 px-3 py-1 text-xs font-semibold text-blue-600 transition hover:border-blue-400 hover:bg-blue-50"
          >
            {label}
          </a>
        );
      })}
    </div>
  );
}

function renderFieldValue(recordId: string, field: string, value: any) {
  if (value === null || value === undefined || value === "") {
    return <span className="text-slate-400">—</span>;
  }

  if (Array.isArray(value)) {
    if (!value.length) return <span className="text-slate-400">—</span>;
    const linked = value.filter((entry) => entry && typeof entry === "object" && "displayName" in entry);
    if (linked.length) {
      return (
        <div className="flex flex-wrap gap-2">
          {linked.map((entry: any, index: number) => {
            const key = entry.id || entry.displayName || entry.name || index;
            const label = entry.displayName || entry.name || entry.id || "—";
            return (
              <span
                key={key}
                className="inline-flex items-center rounded-full bg-slate-100 px-2 py-0.5 text-xs text-slate-600"
              >
                {label}
              </span>
            );
          })}
        </div>
      );
    }

    const attachments = value.filter((entry) => entry && typeof entry === "object" && typeof entry.url === "string");
    if (attachments.length) {
      return renderAttachmentLinks(recordId, field, attachments);
    }

    const parts = value
      .map((entry) => (entry !== null && entry !== undefined ? String(entry) : ""))
      .filter(Boolean);
    if (!parts.length) {
      return <span className="text-slate-400">—</span>;
    }
    return <span>{parts.join(", ")}</span>;
  }

  if (typeof value === "boolean") {
    return <span>{value ? "Yes" : "No"}</span>;
  }

  if (typeof value === "number" || typeof value === "string") {
    const formatted = formatPrimitiveValue(field, value as any);
    return <span>{formatted || "—"}</span>;
  }

  if (value && typeof value === "object" && typeof (value as any).url === "string") {
    return renderAttachmentLinks(recordId, field, [value]);
  }

  if (value && typeof value === "object") {
    try {
      return <span>{JSON.stringify(value)}</span>;
    } catch {
      return <span>{String(value)}</span>;
    }
  }

  return <span>{String(value)}</span>;
}

export default function InvestmentSummaryPage() {
  const { data, status, error, initialized, lastUpdated } = usePolling<SummaryResponse>("/api/lp/summary");

  const fieldOrder = useMemo(() => data?.fieldOrder ?? [], [data?.fieldOrder]);
  const records = useMemo(() => data?.records ?? [], [data?.records]);

  const handleExport = () => {
    if (!data || !data.records.length) {
      return;
    }
    const blob = toCsv({ fieldOrder: data.fieldOrder, records: data.records });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = `jbv-investment-summary-${new Date().toISOString().slice(0, 10)}.csv`;
    document.body.appendChild(anchor);
    anchor.click();
    document.body.removeChild(anchor);
    URL.revokeObjectURL(url);
  };

  const showEmptyState = initialized && status !== "error" && (!records.length || !fieldOrder.length);

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h2 className="text-2xl font-semibold text-slate-900">Investment Summary</h2>
          <p className="text-sm text-slate-500">
            Consolidated view of your commitments, valuations, and partner updates from Airtable.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          {buildStatusBadge(status, lastUpdated)}
          <button
            type="button"
            onClick={handleExport}
            className="inline-flex items-center rounded-lg bg-blue-600 px-4 py-2 text-sm font-semibold text-white shadow-sm transition hover:bg-blue-700 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-600 disabled:cursor-not-allowed disabled:bg-slate-300"
            disabled={!records.length || !fieldOrder.length}
          >
            Export CSV
          </button>
        </div>
      </div>

      {status === "error" && error ? (
        <div className="rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-600">
          We were unable to refresh your investment summary. Please try again shortly.
        </div>
      ) : null}

      {!initialized ? (
        <div className="h-64 animate-pulse rounded-2xl bg-gradient-to-br from-slate-200/80 to-slate-100" />
      ) : showEmptyState ? (
        <div className="rounded-2xl border border-dashed border-slate-200 p-10 text-center text-sm text-slate-500">
          No data available for your investments. If this seems incorrect, please contact support.
        </div>
      ) : (
        <div className="overflow-x-auto rounded-2xl bg-white shadow-sm ring-1 ring-slate-200">
          <table className="min-w-full divide-y divide-slate-200 text-sm">
            <thead className="bg-slate-100/80">
              <tr>
                {fieldOrder.map((field) => (
                  <th
                    key={field}
                    scope="col"
                    className="whitespace-nowrap px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-slate-600"
                  >
                    {field}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {records.map((record) => (
                <tr
                  key={record.id}
                  className="odd:bg-white even:bg-slate-50/60 hover:bg-blue-50/40"
                >
                  {fieldOrder.map((field) => {
                    const value = Object.prototype.hasOwnProperty.call(record.fields, field)
                      ? record.fields[field]
                      : undefined;
                    return (
                      <td key={field} className="whitespace-nowrap px-4 py-2 align-top text-slate-700">
                        {renderFieldValue(record.id, field, value)}
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
