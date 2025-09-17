"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useMemo } from "react";

import { ChartLine } from "@/components/lp/ChartLine";
import { DocCard } from "@/components/lp/DocCard";
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

interface DocumentItem {
  name: string;
  downloadUrl: string;
  size?: number;
  type?: string;
  investmentId: string;
  investmentName?: string;
  periodEnding?: any;
}

interface DocumentsResponse {
  documents: DocumentItem[];
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
  if (typeof value === "boolean") return value ? "Yes" : "No";
  const normalized = normalizeFieldKey(key);
  if (typeof value === "number") {
    if (/commitment|capital|nav|distribution|cost|value|amount/.test(normalized)) {
      return formatCurrencyUSD(value);
    }
    if (/percent|irr/.test(normalized)) {
      return `${formatNumber(value, 2)}%`;
    }
    if (/moic|multiple/.test(normalized)) {
      return `${formatNumber(value, 2)}x`;
    }
    return formatNumber(value, 2);
  }
  if (typeof value === "string") {
    const parsed = parseNumber(value);
    if (/commitment|capital|nav|distribution|cost|value|amount/.test(normalized) && parsed !== null) {
      return formatCurrencyUSD(parsed);
    }
    if (/moic|multiple/.test(normalized) && parsed !== null) {
      return `${formatNumber(parsed, 2)}x`;
    }
    if (/percent|irr/.test(normalized) && parsed !== null) {
      return `${formatNumber(parsed, 2)}%`;
    }
    if (/date|period|as of/.test(normalized)) {
      return formatDate(value);
    }
    return value;
  }
  return String(value);
}

function resolveInvestmentName(record: ExpandedRecord | undefined) {
  if (!record) return undefined;
  const fields = record.fields || {};
  for (const key of ["Partner Investment", "Investment", "Name", "Title"]) {
    if (Object.prototype.hasOwnProperty.call(fields, key)) {
      const value = fields[key];
      if (typeof value === "string" && value.trim()) return value;
    }
  }
  return undefined;
}

export default function InvestmentDetailPage() {
  const params = useParams<{ id: string }>();
  const idParam = params?.id;
  const investmentId = Array.isArray(idParam) ? idParam[0] : idParam;

  const { data, status, error, initialized, lastUpdated } = usePolling<LpDataResponse>("/api/lp/data");
  const { data: docData } = usePolling<DocumentsResponse>("/api/lp/documents");

  const record = useMemo(() => data?.records.find((item) => item.id === investmentId), [data, investmentId]);

  const investmentName = resolveInvestmentName(record) ?? "Investment";

  const peerRecords = useMemo(() => {
    if (!record) return [] as ExpandedRecord[];
    const name = resolveInvestmentName(record);
    if (!name) return [record];
    return (data?.records || []).filter((item) => resolveInvestmentName(item) === name);
  }, [data, record]);

  const fieldKeys = useMemo(() => {
    const fields = record?.fields || {};
    return {
      commitment: Object.keys(fields).find((key) => normalizeFieldKey(key) === "commitment"),
      nav: Object.keys(fields).find((key) => /total nav|current nav/.test(normalizeFieldKey(key))),
      distributions: Object.keys(fields).find((key) => normalizeFieldKey(key) === "distributions"),
      netMoic: Object.keys(fields).find((key) => /net moic|moic/.test(normalizeFieldKey(key))),
      period: Object.keys(fields).find((key) => /period ending|period|as of/.test(normalizeFieldKey(key))),
    };
  }, [record]);

  const documents = useMemo(() => {
    if (!docData?.documents) return [] as DocumentItem[];
    return docData.documents.filter((doc) => doc.investmentId === investmentId);
  }, [docData, investmentId]);

  const navSeries = useMemo(() => {
    if (!peerRecords.length || !fieldKeys.period || !fieldKeys.nav) return [] as { label: string; value: number }[];
    return peerRecords
      .map((item) => {
        const fields = item.fields || {};
        const period = fields[fieldKeys.period!];
        const nav = parseNumber(fields[fieldKeys.nav!]);
        if (!period || nav === null) return null;
        const date = new Date(period);
        const sort = Number.isNaN(date.getTime()) ? 0 : date.getTime();
        const label = Number.isNaN(date.getTime()) ? String(period) : date.toLocaleDateString();
        return { label, value: nav, sort };
      })
      .filter((entry): entry is { label: string; value: number; sort: number } => Boolean(entry))
      .sort((a, b) => a.sort - b.sort)
      .map(({ label, value }) => ({ label, value }));
  }, [peerRecords, fieldKeys]);

  const metrics = {
    commitment: fieldKeys.commitment ? parseNumber(record?.fields?.[fieldKeys.commitment]) : null,
    nav: fieldKeys.nav ? parseNumber(record?.fields?.[fieldKeys.nav]) : null,
    distributions: fieldKeys.distributions ? parseNumber(record?.fields?.[fieldKeys.distributions]) : null,
    netMoic: fieldKeys.netMoic ? parseNumber(record?.fields?.[fieldKeys.netMoic]) : null,
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-3 text-sm text-slate-500">
            <Link href="/lp/investments" className="text-blue-600 hover:text-blue-700">
              ← Back to investments
            </Link>
            <span>/</span>
            <span>{investmentId}</span>
          </div>
          <h2 className="mt-2 text-2xl font-semibold text-slate-900">{investmentName}</h2>
          <p className="text-sm text-slate-500">Detailed insights for this holding, refreshed automatically.</p>
        </div>
        <RefreshStatusIndicator status={status} lastUpdated={lastUpdated} />
      </div>

      {status === "error" && error ? (
        <div className="rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-600">
          We were unable to refresh this investment. Please try again soon.
        </div>
      ) : null}

      {!initialized ? (
        <div className="h-64 animate-pulse rounded-2xl bg-gradient-to-br from-slate-200/80 to-slate-100" />
      ) : !record ? (
        <div className="rounded-2xl border border-dashed border-slate-200 p-10 text-center text-sm text-slate-500">
          This investment could not be found or you no longer have access to it.
        </div>
      ) : (
        <div className="space-y-6">
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <Kpi label="Commitment" value={metrics.commitment !== null ? formatCurrencyUSD(metrics.commitment) : "—"} />
            <Kpi label="Total NAV" value={metrics.nav !== null ? formatCurrencyUSD(metrics.nav) : "—"} />
            <Kpi label="Distributions" value={metrics.distributions !== null ? formatCurrencyUSD(metrics.distributions) : "—"} />
            <Kpi
              label="Net MOIC"
              value={metrics.netMoic !== null ? `${formatNumber(metrics.netMoic, 2)}x` : "—"}
              hint="MOIC"
            />
          </div>

          <div className="rounded-2xl bg-white p-6 shadow-sm ring-1 ring-slate-200">
            <h3 className="text-lg font-semibold text-slate-900">Valuation Timeline</h3>
            <p className="text-sm text-slate-500">Chronological NAV snapshots sourced from Airtable.</p>
            <div className="mt-4 h-64">
              <ChartLine
                data={navSeries}
                valueFormatter={(value) => formatCurrencyUSD(value)}
                labelFormatter={(label) => `Period Ending: ${label}`}
                emptyMessage={
                  <>Additional valuation history is not yet available for this holding.</>
                }
              />
            </div>
          </div>

          <div className="grid gap-4 lg:grid-cols-2">
            <div className="space-y-4 rounded-2xl bg-white p-6 shadow-sm ring-1 ring-slate-200">
              <h3 className="text-lg font-semibold text-slate-900">Key Details</h3>
              <dl className="grid grid-cols-1 gap-3 text-sm text-slate-600">
                {Object.entries(record.fields || {}).map(([key, value]) => (
                  <div key={key} className="rounded-xl bg-slate-50/80 px-3 py-2">
                    <dt className="text-xs font-semibold uppercase tracking-wide text-slate-500">{key}</dt>
                    <dd className="mt-1 text-sm text-slate-700">{formatValue(key, value)}</dd>
                  </div>
                ))}
              </dl>
            </div>
            <div className="space-y-4 rounded-2xl bg-white p-6 shadow-sm ring-1 ring-slate-200">
              <h3 className="text-lg font-semibold text-slate-900">Documents</h3>
              <p className="text-sm text-slate-500">Latest files associated with this investment.</p>
              <div className="space-y-3">
                {documents.length ? (
                  documents.map((doc) => {
                    const periodLabel = doc.periodEnding ? `Period Ending: ${formatValue("Period Ending", doc.periodEnding)}` : undefined;
                    const sizeLabel = doc.size ? `${(doc.size / (1024 * 1024)).toFixed(2)} MB` : undefined;
                    return (
                      <DocCard
                        key={`${doc.downloadUrl}-${doc.name}`}
                        name={doc.name}
                        description={periodLabel}
                        href={doc.downloadUrl}
                        meta={sizeLabel}
                      />
                    );
                  })
                ) : (
                  <div className="rounded-xl border border-dashed border-slate-200 p-8 text-center text-sm text-slate-500">
                    No documents have been shared for this investment yet.
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
