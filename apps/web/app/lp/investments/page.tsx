"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { RefreshStatus } from "../components/RefreshStatus";
import { usePollingResource } from "@/hooks/usePollingResource";
import { formatCurrencyUSD, formatNumber, formatPercent } from "@/lib/format";

interface LpRecord {
  id: string;
  fields: Record<string, any>;
  _updatedTime: string | null;
}

interface LpDataResponse {
  records: LpRecord[];
}

const CURRENCY_HINTS = [
  "commitment",
  "capital",
  "nav",
  "distribution",
  "cost",
  "contribution",
  "value",
];

const PERCENT_HINTS = ["percent", "%", "irr", "moic", "multiple"];
const DATE_HINTS = ["date", "period", "closing", "updated"];

function coerceNumber(value: any): number | null {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string") {
    const cleaned = value.replace(/[^0-9.-]/g, "");
    if (!cleaned) return null;
    const parsed = Number(cleaned);
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
}

function valueToText(value: any): string {
  if (value === null || value === undefined) return "";
  if (Array.isArray(value)) {
    return value
      .map((item) => {
        if (item && typeof item === "object") {
          if ("displayName" in item) return String(item.displayName ?? "");
          if ("filename" in item) return String((item as any).filename ?? (item as any).name ?? "");
          if ("name" in item) return String((item as any).name ?? "");
        }
        return String(item ?? "");
      })
      .filter(Boolean)
      .join("; ");
  }
  if (typeof value === "object") {
    if ("displayName" in value) return String((value as any).displayName ?? "");
    if ("name" in value) return String((value as any).name ?? "");
  }
  return String(value ?? "");
}

function formatCellValue(key: string, value: any) {
  if (value === null || value === undefined || value === "") return "—";
  const normalized = key.toLowerCase();

  if (Array.isArray(value)) {
    if (value.length === 0) return "—";
    if (value[0] && typeof value[0] === "object" && "url" in value[0]) {
      return (
        <div className="flex flex-wrap gap-2">
          {value.map((item: any, idx: number) => (
            <a
              key={`${key}-${idx}`}
              href={item.url}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center rounded-full border border-blue-200 px-3 py-1 text-xs text-blue-700 hover:bg-blue-50"
            >
              {(item.filename || item.name || "Document") as string}
            </a>
          ))}
        </div>
      );
    }
    return (
      <div className="flex flex-wrap gap-2">
        {value.map((item: any, idx: number) => {
          const label =
            (item && typeof item === "object" && "displayName" in item
              ? (item.displayName as string)
              : String(item ?? "")) || "—";
          return (
            <span
              key={`${key}-chip-${idx}`}
              className="rounded-full bg-slate-100 px-3 py-1 text-xs text-slate-700"
            >
              {label}
            </span>
          );
        })}
      </div>
    );
  }

  if (typeof value === "number") {
    if (CURRENCY_HINTS.some((hint) => normalized.includes(hint))) return formatCurrencyUSD(value);
    if (PERCENT_HINTS.some((hint) => normalized.includes(hint))) return formatPercent(value);
    return formatNumber(value);
  }

  if (typeof value === "string") {
    if (DATE_HINTS.some((hint) => normalized.includes(hint))) return formatDate(value);
    const numeric = coerceNumber(value);
    if (numeric !== null && CURRENCY_HINTS.some((hint) => normalized.includes(hint))) {
      return formatCurrencyUSD(numeric);
    }
    if (numeric !== null && PERCENT_HINTS.some((hint) => normalized.includes(hint))) {
      return formatPercent(numeric);
    }
    return value;
  }

  return valueToText(value) || "—";
}

function escapeCsvValue(value: string) {
  const needsQuotes = value.includes(",") || value.includes("\n") || value.includes("\"");
  let escaped = value.replace(/"/g, '""');
  if (needsQuotes) {
    escaped = `"${escaped}"`;
  }
  return escaped;
}

export default function InvestmentsPage() {
  const { data, status, error, hasLoaded } = usePollingResource<LpDataResponse>("/api/lp/data");
  const [investmentQuery, setInvestmentQuery] = useState("");
  const [fundQuery, setFundQuery] = useState("");
  const [statusQuery, setStatusQuery] = useState("");

  const records = data?.records ?? [];

  const fieldKeys = useMemo(() => {
    const set = new Set<string>();
    records.forEach((record) => {
      Object.keys(record.fields || {}).forEach((key) => set.add(key));
    });
    return Array.from(set);
  }, [records]);

  const filteredRecords = useMemo(() => {
    const investFilter = investmentQuery.trim().toLowerCase();
    const fundFilter = fundQuery.trim().toLowerCase();
    const statusFilter = statusQuery.trim().toLowerCase();

    return records.filter((record) => {
      const fields = record.fields || {};
      const investmentName = valueToText(
        fields["Partner Investment"] ?? fields["Investment"] ?? fields["Name"] ?? ""
      );
      const fundName = valueToText(fields["Fund"] ?? fields["Entity"] ?? fields["JBV Entity"] ?? "");
      const statusValue = valueToText(fields["Status"] ?? fields["Status (I)"] ?? "");

      const matchesInvestment = !investFilter || investmentName.toLowerCase().includes(investFilter);
      const matchesFund = !fundFilter || fundName.toLowerCase().includes(fundFilter);
      const matchesStatus = !statusFilter || statusValue.toLowerCase().includes(statusFilter);

      return matchesInvestment && matchesFund && matchesStatus;
    });
  }, [records, investmentQuery, fundQuery, statusQuery]);

  function handleExport() {
    if (!filteredRecords.length) return;
    const headers = fieldKeys.map(escapeCsvValue).join(",");
    const rows = filteredRecords.map((record) => {
      const values = fieldKeys.map((key) => escapeCsvValue(valueToText(record.fields[key])));
      return values.join(",");
    });
    const csvContent = [headers, ...rows].join("\n");
    const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `jbv-investments-${Date.now()}.csv`;
    link.click();
    URL.revokeObjectURL(url);
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h2 className="text-2xl font-semibold text-slate-900">Investments</h2>
          <p className="text-sm text-slate-500">Search and export the holdings visible to your account.</p>
        </div>
        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={handleExport}
            className="rounded-full border border-slate-200 px-4 py-2 text-sm font-medium text-slate-700 shadow-sm transition hover:border-blue-300 hover:text-blue-700"
            disabled={!filteredRecords.length}
          >
            Export CSV
          </button>
          <RefreshStatus status={error ? "error" : status} />
        </div>
      </div>

      <div className="grid gap-4 md:grid-cols-3">
        <label className="flex flex-col gap-1 text-sm text-slate-600">
          Investment
          <input
            className="rounded-full border border-slate-200 px-4 py-2 text-sm text-slate-900 focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-100"
            value={investmentQuery}
            onChange={(event) => setInvestmentQuery(event.target.value)}
            placeholder="Search investment"
          />
        </label>
        <label className="flex flex-col gap-1 text-sm text-slate-600">
          Fund / Entity
          <input
            className="rounded-full border border-slate-200 px-4 py-2 text-sm text-slate-900 focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-100"
            value={fundQuery}
            onChange={(event) => setFundQuery(event.target.value)}
            placeholder="Search fund"
          />
        </label>
        <label className="flex flex-col gap-1 text-sm text-slate-600">
          Status
          <input
            className="rounded-full border border-slate-200 px-4 py-2 text-sm text-slate-900 focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-100"
            value={statusQuery}
            onChange={(event) => setStatusQuery(event.target.value)}
            placeholder="Search status"
          />
        </label>
      </div>

      <div className="overflow-x-auto rounded-3xl border border-slate-200 bg-white shadow-sm">
        <table className="min-w-full divide-y divide-slate-200 text-sm">
          <thead className="bg-slate-50">
            <tr>
              {fieldKeys.map((key) => (
                <th
                  key={key}
                  scope="col"
                  className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-slate-500"
                >
                  {key}
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {hasLoaded ? (
              filteredRecords.length ? (
                filteredRecords.map((record) => (
                  <tr key={record.id} className="hover:bg-blue-50/40">
                    {fieldKeys.map((key) => {
                      const value = record.fields[key];
                      const isInvestmentKey = ["Partner Investment", "Investment", "Name"].includes(key);
                      return (
                        <td key={`${record.id}-${key}`} className="px-4 py-3 align-top text-slate-700">
                          {isInvestmentKey ? (
                            <Link
                              href={`/lp/investments/${record.id}`}
                              className="font-medium text-blue-600 hover:underline"
                            >
                              {valueToText(value) || "View investment"}
                            </Link>
                          ) : (
                            formatCellValue(key, value)
                          )}
                        </td>
                      );
                    })}
                  </tr>
                ))
              ) : (
                <tr>
                  <td colSpan={fieldKeys.length} className="px-4 py-10 text-center text-sm text-slate-500">
                    No investments match your filters.
                  </td>
                </tr>
              )
            ) : (
              <tr>
                <td colSpan={fieldKeys.length} className="px-4 py-10 text-center">
                  <div className="mx-auto h-24 max-w-md animate-pulse rounded-2xl bg-slate-100" />
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
