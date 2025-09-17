"use client";

import { useCallback } from "react";
import { normalizeFieldKey } from "@/lib/airtable-shared";
import { formatCurrencyUSD, formatDate, formatNumber, formatPercent } from "@/lib/format";
import { usePolling, type RefreshStatus } from "@/hooks/usePolling";
import { toCsv, type SummaryResponse } from "@/lib/csv";

type LinkedValue = { id: string; displayName?: string };

type AttachmentValue = { url?: string; name?: string; filename?: string; type?: string };

function buildStatusBadge(status: RefreshStatus, lastUpdated: Date | null) {
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

function parseNumber(value: any): number | null {
  if (value === null || value === undefined) return null;
  if (typeof value === "number") return Number.isFinite(value) ? value : null;
  if (typeof value === "string") {
    const cleaned = value.replace(/[^0-9.-]+/g, "");
    if (!cleaned) return null;
    const parsed = Number(cleaned);
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
}

function formatPrimitiveValue(fieldName: string, value: any): string {
  if (value === null || value === undefined) return "—";
  if (typeof value === "boolean") return value ? "Yes" : "No";

  const normalized = normalizeFieldKey(fieldName);

  if (typeof value === "number") {
    if (/commitment|capital|nav|distribution|gain|loss|cost|value|amount/.test(normalized)) {
      return formatCurrencyUSD(value);
    }
    if (/percent|irr/.test(normalized)) {
      return formatPercent(value, 2);
    }
    if (/moic|multiple/.test(normalized)) {
      return `${formatNumber(value, 2)}x`;
    }
    return formatNumber(value, 2);
  }

  if (typeof value === "string") {
    const parsedDate = new Date(value);
    if (!Number.isNaN(parsedDate.getTime()) && /date|period|as of|paid/.test(normalized)) {
      return formatDate(parsedDate.toISOString());
    }
    if (/commitment|capital|nav|distribution|gain|loss|cost|value|amount/.test(normalized)) {
      const parsed = parseNumber(value);
      if (parsed !== null) {
        return formatCurrencyUSD(parsed);
      }
    }
    if (/percent|irr/.test(normalized)) {
      const parsed = parseNumber(value);
      if (parsed !== null) {
        return formatPercent(parsed, 2);
      }
    }
    if (/moic|multiple/.test(normalized)) {
      const parsed = parseNumber(value);
      if (parsed !== null) {
        return `${formatNumber(parsed, 2)}x`;
      }
    }
    return value || "—";
  }

  return String(value);
}

function isLinkedValues(value: any): value is LinkedValue[] {
  return (
    Array.isArray(value) &&
    value.length > 0 &&
    value.every((item) => item && typeof item === "object" && "displayName" in item)
  );
}

function isAttachmentValues(value: any): value is AttachmentValue[] {
  return (
    Array.isArray(value) &&
    value.length > 0 &&
    value.every((item) => item && typeof item === "object" && typeof item.url === "string")
  );
}

export default function InvestmentSummaryPage() {
  const { data, status, error, initialized, lastUpdated } = usePolling<SummaryResponse>(
    "/api/lp/summary"
  );

  const fieldOrder = data?.fieldOrder ?? [];
  const records = data?.records ?? [];

  const handleExport = useCallback(() => {
    if (!data || !data.records.length || !data.fieldOrder.length) return;
    const blob = toCsv(data);
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = `jbv-investment-summary-${new Date().toISOString().slice(0, 10)}.csv`;
    document.body.appendChild(anchor);
    anchor.click();
    document.body.removeChild(anchor);
    URL.revokeObjectURL(url);
  }, [data]);

  const hasData = fieldOrder.length > 0 && records.length > 0;

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h2 className="text-2xl font-semibold text-slate-900">Investment Summary</h2>
          <p className="text-sm text-slate-500">
            Transactional-level insights and current metrics pulled directly from Airtable.
          </p>
        </div>
        {buildStatusBadge(status, lastUpdated)}
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <button
          type="button"
          onClick={handleExport}
          className="inline-flex items-center rounded-lg bg-blue-600 px-4 py-2 text-sm font-semibold text-white shadow-sm transition hover:bg-blue-700 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-600 disabled:cursor-not-allowed disabled:bg-blue-200"
          disabled={!hasData}
        >
          Export CSV
        </button>
      </div>

      {status === "error" && error ? (
        <div className="rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-600">
          We were unable to refresh your investment summary. Please retry in a moment.
        </div>
      ) : null}

      {!initialized ? (
        <div className="h-64 animate-pulse rounded-2xl bg-gradient-to-br from-slate-200/80 to-slate-100" />
      ) : records.length === 0 && status !== "error" ? (
        <div className="rounded-2xl border border-dashed border-slate-200 p-10 text-center text-sm text-slate-500">
          No data available for your investments. If this seems incorrect, please contact support.
        </div>
      ) : hasData ? (
        <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
          <div className="max-h-[70vh] overflow-auto">
            <table className="min-w-full text-sm">
              <thead className="sticky top-0 z-10 bg-slate-100/90 backdrop-blur">
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
              <tbody>
                {records.map((record) => (
                  <tr key={record.id} className="odd:bg-white even:bg-slate-50/70">
                    {fieldOrder.map((field) => {
                      const value = Object.prototype.hasOwnProperty.call(record.fields, field)
                        ? record.fields[field]
                        : undefined;
                      if (isLinkedValues(value)) {
                        return (
                          <td key={field} className="min-w-[12rem] px-4 py-3 align-top text-sm text-slate-700">
                            <div className="flex flex-wrap gap-2">
                              {value.map((item) => (
                                <span
                                  key={`${record.id}-${field}-${item.id || item.displayName}`}
                                  className="inline-flex items-center rounded-full bg-slate-100 px-2 py-0.5 text-xs text-slate-600"
                                >
                                  {item.displayName || item.id}
                                </span>
                              ))}
                            </div>
                          </td>
                        );
                      }
                      if (isAttachmentValues(value)) {
                        return (
                          <td key={field} className="min-w-[14rem] px-4 py-3 align-top text-sm text-slate-700">
                            <div className="flex flex-wrap gap-2">
                              {value.map((attachment, index) => {
                                const downloadUrl = `/api/lp/documents/download?recordId=${encodeURIComponent(
                                  record.id
                                )}&field=${encodeURIComponent(field)}&index=${index}`;
                                const label = attachment.name || attachment.filename || `File ${index + 1}`;
                                return (
                                  <a
                                    key={`${record.id}-${field}-attachment-${index}`}
                                    href={downloadUrl}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    className="inline-flex items-center rounded-md border border-blue-200 bg-white px-3 py-1 text-xs font-medium text-blue-700 transition hover:border-blue-400 hover:bg-blue-50"
                                  >
                                    {label}
                                  </a>
                                );
                              })}
                            </div>
                          </td>
                        );
                      }
                      if (Array.isArray(value)) {
                        const parts = value
                          .map((item) => formatPrimitiveValue(field, item))
                          .filter((item) => item && item !== "—");
                        const listDisplay = parts.length ? parts.join(", ") : "—";
                        return (
                          <td key={field} className="min-w-[10rem] px-4 py-3 align-top text-sm text-slate-700">
                            {listDisplay}
                          </td>
                        );
                      }
                      const display = formatPrimitiveValue(field, value);
                      return (
                        <td key={field} className="min-w-[10rem] px-4 py-3 align-top text-sm text-slate-700">
                          {display}
                        </td>
                      );
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      ) : null}
    </div>
  );
}
