"use client";

import { useMemo } from "react";
import { useParams } from "next/navigation";
import {
  LineChart,
  Line,
  CartesianGrid,
  Tooltip,
  XAxis,
  YAxis,
  ResponsiveContainer,
} from "recharts";
import Link from "next/link";
import { RefreshStatus } from "../../components/RefreshStatus";
import { usePollingResource } from "@/hooks/usePollingResource";
import { formatCurrencyUSD, formatNumber, formatDate } from "@/lib/format";

interface LpRecord {
  id: string;
  fields: Record<string, any>;
  _updatedTime: string | null;
}

interface MetricsResponse {
  records: LpRecord[];
}

interface DocumentItem {
  name: string;
  url: string;
  size?: number;
  type?: string;
  investmentId: string;
  investmentName: string;
  periodEnding: string | null;
}

interface DocumentsResponse {
  documents: DocumentItem[];
}

const CURRENCY_HINTS = [
  "commitment",
  "capital",
  "nav",
  "distribution",
  "cost",
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

function formatFieldValue(key: string, value: any) {
  if (value === null || value === undefined || value === "") return "—";
  const normalized = key.toLowerCase();

  if (Array.isArray(value)) {
    if (!value.length) return "—";
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
        {value.map((item: any, idx: number) => (
          <span key={`${key}-chip-${idx}`} className="rounded-full bg-slate-100 px-3 py-1 text-xs text-slate-700">
            {valueToText(item) || "—"}
          </span>
        ))}
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
    if (numeric !== null && CURRENCY_HINTS.some((hint) => normalized.includes(hint))) return formatCurrencyUSD(numeric);
    if (numeric !== null && PERCENT_HINTS.some((hint) => normalized.includes(hint))) return formatPercent(numeric);
    return value;
  }

  return valueToText(value) || "—";
}

export default function InvestmentDetailPage() {
  const params = useParams<{ id: string }>();
  const investmentId = Array.isArray(params?.id) ? params.id[0] : params?.id;
  const {
    data: investmentData,
    status,
    error,
    hasLoaded,
  } = usePollingResource<MetricsResponse>("/api/lp/data");
  const {
    data: documentData,
    status: docStatus,
    error: docError,
    hasLoaded: docsLoaded,
  } = usePollingResource<DocumentsResponse>("/api/lp/documents");

  const currentRecord = useMemo(() => {
    return investmentData?.records.find((record) => record.id === investmentId) ?? null;
  }, [investmentData?.records, investmentId]);

  const investmentName = useMemo(() => {
    if (!currentRecord) return "Investment";
    return (
      valueToText(
        currentRecord.fields["Partner Investment"] ??
          currentRecord.fields["Investment"] ??
          currentRecord.fields["Name"] ??
          ""
      ) || "Investment"
    );
  }, [currentRecord]);

  const relatedRecords = useMemo(() => {
    if (!currentRecord) return [] as LpRecord[];
    const identifier = valueToText(
      currentRecord.fields["Partner Investment"] ??
        currentRecord.fields["Investment"] ??
        currentRecord.fields["Name"] ??
        ""
    );
    if (!identifier) return [currentRecord];
    return (investmentData?.records ?? []).filter((record) => {
      const name = valueToText(
        record.fields["Partner Investment"] ??
          record.fields["Investment"] ??
          record.fields["Name"] ??
          ""
      );
      return name === identifier;
    });
  }, [currentRecord, investmentData?.records]);

  const timelineData = useMemo(() => {
    return relatedRecords
      .map((record) => {
        const fields = record.fields || {};
        const period = fields["Period Ending"] as string | undefined;
        const date = period ? new Date(period) : record._updatedTime ? new Date(record._updatedTime) : null;
        const sortValue = date && !Number.isNaN(date.getTime()) ? date.getTime() : Date.now();
        const label = date && !Number.isNaN(date.getTime()) ? date.toLocaleDateString() : period ?? "Undated";
        const navValue =
          coerceNumber(fields["Total NAV"]) ??
          coerceNumber(fields["Current NAV"]);
        return navValue !== null
          ? {
              label,
              value: navValue,
              sortValue,
            }
          : null;
      })
      .filter((entry): entry is { label: string; value: number; sortValue: number } => Boolean(entry))
      .sort((a, b) => a.sortValue - b.sortValue);
  }, [relatedRecords]);

  const documents = useMemo(() => {
    if (!investmentId) return [];
    return (documentData?.documents ?? []).filter((doc) => doc.investmentId === investmentId);
  }, [documentData?.documents, investmentId]);

  const commitment = coerceNumber(currentRecord?.fields["Commitment"]);
  const nav =
    coerceNumber(currentRecord?.fields["Total NAV"]) ??
    coerceNumber(currentRecord?.fields["Current NAV"]);
  const distributions = coerceNumber(currentRecord?.fields["Distributions"]);
  const netMoic = coerceNumber(currentRecord?.fields["Net MOIC"]);

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <Link href="/lp/investments" className="text-xs font-medium text-blue-600 hover:underline">
            ← Back to investments
          </Link>
          <h2 className="mt-2 text-2xl font-semibold text-slate-900">{investmentName}</h2>
          {currentRecord?._updatedTime ? (
            <p className="text-sm text-slate-500">
              Updated {formatDate(currentRecord._updatedTime)}
            </p>
          ) : null}
        </div>
        <div className="flex items-center gap-2">
          <RefreshStatus status={error ? "error" : status} />
          <RefreshStatus status={docError ? "error" : docStatus} />
        </div>
      </div>

      {hasLoaded && !currentRecord ? (
        <div className="rounded-3xl border border-red-100 bg-red-50 p-8 text-sm text-red-600">
          We couldn’t find that investment in your portfolio.
        </div>
      ) : null}

      {currentRecord ? (
        <div className="grid gap-6 lg:grid-cols-4">
          <div className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm lg:col-span-3">
            <h3 className="text-lg font-semibold text-slate-900">Key metrics</h3>
            <div className="mt-4 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
              <div>
                <p className="text-xs font-semibold uppercase tracking-wide text-slate-400">Commitment</p>
                <p className="mt-2 text-lg font-semibold text-slate-900">
                  {commitment !== null ? formatCurrencyUSD(commitment) : "—"}
                </p>
              </div>
              <div>
                <p className="text-xs font-semibold uppercase tracking-wide text-slate-400">Total NAV</p>
                <p className="mt-2 text-lg font-semibold text-slate-900">
                  {nav !== null ? formatCurrencyUSD(nav) : "—"}
                </p>
              </div>
              <div>
                <p className="text-xs font-semibold uppercase tracking-wide text-slate-400">Distributions</p>
                <p className="mt-2 text-lg font-semibold text-slate-900">
                  {distributions !== null ? formatCurrencyUSD(distributions) : "—"}
                </p>
              </div>
              <div>
                <p className="text-xs font-semibold uppercase tracking-wide text-slate-400">Net MOIC</p>
                <p className="mt-2 text-lg font-semibold text-slate-900">
                  {netMoic !== null ? `${formatNumber(netMoic, 2)}x` : "—"}
                </p>
              </div>
            </div>

            <div className="mt-8">
              <h4 className="text-sm font-semibold text-slate-700">NAV timeline</h4>
              <div className="mt-3 h-72">
                {timelineData.length ? (
                  <ResponsiveContainer width="100%" height="100%">
                    <LineChart data={timelineData} margin={{ top: 10, right: 16, bottom: 0, left: 0 }}>
                      <CartesianGrid strokeDasharray="3 3" stroke="#E2E8F0" />
                      <XAxis dataKey="label" stroke="#64748B" tickLine={false} />
                      <YAxis stroke="#64748B" tickFormatter={(value) => formatCurrencyUSD(value).replace("$", "")} />
                      <Tooltip formatter={(value: number) => formatCurrencyUSD(value)} />
                      <Line type="monotone" dataKey="value" stroke="#2563EB" strokeWidth={3} dot={{ r: 3 }} />
                    </LineChart>
                  </ResponsiveContainer>
                ) : (
                  <div className="flex h-full items-center justify-center rounded-2xl bg-slate-50 text-sm text-slate-500">
                    No valuation history available yet.
                  </div>
                )}
              </div>
            </div>
          </div>

          <div className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm space-y-4">
            <h3 className="text-lg font-semibold text-slate-900">Key details</h3>
            <dl className="space-y-3 text-sm text-slate-700">
              {Object.entries(currentRecord.fields).map(([key, value]) => (
                <div key={key} className="space-y-1">
                  <dt className="text-xs font-semibold uppercase tracking-wide text-slate-400">{key}</dt>
                  <dd className="text-sm text-slate-700">{formatFieldValue(key, value)}</dd>
                </div>
              ))}
            </dl>
          </div>
        </div>
      ) : !hasLoaded ? (
        <div className="h-64 animate-pulse rounded-3xl bg-slate-100" />
      ) : null}

      <div className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
        <div className="flex items-center justify-between">
          <h3 className="text-lg font-semibold text-slate-900">Documents</h3>
          <span className="text-xs text-slate-500">Latest PCAP, subscription and notices</span>
        </div>
        <div className="mt-4 space-y-3">
          {docsLoaded ? (
            documents.length ? (
              documents.map((doc) => (
                <div
                  key={`${doc.investmentId}-${doc.name}-${doc.url}`}
                  className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3"
                >
                  <div>
                    <p className="font-medium text-slate-900">{doc.name}</p>
                    <p className="text-xs text-slate-500">
                      {doc.periodEnding ? `Period ending ${formatDate(doc.periodEnding)}` : "Recent"}
                    </p>
                  </div>
                  <a
                    href={doc.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center rounded-full bg-blue-600 px-4 py-2 text-xs font-semibold text-white hover:bg-blue-700"
                  >
                    Download
                  </a>
                </div>
              ))
            ) : (
              <p className="text-sm text-slate-500">No documents uploaded for this investment yet.</p>
            )
          ) : (
            <div className="h-24 animate-pulse rounded-2xl bg-slate-100" />
          )}
        </div>
      </div>
    </div>
  );
}
