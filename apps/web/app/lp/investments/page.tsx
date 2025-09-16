"use client";

import { useMemo, useState } from "react";
import type { ExpandedRecord } from "@/lib/airtable";
import { formatCurrencyUSD, formatDate, formatNumber, formatPercent } from "@/lib/format";
import { normalizeFieldKey } from "@/lib/airtable";
import { usePolling, type RefreshStatus } from "@/hooks/usePolling";

interface Metrics {
  commitmentTotal: number;
  navTotal: number;
  distributionsTotal: number;
  netMoicAvg: number;
}

interface LpDataResponse {
  records: ExpandedRecord[];
  metrics: Metrics;
}

function parseNumber(value: any) {
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

function valueToString(value: any) {
  if (value === null || value === undefined) return "";
  if (Array.isArray(value)) {
    return value
      .map((item) => {
        if (item && typeof item === "object") {
          if ("displayName" in item) return String(item.displayName ?? "");
          if ("name" in item) return String(item.name ?? "");
        }
        return String(item ?? "");
      })
      .filter(Boolean)
      .join(", ");
  }
  if (typeof value === "object") {
    if ("url" in value) return value.name || value.filename || value.url;
    return JSON.stringify(value);
  }
  return String(value);
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

function formatValue(key: string, value: any) {
  if (value === null || value === undefined) return "—";
  if (Array.isArray(value)) {
    if (!value.length) return "—";
    if (value[0] && typeof value[0] === "object") {
      if ("displayName" in value[0]) {
        return value.map((item: any) => item.displayName || item.name || item.id).join(", ");
      }
      if ("url" in value[0]) {
        return value.map((item: any) => item.name || item.filename || "Attachment").join(", ");
      }
    }
    return value.join(", ");
  }
  if (typeof value === "boolean") {
    return value ? "Yes" : "No";
  }
  const normalized = normalizeFieldKey(key);
  if (typeof value === "number") {
    if (
      /commitment|capital|nav|distribution|cost|value|balance|amount/.test(normalized)
    ) {
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
    const asDate = new Date(value);
    if (!Number.isNaN(asDate.getTime()) && /date|period|as of/.test(normalized)) {
      return formatDate(value);
    }
    if (/commitment|capital|nav|distribution|cost|value|amount/.test(normalized)) {
      const parsed = parseNumber(value);
      return parsed !== null ? formatCurrencyUSD(parsed) : value;
    }
    if (/percent|irr/.test(normalized)) {
      const parsed = parseNumber(value);
      return parsed !== null ? formatPercent(parsed, 2) : value;
    }
    if (/moic|multiple/.test(normalized)) {
      const parsed = parseNumber(value);
      return parsed !== null ? `${formatNumber(parsed, 2)}x` : value;
    }
    if (/date|period|as of/.test(normalized)) {
      return formatDate(value);
    }
    return value;
  }
  return String(value);
}

export default function LPInvestmentsPage() {
  const { data, status, error, initialized, lastUpdated } = usePolling<LpDataResponse>("/api/lp/data");
  const [search, setSearch] = useState("");

  const records = useMemo(() => data?.records ?? [], [data?.records]);

  const columnKeys = useMemo(() => {
    if (!records.length) return [] as string[];
    const ordered = new Set<string>();
    const first = records[0].fields || {};
    Object.keys(first).forEach((key) => ordered.add(key));
    for (const record of records.slice(1)) {
      const fields = record.fields || {};
      for (const key of Object.keys(fields)) {
        if (!ordered.has(key)) ordered.add(key);
      }
    }
    return Array.from(ordered);
  }, [records]);

  const searchableKeys = useMemo(() => {
    return columnKeys.filter((key) => {
      const normalized = normalizeFieldKey(key);
      return /investment|fund|status/.test(normalized);
    });
  }, [columnKeys]);

  const filteredRecords = useMemo(() => {
    if (!search.trim()) return records;
    const term = search.trim().toLowerCase();
    return records.filter((record) => {
      const fields = record.fields || {};
      for (const key of searchableKeys) {
        if (!Object.prototype.hasOwnProperty.call(fields, key)) continue;
        const value = fields[key];
        const candidate = valueToString(value).toLowerCase();
        if (candidate.includes(term)) {
          return true;
        }
      }
      return false;
    });
  }, [records, search, searchableKeys]);

  const handleExport = () => {
    if (!columnKeys.length || !filteredRecords.length) return;
    const header = columnKeys.map((key) => `"${key.replace(/"/g, '""')}"`).join(",");
    const rows = filteredRecords.map((record) => {
      const fields = record.fields || {};
      return columnKeys
        .map((key) => {
          const value = Object.prototype.hasOwnProperty.call(fields, key) ? fields[key] : "";
          const str = valueToString(value);
          return `"${str.replace(/"/g, '""')}"`;
        })
        .join(",");
    });
    const csv = [header, ...rows].join("\n");
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `jbv-investments-${Date.now()}.csv`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h2 className="text-2xl font-semibold text-slate-900">Holdings Detail</h2>
          <p className="text-sm text-slate-500">
            Every field you are permitted to view, with instant filtering and export capabilities.
          </p>
        </div>
        {buildStatusBadge(status, lastUpdated)}
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <input
          value={search}
          onChange={(event) => setSearch(event.target.value)}
          placeholder="Search by investment, fund, or status"
          className="w-full max-w-sm rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm focus:border-blue-600 focus:outline-none focus:ring-2 focus:ring-blue-100"
        />
        <button
          type="button"
          onClick={handleExport}
          className="inline-flex items-center rounded-lg bg-blue-600 px-4 py-2 text-sm font-semibold text-white shadow-sm transition hover:bg-blue-700 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-600"
          disabled={!filteredRecords.length}
        >
          Export CSV
        </button>
      </div>

      {status === "error" && error ? (
        <div className="rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-600">
          We could not refresh the investments table. Please retry in a moment.
        </div>
      ) : null}

      {!initialized ? (
        <div className="h-64 animate-pulse rounded-2xl bg-gradient-to-br from-slate-200/80 to-slate-100" />
      ) : filteredRecords.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-slate-200 p-10 text-center text-sm text-slate-500">
          No investments match your current filters.
        </div>
      ) : (
        <div className="overflow-x-auto">
          <table className="min-w-full divide-y divide-slate-200">
            <thead className="bg-slate-100/80">
              <tr>
                {columnKeys.map((key) => (
                  <th
                    key={key}
                    scope="col"
                    className="whitespace-nowrap px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-slate-600"
                  >
                    {key}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 bg-white">
              {filteredRecords.map((record) => {
                const fields = record.fields || {};
                return (
                  <tr key={record.id} className="hover:bg-blue-50/40">
                    {columnKeys.map((key) => {
                      const value = Object.prototype.hasOwnProperty.call(fields, key) ? fields[key] : undefined;
                      const display = formatValue(key, value);
                      const normalized = normalizeFieldKey(key);
                      const isLinked = Array.isArray(value) && value.length && value[0] && typeof value[0] === "object" && "displayName" in value[0];
                      return (
                        <td key={key} className="whitespace-nowrap px-4 py-3 text-sm text-slate-700">
                          {isLinked ? (
                            <div className="flex flex-wrap gap-2">
                              {(value as any[]).map((item: any) => (
                                <span
                                  key={item.id || item.displayName || item.name}
                                  className="inline-flex items-center rounded-full bg-slate-100 px-2 py-0.5 text-xs text-slate-600"
                                >
                                  {item.displayName || item.name || item.id}
                                </span>
                              ))}
                            </div>
                          ) : /date|period|as of/.test(normalized) && typeof value === "string" ? (
                            <span>{formatDate(value)}</span>
                          ) : (
                            <span>{display}</span>
                          )}
                        </td>
                      );
                    })}
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
