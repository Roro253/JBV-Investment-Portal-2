"use client";

import { useMemo, useState } from "react";

import { HoldingsTable } from "@/components/lp/HoldingsTable";
import { RefreshStatusIndicator } from "@/components/lp/RefreshStatusIndicator";
import type { ExpandedRecord } from "@/lib/airtable";
import { normalizeFieldKey } from "@/lib/airtable";
import { formatCurrencyUSD, formatDate, formatNumber, formatPercent } from "@/lib/format";
import { usePolling } from "@/hooks/usePolling";

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
    if (/commitment|capital|nav|distribution|cost|value|balance|amount/.test(normalized)) {
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
        <RefreshStatusIndicator status={status} lastUpdated={lastUpdated} />
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
        <HoldingsTable records={filteredRecords} columnKeys={columnKeys} renderValue={formatValue} />
      )}
    </div>
  );
}
