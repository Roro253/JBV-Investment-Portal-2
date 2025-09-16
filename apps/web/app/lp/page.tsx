"use client";

import { useMemo } from "react";
import {
  Line,
  LineChart,
  CartesianGrid,
  Tooltip,
  XAxis,
  YAxis,
  ResponsiveContainer,
  BarChart,
  Bar,
} from "recharts";
import { RefreshStatus } from "./components/RefreshStatus";
import { usePollingResource } from "@/hooks/usePollingResource";
import { formatCurrencyUSD, formatNumber, formatDate } from "@/lib/format";

interface LpRecord {
  id: string;
  fields: Record<string, any>;
  _updatedTime: string | null;
}

interface Metrics {
  commitmentTotal: number;
  navTotal: number;
  distributionsTotal: number;
  netMoicAvg: number;
}

interface LpDataResponse {
  records: LpRecord[];
  metrics: Metrics;
}

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

function getField<T = any>(fields: Record<string, any>, ...names: string[]): T | undefined {
  for (const name of names) {
    if (fields[name] !== undefined) return fields[name];
  }
  return undefined;
}

export default function LpOverviewPage() {
  const { data, status, error, hasLoaded } = usePollingResource<LpDataResponse>("/api/lp/data");

  const metrics: Metrics = data?.metrics ?? {
    commitmentTotal: 0,
    navTotal: 0,
    distributionsTotal: 0,
    netMoicAvg: 0,
  };

  const navSeries = useMemo(() => {
    const map = new Map<
      string,
      {
        nav: number;
        distributions: number;
        label: string;
        sortValue: number;
        hasPeriod: boolean;
      }
    >();

    (data?.records ?? []).forEach((record) => {
      const fields = record.fields || {};
      const rawPeriod = getField<string>(fields, "Period Ending");
      const navValue =
        coerceNumber(getField(fields, "Total NAV")) ??
        coerceNumber(getField(fields, "Current NAV")) ??
        0;
      const distValue = coerceNumber(getField(fields, "Distributions")) ?? 0;

      const date = rawPeriod ? new Date(rawPeriod) : null;
      const hasValidPeriod = Boolean(date && !Number.isNaN(date.getTime()));
      const key = hasValidPeriod
        ? date!.toISOString().slice(0, 10)
        : rawPeriod ?? record.id;
      const label = hasValidPeriod
        ? date!.toLocaleDateString()
        : rawPeriod ?? "Undated";
      const sortValue = hasValidPeriod
        ? date!.getTime()
        : record._updatedTime
        ? Date.parse(record._updatedTime)
        : Date.now();

      const existing = map.get(key);
      if (existing) {
        existing.nav += navValue;
        existing.distributions += distValue;
        existing.hasPeriod = existing.hasPeriod || hasValidPeriod;
      } else {
        map.set(key, {
          nav: navValue,
          distributions: distValue,
          label,
          sortValue: Number.isFinite(sortValue) ? sortValue : Date.now(),
          hasPeriod: hasValidPeriod,
        });
      }
    });

    return Array.from(map.entries())
      .map(([, value]) => value)
      .sort((a, b) => a.sortValue - b.sortValue);
  }, [data?.records]);

  const hasPeriodData = navSeries.some((entry) => entry.hasPeriod);

  const recentUpdates = useMemo(() => {
    return [...(data?.records ?? [])]
      .sort((a, b) => {
        const aTime = a._updatedTime ? Date.parse(a._updatedTime) : 0;
        const bTime = b._updatedTime ? Date.parse(b._updatedTime) : 0;
        return bTime - aTime;
      })
      .slice(0, 5);
  }, [data?.records]);

  const totalsBarData = [
    { label: "Total Commitment", value: metrics.commitmentTotal },
    { label: "Total NAV", value: metrics.navTotal },
    { label: "Distributions", value: metrics.distributionsTotal },
  ];

  return (
    <div className="space-y-8">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h2 className="text-2xl font-semibold text-slate-900">Portfolio Overview</h2>
          <p className="text-sm text-slate-500">
            Key performance indicators for your current JBV commitments.
          </p>
        </div>
        <RefreshStatus status={error ? "error" : status} />
      </div>

      <div className="grid gap-6 md:grid-cols-2 xl:grid-cols-4">
        <div className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
          <p className="text-xs font-semibold uppercase tracking-wide text-slate-400">Total Commitment</p>
          <p className="mt-3 text-2xl font-semibold text-slate-900">{formatCurrencyUSD(metrics.commitmentTotal)}</p>
          <p className="mt-1 text-xs text-slate-500">
            Committed capital across active investments.
          </p>
        </div>
        <div className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
          <p className="text-xs font-semibold uppercase tracking-wide text-slate-400">Total NAV</p>
          <p className="mt-3 text-2xl font-semibold text-slate-900">{formatCurrencyUSD(metrics.navTotal)}</p>
          <p className="mt-1 text-xs text-slate-500">
            Net asset value as of the latest reporting period.
          </p>
        </div>
        <div className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
          <p className="text-xs font-semibold uppercase tracking-wide text-slate-400">Total Distributions</p>
          <p className="mt-3 text-2xl font-semibold text-slate-900">{formatCurrencyUSD(metrics.distributionsTotal)}</p>
          <p className="mt-1 text-xs text-slate-500">
            Aggregate cash returned to date.
          </p>
        </div>
        <div className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
          <p className="text-xs font-semibold uppercase tracking-wide text-slate-400">Net MOIC</p>
          <p className="mt-3 text-2xl font-semibold text-slate-900">
            {metrics.netMoicAvg ? `${formatNumber(metrics.netMoicAvg, 2)}x` : "—"}
          </p>
          <p className="mt-1 text-xs text-slate-500">MOIC = Multiple on Invested Capital.</p>
        </div>
      </div>

      <div className="grid gap-6 xl:grid-cols-2">
        <div className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
          <div className="flex items-center justify-between">
            <h3 className="text-lg font-semibold text-slate-900">NAV over time</h3>
            <span className="text-xs text-slate-500">Period Ending vs. Total NAV</span>
          </div>
          <div className="mt-4 h-80">
            {hasLoaded && hasPeriodData ? (
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={navSeries} margin={{ top: 10, right: 16, bottom: 0, left: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#E2E8F0" />
                  <XAxis dataKey="label" stroke="#64748B" tickLine={false} />
                  <YAxis stroke="#64748B" tickFormatter={(value) => formatCurrencyUSD(value).replace("$", "")} />
                  <Tooltip formatter={(value: number) => formatCurrencyUSD(value)} />
                  <Line type="monotone" dataKey="nav" stroke="#2563EB" strokeWidth={3} dot={{ r: 3 }} />
                </LineChart>
              </ResponsiveContainer>
            ) : hasLoaded ? (
              <div className="flex h-full items-center justify-center text-sm text-slate-500">
                Not enough period data to plot. Showing totals below.
              </div>
            ) : (
              <div className="h-full animate-pulse rounded-2xl bg-slate-100" />
            )}
          </div>
        </div>

        <div className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
          <div className="flex items-center justify-between">
            <h3 className="text-lg font-semibold text-slate-900">Distributions by period</h3>
            <span className="text-xs text-slate-500">Cash returned over time</span>
          </div>
          <div className="mt-4 h-80">
            {hasLoaded && hasPeriodData ? (
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={navSeries} margin={{ top: 10, right: 16, bottom: 0, left: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#E2E8F0" />
                  <XAxis dataKey="label" stroke="#64748B" tickLine={false} />
                  <YAxis stroke="#64748B" tickFormatter={(value) => formatCurrencyUSD(value).replace("$", "")} />
                  <Tooltip formatter={(value: number) => formatCurrencyUSD(value)} />
                  <Bar dataKey="distributions" fill="#0EA5E9" radius={[6, 6, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            ) : hasLoaded ? (
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={totalsBarData} margin={{ top: 10, right: 16, bottom: 0, left: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#E2E8F0" />
                  <XAxis dataKey="label" stroke="#64748B" tickLine={false} />
                  <YAxis stroke="#64748B" tickFormatter={(value) => formatCurrencyUSD(value).replace("$", "")} />
                  <Tooltip formatter={(value: number) => formatCurrencyUSD(value)} />
                  <Bar dataKey="value" fill="#2563EB" radius={[6, 6, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            ) : (
              <div className="h-full animate-pulse rounded-2xl bg-slate-100" />
            )}
          </div>
        </div>
      </div>

      <div className="grid gap-6 lg:grid-cols-3">
        <div className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm lg:col-span-2">
          <div className="flex items-center justify-between">
            <h3 className="text-lg font-semibold text-slate-900">Portfolio composition</h3>
            <span className="text-xs text-slate-500">Latest updates ordered by modified date</span>
          </div>
          <div className="mt-4 space-y-3">
            {hasLoaded && recentUpdates.length === 0 ? (
              <p className="text-sm text-slate-500">No investments found for your account yet.</p>
            ) : hasLoaded ? (
              recentUpdates.map((record) => {
                const fields = record.fields || {};
                const investmentName =
                  getField<string>(fields, "Partner Investment", "Investment", "Name") ?? "Investment";
                const fundName = getField<string>(fields, "Fund", "Entity", "JBV Entity");
                const status = getField<string>(fields, "Status", "Status (I)");
                return (
                  <div
                    key={record.id}
                    className="flex flex-col gap-1 rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 md:flex-row md:items-center md:justify-between"
                  >
                    <div>
                      <p className="font-medium text-slate-900">{investmentName}</p>
                      <p className="text-xs text-slate-500">
                        {fundName ? `${fundName} · ` : ""}
                        Updated {record._updatedTime ? formatDate(record._updatedTime) : "recently"}
                      </p>
                    </div>
                    {status ? (
                      <span className="inline-flex w-fit items-center rounded-full bg-blue-100 px-3 py-1 text-xs font-medium text-blue-700">
                        {status}
                      </span>
                    ) : null}
                  </div>
                );
              })
            ) : (
              <div className="space-y-3">
                {Array.from({ length: 3 }).map((_, idx) => (
                  <div key={idx} className="h-16 animate-pulse rounded-2xl bg-slate-100" />
                ))}
              </div>
            )}
          </div>
        </div>

        <div className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
          <h3 className="text-lg font-semibold text-slate-900">Investor insights</h3>
          <ul className="mt-4 space-y-3 text-sm text-slate-600">
            <li>
              <span className="font-semibold text-slate-800">MOIC</span> measures total value divided by invested capital.
            </li>
            <li>
              NAV trends provide a directional view of valuation changes across reporting periods.
            </li>
            <li>
              Distribution totals reflect cumulative cash returned, inclusive of PCAP distributions.
            </li>
          </ul>
        </div>
      </div>
    </div>
  );
}
