"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useMemo } from "react";
import {
  CartesianGrid,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { normalizeFieldKey } from "@/lib/airtable-shared";
import { formatCurrencyUSD, formatDate, formatNumber } from "@/lib/format";
import { usePolling, type RefreshStatus } from "@/hooks/usePolling";
import { useLpData } from "../../lp-data-context";
import type { LpDocumentItem, LpDocumentsResponse, LpInvestmentRecord } from "@/types/lp";

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

function resolveInvestmentName(record: LpInvestmentRecord | undefined) {
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

  const { data, status, error, initialized, lastUpdated } = useLpData();
  const { data: docData } = usePolling<LpDocumentsResponse>("/api/lp/documents");
  const note = data?.note ?? docData?.note;
  const email = data?.profile.email;

  const record = useMemo<LpInvestmentRecord | undefined>(() => {
    return data?.records.find((item) => item.id === investmentId);
  }, [data?.records, investmentId]);

  const investmentName = resolveInvestmentName(record) ?? "Investment";

  const peerRecords = useMemo<LpInvestmentRecord[]>(() => {
    if (!record) return [];
    const name = resolveInvestmentName(record);
    if (!name) return [record];
    return (data?.records || []).filter((item) => resolveInvestmentName(item) === name);
  }, [data?.records, record]);

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

  const documents = useMemo<LpDocumentItem[]>(() => {
    if (!docData?.documents) return [];
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
        {buildStatusBadge(status, lastUpdated)}
      </div>

      {status === "error" && error ? (
        <div className="rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-600">
          We were unable to refresh this investment. Please try again soon.
        </div>
      ) : null}

      {initialized && note === "contact-not-found" ? (
        <div className="rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-700">
          We could not locate a contact record for <strong>{email}</strong>. Once your email is linked to a contact in Airtable,
          investment details will populate here automatically.
        </div>
      ) : null}

      {initialized && note === "view-filtered" ? (
        <div className="rounded-2xl border border-blue-200 bg-blue-50 px-4 py-3 text-sm text-blue-700">
          Your Airtable view currently hides this investment. Please confirm view filters with the JBV team if access is
          expected.
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
            <div className="rounded-2xl bg-white p-6 shadow-sm ring-1 ring-slate-200">
              <p className="text-sm font-medium text-slate-500">Commitment</p>
              <p className="mt-2 text-2xl font-semibold text-slate-900">
                {metrics.commitment !== null ? formatCurrencyUSD(metrics.commitment) : "—"}
              </p>
            </div>
            <div className="rounded-2xl bg-white p-6 shadow-sm ring-1 ring-slate-200">
              <p className="text-sm font-medium text-slate-500">Total NAV</p>
              <p className="mt-2 text-2xl font-semibold text-slate-900">
                {metrics.nav !== null ? formatCurrencyUSD(metrics.nav) : "—"}
              </p>
            </div>
            <div className="rounded-2xl bg-white p-6 shadow-sm ring-1 ring-slate-200">
              <p className="text-sm font-medium text-slate-500">Distributions</p>
              <p className="mt-2 text-2xl font-semibold text-slate-900">
                {metrics.distributions !== null ? formatCurrencyUSD(metrics.distributions) : "—"}
              </p>
            </div>
            <div className="rounded-2xl bg-white p-6 shadow-sm ring-1 ring-slate-200">
              <p className="text-sm font-medium text-slate-500">Net MOIC</p>
              <p className="mt-2 text-2xl font-semibold text-slate-900">
                {metrics.netMoic !== null ? `${formatNumber(metrics.netMoic, 2)}x` : "—"}
              </p>
            </div>
          </div>

          <div className="rounded-2xl bg-white p-6 shadow-sm ring-1 ring-slate-200">
            <h3 className="text-lg font-semibold text-slate-900">Valuation Timeline</h3>
            <p className="text-sm text-slate-500">Chronological NAV snapshots sourced from Airtable.</p>
            <div className="mt-4 h-64">
              {navSeries.length ? (
                <ResponsiveContainer>
                  <LineChart data={navSeries} margin={{ top: 10, right: 16, left: 0, bottom: 0 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#E2E8F0" />
                    <XAxis dataKey="label" tick={{ fontSize: 12, fill: "#475569" }} />
                    <YAxis tickFormatter={(value) => formatCurrencyUSD(value).replace("$", "")} tick={{ fontSize: 12, fill: "#475569" }} />
                    <Tooltip formatter={(value: number) => formatCurrencyUSD(value)} labelFormatter={(label) => `Period Ending: ${label}`} />
                    <Line type="monotone" dataKey="value" stroke="#2563EB" strokeWidth={2} dot={{ r: 3 }} />
                  </LineChart>
                </ResponsiveContainer>
              ) : (
                <div className="flex h-full flex-col items-center justify-center text-sm text-slate-500">
                  Additional valuation history is not yet available for this holding.
                </div>
              )}
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
                    const downloadUrl = `/api/lp/documents/download?recordId=${encodeURIComponent(
                      doc.investmentId
                    )}&field=${encodeURIComponent(doc.field)}&index=${doc.index}`;
                    const sizeLabel = doc.size ? `${(doc.size / (1024 * 1024)).toFixed(2)} MB` : null;
                    const docKey = `${doc.investmentId}-${doc.field}-${doc.index}`;
                    return (
                      <a
                        key={docKey}
                        href={downloadUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="flex items-center justify-between rounded-xl border border-slate-200 px-4 py-3 text-sm text-blue-700 transition hover:border-blue-400 hover:bg-blue-50"
                      >
                        <div>
                          <p className="font-medium text-slate-900">{doc.name}</p>
                          <p className="text-xs text-slate-500">
                            {doc.periodEnding
                              ? `Period Ending: ${formatValue("Period Ending", doc.periodEnding)}`
                              : "Document"}
                            {sizeLabel ? ` · ${sizeLabel}` : ""}
                          </p>
                        </div>
                        <span className="text-xs font-semibold uppercase tracking-wide text-blue-600">Download</span>
                      </a>
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
