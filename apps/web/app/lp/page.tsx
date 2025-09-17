"use client";

import { useMemo } from "react";
import {
  CartesianGrid,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
  BarChart,
  Bar,
} from "recharts";
import { normalizeFieldKey, type ExpandedRecord } from "@/lib/airtable-shared";
import { formatCurrencyUSD, formatDate, formatNumber } from "@/lib/format";
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

type ChartDatum = {
  label: string;
  value: number;
  raw: any;
  sortKey: { type: "date" | "text"; value: number | string };
};

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

function formatPeriodLabel(value: any) {
  if (!value) return "—";
  const date = new Date(value);
  if (!Number.isNaN(date.getTime())) {
    return date.toLocaleDateString(undefined, {
      month: "short",
      year: "numeric",
    });
  }
  if (typeof value === "string") return value;
  return String(value);
}

function buildSortKey(value: any): ChartDatum["sortKey"] {
  const date = new Date(value);
  if (!Number.isNaN(date.getTime())) {
    return { type: "date", value: date.getTime() };
  }
  return { type: "text", value: typeof value === "string" ? value.toLowerCase() : String(value) };
}

function compareSortKey(a: ChartDatum["sortKey"], b: ChartDatum["sortKey"]) {
  if (a.type === b.type) {
    if (a.value < b.value) return -1;
    if (a.value > b.value) return 1;
    return 0;
  }
  return a.type === "date" ? -1 : 1;
}

function findFieldKey(records: ExpandedRecord[], candidates: string[]) {
  if (!records.length) return undefined;
  const normalizedCandidates = new Set(candidates.map((name) => normalizeFieldKey(name)));
  for (const record of records) {
    const fields = record.fields || {};
    for (const key of Object.keys(fields)) {
      if (normalizedCandidates.has(normalizeFieldKey(key))) {
        return key;
      }
    }
  }
  return undefined;
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

function resolveDisplayName(record: ExpandedRecord, fallback = "Unnamed Investment") {
  const fields = record.fields || {};
  const nameKey = findFieldKey([record], ["Partner Investment", "Investment", "Name", "Title"]);
  const value = nameKey ? fields[nameKey] : undefined;
  return typeof value === "string" && value.trim() ? value : fallback;
}

export default function LPDashboardPage() {
  const { data, status, error, initialized, lastUpdated } = usePolling<LpDataResponse>("/api/lp/data");

  const records = useMemo(() => data?.records ?? [], [data?.records]);
  const metrics = data?.metrics ?? {
    commitmentTotal: 0,
    navTotal: 0,
    distributionsTotal: 0,
    netMoicAvg: 0,
  };

  const fieldKeys = useMemo(() => {
    return {
      period: findFieldKey(records, ["Period Ending", "As of Date", "Date"]),
      nav: findFieldKey(records, ["Total NAV", "Current NAV"]),
      distributions: findFieldKey(records, ["Distributions"]),
      commitment: findFieldKey(records, ["Commitment"]),
      netMoic: findFieldKey(records, ["Net MOIC", "MOIC"]),
    };
  }, [records]);

  const navSeries = useMemo(() => {
    if (!records.length || !fieldKeys.period || !fieldKeys.nav) return [] as ChartDatum[];
    const series: ChartDatum[] = [];
    for (const record of records) {
      const fields = record.fields || {};
      if (!Object.prototype.hasOwnProperty.call(fields, fieldKeys.nav)) continue;
      const value = parseNumber(fields[fieldKeys.nav]);
      if (value === null) continue;
      const periodRaw = fields[fieldKeys.period];
      if (!periodRaw) continue;
      const label = formatPeriodLabel(periodRaw);
      series.push({
        label,
        value,
        raw: periodRaw,
        sortKey: buildSortKey(periodRaw),
      });
    }
    return series.sort((a, b) => compareSortKey(a.sortKey, b.sortKey));
  }, [records, fieldKeys]);

  const distributionsSeries = useMemo(() => {
    if (!records.length || !fieldKeys.period || !fieldKeys.distributions) return [] as ChartDatum[];
    const map = new Map<string, ChartDatum>();
    for (const record of records) {
      const fields = record.fields || {};
      if (!Object.prototype.hasOwnProperty.call(fields, fieldKeys.distributions)) continue;
      const amount = parseNumber(fields[fieldKeys.distributions]);
      if (amount === null) continue;
      const periodRaw = fields[fieldKeys.period];
      if (!periodRaw) continue;
      const label = formatPeriodLabel(periodRaw);
      const key = `${label}::${JSON.stringify(periodRaw)}`;
      const existing = map.get(key);
      if (existing) {
        existing.value += amount;
      } else {
        map.set(key, {
          label,
          value: amount,
          raw: periodRaw,
          sortKey: buildSortKey(periodRaw),
        });
      }
    }
    return Array.from(map.values()).sort((a, b) => compareSortKey(a.sortKey, b.sortKey));
  }, [records, fieldKeys]);

  const recentActivity = useMemo(() => {
    const items = [...records];
    items.sort((a, b) => {
      const aTime = a._updatedTime ? new Date(a._updatedTime).getTime() : 0;
      const bTime = b._updatedTime ? new Date(b._updatedTime).getTime() : 0;
      return bTime - aTime;
    });
    return items.slice(0, 5);
  }, [records]);

  return (
    <div className="space-y-8">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h2 className="text-2xl font-semibold text-slate-900">Portfolio Overview</h2>
          <p className="text-sm text-slate-500">A holistic snapshot of your capital commitments and performance.</p>
        </div>
        {buildStatusBadge(status, lastUpdated)}
      </div>

      {status === "error" && error ? (
        <div className="rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-600">
          We were unable to refresh your portfolio data. The team has been notified, please try again shortly.
        </div>
      ) : null}

      {!initialized ? (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {Array.from({ length: 4 }).map((_, idx) => (
            <div
              key={idx}
              className="h-32 animate-pulse rounded-2xl bg-gradient-to-br from-slate-200/80 to-slate-100"
            />
          ))}
        </div>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <div className="rounded-2xl bg-white p-6 shadow-sm ring-1 ring-slate-200">
            <p className="text-sm font-medium text-slate-500">Total Commitment</p>
            <p className="mt-2 text-2xl font-semibold text-slate-900">
              {formatCurrencyUSD(metrics.commitmentTotal)}
            </p>
            <p className="mt-1 text-xs text-slate-400">Capital committed across all vehicles.</p>
          </div>
          <div className="rounded-2xl bg-white p-6 shadow-sm ring-1 ring-slate-200">
            <p className="text-sm font-medium text-slate-500">Total Distributions</p>
            <p className="mt-2 text-2xl font-semibold text-slate-900">
              {formatCurrencyUSD(metrics.distributionsTotal)}
            </p>
            <p className="mt-1 text-xs text-slate-400">Realized capital returned to date.</p>
          </div>
          <div className="rounded-2xl bg-white p-6 shadow-sm ring-1 ring-slate-200">
            <p className="text-sm font-medium text-slate-500">Total NAV</p>
            <p className="mt-2 text-2xl font-semibold text-slate-900">
              {formatCurrencyUSD(metrics.navTotal)}
            </p>
            <p className="mt-1 text-xs text-slate-400">Net asset value across current holdings.</p>
          </div>
          <div className="rounded-2xl bg-white p-6 shadow-sm ring-1 ring-slate-200">
            <p className="flex items-center gap-2 text-sm font-medium text-slate-500">
              Net MOIC
              <span className="inline-flex items-center rounded-full bg-slate-100 px-2 py-0.5 text-[11px] text-slate-500">
                MOIC = Multiple on Invested Capital
              </span>
            </p>
            <p className="mt-2 text-2xl font-semibold text-slate-900">
              {metrics.netMoicAvg ? `${formatNumber(metrics.netMoicAvg, 2)}x` : "—"}
            </p>
            <p className="mt-1 text-xs text-slate-400">Average multiple across realized and unrealized positions.</p>
          </div>
        </div>
      )}

      <div className="grid gap-6 lg:grid-cols-2">
        <div className="rounded-2xl bg-white p-6 shadow-sm ring-1 ring-slate-200">
          <div className="flex items-center justify-between">
            <div>
              <h3 className="text-lg font-semibold text-slate-900">NAV Over Time</h3>
              <p className="text-sm text-slate-500">Track valuation progression by period ending.</p>
            </div>
          </div>
          <div className="mt-4 h-64">
            {navSeries.length ? (
              <ResponsiveContainer>
                <LineChart data={navSeries} margin={{ top: 10, right: 16, left: 0, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#E2E8F0" />
                  <XAxis dataKey="label" tick={{ fontSize: 12, fill: "#475569" }} />
                  <YAxis tickFormatter={(value) => formatCurrencyUSD(value).replace("$", "")} tick={{ fontSize: 12, fill: "#475569" }} />
                  <Tooltip
                    formatter={(value: number) => formatCurrencyUSD(value)}
                    labelFormatter={(label) => `Period Ending: ${label}`}
                  />
                  <Line type="monotone" dataKey="value" stroke="#2563EB" strokeWidth={2} dot={{ r: 3 }} />
                </LineChart>
              </ResponsiveContainer>
            ) : (
              <div className="flex h-full flex-col items-center justify-center text-sm text-slate-500">
                NAV by period is unavailable. As data becomes available, the visualization will render automatically.
              </div>
            )}
          </div>
        </div>
        <div className="rounded-2xl bg-white p-6 shadow-sm ring-1 ring-slate-200">
          <div className="flex items-center justify-between">
            <div>
              <h3 className="text-lg font-semibold text-slate-900">Distributions by Period</h3>
              <p className="text-sm text-slate-500">Cumulative distributions grouped by reporting period.</p>
            </div>
          </div>
          <div className="mt-4 h-64">
            {distributionsSeries.length ? (
              <ResponsiveContainer>
                <BarChart data={distributionsSeries} margin={{ top: 10, right: 16, left: 0, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#E2E8F0" />
                  <XAxis dataKey="label" tick={{ fontSize: 12, fill: "#475569" }} />
                  <YAxis tickFormatter={(value) => formatCurrencyUSD(value).replace("$", "")} tick={{ fontSize: 12, fill: "#475569" }} />
                  <Tooltip
                    formatter={(value: number) => formatCurrencyUSD(value)}
                    labelFormatter={(label) => `Period Ending: ${label}`}
                  />
                  <Bar dataKey="value" fill="#0EA5E9" radius={[6, 6, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            ) : (
              <div className="flex h-full flex-col items-center justify-center text-sm text-slate-500">
                Distribution history is not yet available. Once reported, documents and values will populate automatically.
              </div>
            )}
          </div>
        </div>
      </div>

      <div className="rounded-2xl bg-white p-6 shadow-sm ring-1 ring-slate-200">
        <div className="flex items-center justify-between">
          <div>
            <h3 className="text-lg font-semibold text-slate-900">Recent Activity</h3>
            <p className="text-sm text-slate-500">The five most recently updated holdings from Airtable.</p>
          </div>
        </div>
        <div className="mt-4 space-y-4">
          {recentActivity.length ? (
            recentActivity.map((record) => {
              const name = resolveDisplayName(record);
              const updated = record._updatedTime ? formatDate(record._updatedTime) : "—";
              const commitment = fieldKeys.commitment
                ? record.fields?.[fieldKeys.commitment]
                : undefined;
              const nav = fieldKeys.nav ? record.fields?.[fieldKeys.nav] : undefined;
              const netMoic = fieldKeys.netMoic ? record.fields?.[fieldKeys.netMoic] : undefined;

              return (
                <div
                  key={record.id}
                  className="flex flex-col gap-3 rounded-xl border border-slate-100 bg-slate-50/70 p-4 md:flex-row md:items-center md:justify-between"
                >
                  <div>
                    <p className="font-semibold text-slate-900">{name}</p>
                    <p className="text-xs text-slate-500">Last updated {updated}</p>
                  </div>
                  <div className="flex flex-wrap items-center gap-4 text-sm text-slate-600">
                    {commitment !== undefined ? (
                      <span>
                        Commitment: <strong>{formatCurrencyUSD(parseNumber(commitment) ?? 0)}</strong>
                      </span>
                    ) : null}
                    {nav !== undefined ? (
                      <span>
                        NAV: <strong>{formatCurrencyUSD(parseNumber(nav) ?? 0)}</strong>
                      </span>
                    ) : null}
                    {netMoic !== undefined ? (
                      <span>
                        Net MOIC: <strong>{parseNumber(netMoic) ? `${formatNumber(parseNumber(netMoic) ?? 0, 2)}x` : "—"}</strong>
                      </span>
                    ) : null}
                  </div>
                </div>
              );
            })
          ) : (
            <div className="rounded-xl border border-dashed border-slate-200 p-8 text-center text-sm text-slate-500">
              Once investments start syncing, you will see a live trail of updates here.
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
