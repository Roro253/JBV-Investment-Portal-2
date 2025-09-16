"use client";

import { useMemo } from "react";
import { RefreshStatus } from "../components/RefreshStatus";
import { usePollingResource } from "@/hooks/usePollingResource";
import { formatDate } from "@/lib/format";

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

export default function DocumentsPage() {
  const { data, status, error, hasLoaded } = usePollingResource<DocumentsResponse>("/api/lp/documents");

  const groupedDocuments = useMemo(() => {
    const map = new Map<string, DocumentItem[]>();
    (data?.documents ?? []).forEach((doc) => {
      const key = doc.investmentName || "General";
      if (!map.has(key)) map.set(key, []);
      map.get(key)!.push(doc);
    });
    return Array.from(map.entries()).map(([investmentName, docs]) => ({ investmentName, docs }));
  }, [data?.documents]);

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h2 className="text-2xl font-semibold text-slate-900">Documents</h2>
          <p className="text-sm text-slate-500">
            PCAP statements, subscription documents, and capital call notices filtered for your account.
          </p>
        </div>
        <RefreshStatus status={error ? "error" : status} />
      </div>

      {hasLoaded ? (
        groupedDocuments.length ? (
          <div className="space-y-6">
            {groupedDocuments.map(({ investmentName, docs }) => (
              <section key={investmentName} className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
                <h3 className="text-lg font-semibold text-slate-900">{investmentName}</h3>
                <div className="mt-4 space-y-3">
                  {docs.map((doc) => (
                    <div
                      key={`${doc.investmentId}-${doc.name}-${doc.url}`}
                      className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3"
                    >
                      <div>
                        <p className="font-medium text-slate-900">{doc.name}</p>
                        <p className="text-xs text-slate-500">
                          {doc.periodEnding ? `Period ending ${formatDate(doc.periodEnding)}` : "Most recent"}
                          {doc.size ? ` • ${(doc.size / (1024 * 1024)).toFixed(2)} MB` : ""}
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
                  ))}
                </div>
              </section>
            ))}
          </div>
        ) : (
          <div className="rounded-3xl border border-slate-200 bg-slate-50 p-10 text-center text-sm text-slate-500">
            No documents are available yet. Check back soon for new uploads.
          </div>
        )
      ) : (
        <div className="h-48 animate-pulse rounded-3xl bg-slate-100" />
      )}
    </div>
  );
}
