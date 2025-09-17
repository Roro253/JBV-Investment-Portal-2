"use client";

import { useMemo } from "react";

import { ChartBar } from "@/components/lp/ChartBar";
import { ChartLine } from "@/components/lp/ChartLine";
import { Kpi } from "@/components/lp/Kpi";
import { RefreshStatusIndicator } from "@/components/lp/RefreshStatusIndicator";
import type { ExpandedRecord } from "@/lib/airtable";
import { normalizeFieldKey } from "@/lib/airtable";
import { formatCurrencyUSD, formatDate, formatNumber } from "@/lib/format";
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

interface ChartDatum {
  label: string;
  value: number;
  sortKey: { type: "date" | "text"; value: number | string };
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

function formatPeriodLabel(value: any) {
  if (!value) return "—";
  const date = new Date(value);
  if (!Number.isNaN(date.getTime())) {
    return date.toLocaleDateString(undefined, { month: "short", year: "numeric" });
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

function resolveDisplayName(record: ExpandedRecord, fallback = "Unnamed Investment") {
  const fields = record.fields || {};
  const key = findFieldKey([record], ["Partner Investment", "Investment", "Name", "Title"]);
  const value = key ? fields[key] : undefined;
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
      series.push({ label, value, sortKey: buildSortKey(periodRaw) });
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
        map.set(key, { label, value: amount, sortKey: buildSortKey(periodRaw) });
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
          <p className="text-sm text-slate-500">
            A holistic snapshot of your capital commitments, valuations, and recent activity.
          </p>
        </div>
        <RefreshStatusIndicator status={status} lastUpdated={lastUpdated} />
      </div>

      {status === "error" && error ? (
        <div className="rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-600">
          We were unable to refresh your portfolio data. Please retry in a few moments or contact support if the issue persists.
        </div>
      ) : null}

      {!initialized ? (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {Array.from({ length: 4 }).map((_, idx) => (
            <div key={idx} className="h-32 animate-pulse rounded-2xl bg-gradient-to-br from-slate-200/80 to-slate-100" />
          ))}
        </div>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <Kpi
            label="Total Commitment"
            value={formatCurrencyUSD(metrics.commitmentTotal)}
            description="Capital committed across all vehicles."
          />
          <Kpi
            label="Total NAV"
            value={formatCurrencyUSD(metrics.navTotal)}
            description="Net asset value (prefers Total NAV; falls back to Current NAV)."
          />
          <Kpi
            label="Total Distributions"
            value={formatCurrencyUSD(metrics.distributionsTotal)}
            description="Realized capital returned to date."
          />
          <Kpi
            label="Net MOIC"
            value={metrics.netMoicAvg ? `${formatNumber(metrics.netMoicAvg, 2)}x` : "—"}
            description="Average multiple on invested capital across visible holdings."
            hint="MOIC"
          />
        </div>
      )}

      <div className="grid gap-6 lg:grid-cols-2">
        <div className="rounded-2xl bg-white p-6 shadow-sm ring-1 ring-slate-200">
          <div className="flex items-center justify-between">
            <div>
              <h3 className="text-lg font-semibold text-slate-900">NAV Over Time</h3>
              <p className="text-sm text-slate-500">Track valuation progression by reporting period.</p>
            </div>
          </div>
          <div className="mt-4 h-64">
            <ChartLine
              data={navSeries}
              valueFormatter={(value) => formatCurrencyUSD(value)}
              labelFormatter={(label) => `Period Ending: ${label}`}
              emptyMessage={
                <>NAV by period is unavailable. As updates are published, this visualization will populate automatically.</>
              }
            />
          </div>
        </div>
        <div className="rounded-2xl bg-white p-6 shadow-sm ring-1 ring-slate-200">
          <div className="flex items-center justify-between">
            <div>
              <h3 className="text-lg font-semibold text-slate-900">Distributions by Period</h3>
              <p className="text-sm text-slate-500">Cumulative distributions grouped by reporting cycle.</p>
            </div>
          </div>
          <div className="mt-4 h-64">
            <ChartBar
              data={distributionsSeries}
              valueFormatter={(value) => formatCurrencyUSD(value)}
              labelFormatter={(label) => `Period Ending: ${label}`}
              emptyMessage={
                <>Distribution history is not yet available. Once reported, documents and values will populate automatically.</>
              }
            />
          </div>
        </div>
      </div>

      <div className="rounded-2xl bg-white p-6 shadow-sm ring-1 ring-slate-200">
        <div className="flex items-center justify-between">
          <div>
            <h3 className="text-lg font-semibold text-slate-900">Recent Activity</h3>
            <p className="text-sm text-slate-500">The five most recently updated holdings synced from Airtable.</p>
          </div>
        </div>
        <div className="mt-4 space-y-4">
          {recentActivity.length ? (
            recentActivity.map((record) => {
              const name = resolveDisplayName(record);
              const updated = record._updatedTime ? formatDate(record._updatedTime) : "—";
              const commitment = fieldKeys.commitment ? record.fields?.[fieldKeys.commitment] : undefined;
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
