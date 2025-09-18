"use client";

import Image from "next/image";
import { useCallback, useEffect, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import {
  ChevronDown,
  ChevronUp,
  Download,
  ExternalLink,
  FileText,
  Folder,
  Loader2,
  Mail,
  Paperclip,
} from "lucide-react";

interface AirtableAttachment {
  id?: string;
  url: string;
  filename?: string;
  type?: string;
  size?: number;
  thumbnails?: {
    small?: { url: string };
    large?: { url: string };
    full?: { url: string };
  };
}

interface AirtableRecord {
  id: string;
  createdTime?: string;
  fields: Record<string, unknown>;
}

interface AirtableResponse {
  records: AirtableRecord[];
  offset?: string;
}

const formatDate = (value?: string) => {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
};

const ensureHttp = (url: string) => {
  if (!url) return url;
  if (/^https?:\/\//i.test(url)) return url;
  return `https://${url}`;
};

const field = <T,>(record: AirtableRecord, name: string): T | undefined =>
  (record.fields?.[name] as T | undefined);

function stringFrom(value: unknown): string | undefined {
  if (value === null || value === undefined) return undefined;
  if (typeof value === "string") {
    const trimmed = value.trim();
    return trimmed ? trimmed : undefined;
  }
  if (typeof value === "number") {
    return Number.isFinite(value) ? String(value) : undefined;
  }
  if (Array.isArray(value)) {
    for (const entry of value) {
      const resolved = stringFrom(entry);
      if (resolved) return resolved;
    }
    return undefined;
  }
  if (typeof value === "object") {
    const obj = value as Record<string, unknown>;
    for (const key of ["name", "label", "displayName", "title", "text", "value"]) {
      const candidate = obj[key];
      if (typeof candidate === "string" && candidate.trim()) {
        return candidate.trim();
      }
    }
    if ("fields" in obj && obj.fields && typeof obj.fields === "object") {
      const nested = obj.fields as Record<string, unknown>;
      for (const key of ["Name", "name", "Title", "Company", "Subject"]) {
        const candidate = nested[key];
        if (typeof candidate === "string" && candidate.trim()) {
          return candidate.trim();
        }
      }
    }
  }
  return undefined;
}

function toStringArray(value: unknown): string[] {
  if (value === null || value === undefined) return [];
  if (Array.isArray(value)) {
    const results: string[] = [];
    value.forEach((entry) => {
      const resolved = stringFrom(entry);
      if (resolved) {
        results.push(resolved);
      }
    });
    return results;
  }
  const single = stringFrom(value);
  return single ? [single] : [];
}

function attachmentsFrom(value: unknown): AirtableAttachment[] {
  if (!value) return [];
  if (Array.isArray(value)) {
    return value.filter((item): item is AirtableAttachment => {
      return Boolean(item && typeof item === "object" && "url" in item && (item as { url?: unknown }).url);
    });
  }
  if (typeof value === "object" && value && "url" in value) {
    return [value as AirtableAttachment];
  }
  return [];
}

function initialsFrom(name?: string) {
  if (!name) return "JB";
  const trimmed = name.trim();
  if (!trimmed) return "JB";
  const parts = trimmed.split(/\s+/).filter(Boolean);
  if (parts.length === 1) {
    return parts[0].slice(0, 2).toUpperCase();
  }
  const first = parts[0]?.[0] ?? "";
  const last = parts[parts.length - 1]?.[0] ?? "";
  const combo = `${first}${last}`.toUpperCase();
  if (combo.trim()) return combo;
  return trimmed.slice(0, 2).toUpperCase();
}

function renderRichText(value: string) {
  const escapeHtml = (input: string) =>
    input
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;");

  const withLinks = escapeHtml(value).replace(/(https?:\/\/[^\s]+)/g, (match) => {
    const safe = match.replace(/"/g, "%22");
    return `<a class=\"text-blue-600 underline\" href=\"${safe}\" target=\"_blank\" rel=\"noreferrer noopener\">${match}</a>`;
  });

  const withParagraphs = withLinks
    .split(/\n{2,}/)
    .map((block) => block.replace(/\n/g, "<br/>").trim())
    .filter(Boolean)
    .map((block) => `<p>${block}</p>`)
    .join("");

  return withParagraphs || `<p>${withLinks.replace(/\n/g, "<br/>")}</p>`;
}

export default function UpdatesTab() {
  const [records, setRecords] = useState<AirtableRecord[]>([]);
  const [offset, setOffset] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [initialFetchComplete, setInitialFetchComplete] = useState(false);

  const fetchPage = useCallback(async (cursor?: string) => {
    setLoading(true);
    setError(null);
    try {
      const query = cursor ? `?offset=${encodeURIComponent(cursor)}` : "";
      const response = await fetch(`/api/jbv/updates${query}`, { cache: "no-store" });
      if (!response.ok) {
        throw new Error(`Request failed (${response.status})`);
      }
      const payload = (await response.json()) as AirtableResponse;
      setRecords((prev) => {
        const incoming = payload.records || [];
        if (!cursor) {
          return incoming;
        }
        const existingIds = new Set(prev.map((record) => record.id));
        const merged = [...prev];
        incoming.forEach((record) => {
          if (!existingIds.has(record.id)) {
            merged.push(record);
          }
        });
        return merged;
      });
      setOffset(payload.offset ?? null);
    } catch (err) {
      const message = err instanceof Error ? err.message : "Unable to load updates";
      setError(message);
    } finally {
      setLoading(false);
      setInitialFetchComplete(true);
    }
  }, []);

  useEffect(() => {
    fetchPage();
  }, [fetchPage]);

  const initialLoading = !initialFetchComplete && loading;

  const emptyState = !initialLoading && !loading && !records.length && !error;

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold text-slate-900">JBV Updates</h1>
          <p className="text-sm text-slate-500">
            News and portfolio highlights curated for the Limited Partner portal.
          </p>
        </div>
        <span className="inline-flex items-center rounded-full bg-blue-50 px-3 py-1 text-xs font-semibold text-blue-600">
          Portal feed
        </span>
      </div>

      {error ? (
        <div className="rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-600">
          We couldn’t refresh the updates feed. Please try again shortly.
          <span className="ml-1 font-medium">({error})</span>
        </div>
      ) : null}

      {initialLoading ? (
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {Array.from({ length: 3 }).map((_, index) => (
            <div
              key={index}
              className="h-56 animate-pulse rounded-2xl bg-gradient-to-br from-slate-200/70 to-slate-100"
            />
          ))}
        </div>
      ) : null}

      {emptyState ? (
        <div className="flex flex-col items-center justify-center rounded-2xl border border-dashed border-slate-200 bg-white px-6 py-16 text-center">
          <Paperclip className="h-10 w-10 text-slate-300" />
          <h2 className="mt-4 text-lg font-semibold text-slate-800">No updates yet</h2>
          <p className="mt-2 max-w-md text-sm text-slate-500">
            Updates that are marked for the portal will appear here automatically. Check back soon for the latest news from JBV
            portfolio companies.
          </p>
        </div>
      ) : null}

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        <AnimatePresence>
          {records.map((record) => (
            <UpdateCard key={record.id} record={record} />
          ))}
        </AnimatePresence>
      </div>

      {offset ? (
        <div className="flex justify-center py-2">
          <button
            type="button"
            className="inline-flex items-center gap-2 rounded-full bg-blue-600 px-5 py-2 text-sm font-semibold text-white shadow transition hover:bg-blue-700 disabled:cursor-not-allowed disabled:bg-blue-400"
            onClick={() => fetchPage(offset)}
            disabled={loading}
          >
            {loading ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
                Loading
              </>
            ) : (
              "Load more"
            )}
          </button>
        </div>
      ) : null}
    </div>
  );
}

function UpdateCard({ record }: { record: AirtableRecord }) {
  const [expanded, setExpanded] = useState(false);

  const subject = stringFrom(field(record, "Subject")) ?? "Untitled update";
  const postDateRaw = stringFrom(field(record, "Post Date"));
  const formattedDate = postDateRaw ? formatDate(postDateRaw) : null;
  const typeValues = toStringArray(field(record, "Type"));
  const content = stringFrom(field(record, "Content"));
  const dataRoom = stringFrom(field(record, "Data Room"));
  const updatePdf = attachmentsFrom(field(record, "Update PDF"))[0];
  const contentAttachments = attachmentsFrom(field(record, "Content Att"));
  const partnerNames = toStringArray(field(record, "Partner Names"));
  const partnerList = toStringArray(field(record, "Partner List"));
  const partnerEmails = toStringArray(field(record, "Partner Emails"));
  const contacts = toStringArray(field(record, "Contacts"));
  const companyCandidates = toStringArray(field(record, "Company"));
  const company = companyCandidates.length ? companyCandidates[0] : stringFrom(field(record, "Company Name"));
  const logo = attachmentsFrom(field(record, "Logo"))[0];

  const partnerDisplay = partnerNames.length ? partnerNames : partnerList;
  const hasPeople = partnerDisplay.length || contacts.length || partnerEmails.length;

  const logoUrl = logo?.thumbnails?.small?.url || logo?.url;
  const fallbackInitials = initialsFrom(company || subject);

  return (
    <motion.article
      layout
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -8 }}
      whileHover={{ y: -4 }}
      transition={{ type: "spring", stiffness: 260, damping: 20 }}
      className="group flex h-full flex-col overflow-hidden rounded-2xl bg-white shadow-sm ring-1 ring-slate-200"
    >
      <div className="border-b border-slate-100 bg-slate-50/60 p-5">
        <div className="flex items-start gap-3">
          <div className="relative h-12 w-12 overflow-hidden rounded-xl bg-white shadow-inner ring-1 ring-slate-200">
            {logoUrl ? (
              <Image
                src={logoUrl}
                alt={company ? `${company} logo` : "Company logo"}
                fill
                sizes="48px"
                className="object-cover"
              />
            ) : (
              <div className="flex h-full w-full items-center justify-center bg-blue-50 text-sm font-semibold text-blue-600">
                {fallbackInitials}
              </div>
            )}
          </div>
          <div className="flex-1">
            <div className="flex flex-wrap items-center gap-2">
              {typeValues.map((value) => (
                <span
                  key={value}
                  className="inline-flex items-center rounded-full bg-white/70 px-2.5 py-1 text-[11px] font-semibold uppercase tracking-wide text-blue-600 shadow-sm ring-1 ring-blue-100"
                >
                  {value}
                </span>
              ))}
            </div>
            <h3 className="mt-2 text-base font-semibold text-slate-900">{subject}</h3>
            <div className="mt-2 flex flex-wrap items-center gap-2 text-xs text-slate-500">
              {formattedDate ? <span>{formattedDate}</span> : null}
              {company ? (
                <span className="inline-flex items-center gap-1 font-medium text-slate-600">
                  <span className="text-slate-400">•</span>
                  {company}
                </span>
              ) : null}
            </div>
          </div>
        </div>
      </div>

      <div className="flex flex-1 flex-col gap-4 p-5">
        {content ? (
          <div className="space-y-2">
            <AnimatePresence initial={false} mode="wait">
              {expanded ? (
                <motion.div
                  key="expanded"
                  initial={{ opacity: 0, height: 0 }}
                  animate={{ opacity: 1, height: "auto" }}
                  exit={{ opacity: 0, height: 0 }}
                  transition={{ duration: 0.25, ease: "easeOut" }}
                  className="overflow-hidden text-sm leading-6 text-slate-600 [&_a]:text-blue-600 [&_a]:underline"
                  dangerouslySetInnerHTML={{ __html: renderRichText(content) }}
                />
              ) : (
                <motion.p
                  key="collapsed"
                  initial={{ opacity: 0, y: -4 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: 4 }}
                  transition={{ duration: 0.2 }}
                  className="max-h-24 overflow-hidden text-sm leading-6 text-slate-600"
                >
                  {content}
                </motion.p>
              )}
            </AnimatePresence>
            <button
              type="button"
              onClick={() => setExpanded((prev) => !prev)}
              className="inline-flex items-center gap-2 text-sm font-semibold text-blue-600 transition hover:text-blue-700"
            >
              {expanded ? (
                <>
                  Hide summary
                  <ChevronUp className="h-4 w-4" aria-hidden="true" />
                </>
              ) : (
                <>
                  Read summary
                  <ChevronDown className="h-4 w-4" aria-hidden="true" />
                </>
              )}
            </button>
          </div>
        ) : null}

        {hasPeople ? (
          <div className="space-y-2">
            <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-slate-500">
              <Mail className="h-3.5 w-3.5" aria-hidden="true" />
              Partner team
            </div>
            <div className="flex flex-wrap gap-2">
              {partnerDisplay.map((name) => (
                <span
                  key={name}
                  className="inline-flex items-center gap-2 rounded-full bg-slate-100 px-3 py-1 text-xs font-medium text-slate-700 shadow-sm"
                >
                  <span className="flex h-6 w-6 items-center justify-center rounded-full bg-white text-[11px] font-semibold text-blue-600">
                    {initialsFrom(name)}
                  </span>
                  {name}
                </span>
              ))}
              {contacts.map((contact) => (
                <span
                  key={`contact-${contact}`}
                  className="inline-flex items-center gap-2 rounded-full bg-slate-100 px-3 py-1 text-xs font-medium text-slate-700 shadow-sm"
                >
                  <span className="flex h-6 w-6 items-center justify-center rounded-full bg-blue-50 text-[11px] font-semibold text-blue-600">
                    @
                  </span>
                  {contact}
                </span>
              ))}
              {partnerEmails.map((email) => (
                <a
                  key={`email-${email}`}
                  href={`mailto:${email}`}
                  className="inline-flex items-center gap-2 rounded-full bg-blue-50 px-3 py-1 text-xs font-medium text-blue-700 shadow-sm transition hover:bg-blue-100"
                >
                  <Mail className="h-3.5 w-3.5" aria-hidden="true" />
                  {email}
                </a>
              ))}
            </div>
          </div>
        ) : null}

        {(dataRoom || updatePdf || contentAttachments.length) ? (
          <div className="space-y-2">
            <div className="flex flex-wrap gap-2">
              {dataRoom ? (
                <a
                  href={ensureHttp(dataRoom)}
                  target="_blank"
                  rel="noreferrer noopener"
                  className="inline-flex items-center gap-2 rounded-full border border-blue-200 bg-blue-50 px-3 py-1.5 text-xs font-semibold text-blue-700 transition hover:bg-blue-100"
                >
                  <Folder className="h-3.5 w-3.5" aria-hidden="true" />
                  Data Room
                  <ExternalLink className="h-3 w-3" aria-hidden="true" />
                </a>
              ) : null}
              {updatePdf?.url ? (
                <a
                  href={updatePdf.url}
                  target="_blank"
                  rel="noreferrer noopener"
                  className="inline-flex items-center gap-2 rounded-full border border-slate-200 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700 transition hover:border-blue-300 hover:text-blue-700"
                >
                  <FileText className="h-3.5 w-3.5" aria-hidden="true" />
                  Update PDF
                  <ExternalLink className="h-3 w-3" aria-hidden="true" />
                </a>
              ) : null}
            </div>
            {contentAttachments.length ? (
              <div className="flex flex-wrap gap-2">
                {contentAttachments.map((attachment, index) => (
                  <a
                    key={`${attachment.url}-${index}`}
                    href={attachment.url}
                    download
                    className="inline-flex items-center gap-2 rounded-full bg-slate-100 px-3 py-1.5 text-xs font-medium text-slate-700 transition hover:bg-slate-200"
                  >
                    <Download className="h-3.5 w-3.5" aria-hidden="true" />
                    {attachment.filename || `Attachment ${index + 1}`}
                  </a>
                ))}
              </div>
            ) : null}
          </div>
        ) : null}
      </div>
    </motion.article>
  );
}
