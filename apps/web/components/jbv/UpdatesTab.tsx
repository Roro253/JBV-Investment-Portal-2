"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import {
  ChevronDown,
  ChevronUp,
  Download,
  ExternalLink,
  FileText,
  Folder,
  Mail,
  Paperclip,
} from "lucide-react";

type AirtableAttachment = {
  url: string;
  filename?: string;
  type?: string;
  size?: number;
  thumbnails?: { small?: { url?: string }; large?: { url?: string } };
};

type AirtableRecord = {
  id: string;
  fields: Record<string, any>;
};

type AirtableResponse = {
  records: AirtableRecord[];
  offset?: string;
};

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

const field = (record: AirtableRecord, name: string) => record.fields?.[name];

const ensureHttp = (value?: string | null) => {
  if (!value) return undefined;
  if (/^https?:\/\//i.test(value)) return value;
  return `https://${value}`;
};

const toTextArray = (value: unknown): string[] => {
  if (!value) return [];
  if (Array.isArray(value)) {
    return value
      .map((item) => {
        if (item === null || item === undefined) return "";
        if (typeof item === "string") return item;
        if (typeof item === "object") {
          if ("name" in item && typeof (item as any).name === "string") {
            return (item as any).name as string;
          }
          if ("displayName" in item && typeof (item as any).displayName === "string") {
            return (item as any).displayName as string;
          }
          if ("email" in item && typeof (item as any).email === "string") {
            return (item as any).email as string;
          }
        }
        return String(item);
      })
      .filter((item) => item && item.trim())
      .map((item) => item.trim());
  }
  if (typeof value === "string") return value.trim() ? [value.trim()] : [];
  return [];
};

const initialsFromName = (name?: string) => {
  if (!name) return "JB";
  const parts = name
    .split(/\s+/)
    .map((part) => part.trim())
    .filter(Boolean);
  if (!parts.length) return name.slice(0, 2).toUpperCase() || "JB";
  const [first, last] = [parts[0], parts.length > 1 ? parts[parts.length - 1] : ""];
  return `${first?.[0] ?? ""}${last?.[0] ?? ""}`.toUpperCase() || (parts[0]?.slice(0, 2) ?? "JB").toUpperCase();
};

const renderPlainText = (value: string) => {
  const safe = value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
  const linkified = safe.replace(
    /(https?:\/\/[^\s]+)/g,
    '<a class="text-blue-600 underline decoration-blue-200 transition hover:text-blue-700" target="_blank" rel="noreferrer noopener" href="$1">$1</a>',
  );
  const withBreaks = linkified
    .replace(/\r?\n\r?\n/g, "</p><p>")
    .replace(/\r?\n/g, "<br />");
  return `<p>${withBreaks}</p>`;
};

const resolveCompanyName = (record: AirtableRecord) => {
  const candidates = ["Company", "Company Name", "Startup", "Company Display", "Send Update"];
  for (const key of candidates) {
    const raw = field(record, key);
    if (!raw) continue;
    if (typeof raw === "string" && raw.trim()) return raw.trim();
    if (Array.isArray(raw)) {
      for (const entry of raw) {
        if (!entry) continue;
        if (typeof entry === "string" && entry.trim()) return entry.trim();
        if (typeof entry === "object") {
          if ("name" in entry && typeof (entry as any).name === "string") {
            return (entry as any).name as string;
          }
          if ("displayName" in entry && typeof (entry as any).displayName === "string") {
            return (entry as any).displayName as string;
          }
          if ("fields" in entry && typeof (entry as any).fields === "object" && (entry as any).fields) {
            const nested = (entry as any).fields as Record<string, any>;
            const nestedKeys = ["Name", "Company Name", "Title"];
            for (const nestedKey of nestedKeys) {
              const nestedValue = nested[nestedKey];
              if (typeof nestedValue === "string" && nestedValue.trim()) {
                return nestedValue.trim();
              }
            }
          }
        }
      }
    }
  }
  return "";
};

const getLogo = (record: AirtableRecord): AirtableAttachment | undefined => {
  const logoField = field(record, "Logo");
  if (Array.isArray(logoField) && logoField.length > 0) {
    const attachment = logoField[0];
    if (attachment && typeof attachment === "object" && "url" in attachment) {
      return attachment as AirtableAttachment;
    }
  }
  return undefined;
};

const getPreviewText = (value?: string) => {
  if (!value) return "";
  const trimmed = value.trim();
  if (trimmed.length <= 180) return trimmed;
  return `${trimmed.slice(0, 177)}...`;
};

const createSkeletonArray = (count: number) => Array.from({ length: count }, (_, index) => index);

export default function UpdatesTab() {
  const [records, setRecords] = useState<AirtableRecord[]>([]);
  const [offset, setOffset] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchPage = useCallback(async (cursor?: string) => {
    try {
      setLoading(true);
      setError(null);
      const query = cursor ? `?offset=${encodeURIComponent(cursor)}` : "";
      const response = await fetch(`/api/jbv/updates${query}`, {
        cache: "no-store",
      });
      const text = await response.text();
      if (!response.ok) {
        try {
          const parsed = JSON.parse(text);
          const messageCandidate =
            parsed?.detail?.error?.message ?? parsed?.detail?.error ?? parsed?.error ?? text;
          const message =
            typeof messageCandidate === "string"
              ? messageCandidate
              : JSON.stringify(messageCandidate);
          throw new Error(message || "Airtable request failed");
        } catch {
          throw new Error(text || "Airtable request failed");
        }
      }
      const data = JSON.parse(text) as AirtableResponse;
      setRecords((previous) => (cursor ? [...previous, ...(data.records || [])] : data.records || []));
      setOffset(data.offset ?? null);
    } catch (err: any) {
      setError(err?.message || "Unable to load updates");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchPage();
  }, [fetchPage]);

  const isInitialLoading = loading && records.length === 0;

  return (
    <div className="space-y-8">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div className="space-y-1">
          <p className="text-xs font-semibold uppercase tracking-[0.35em] text-blue-600">Investor Communications</p>
          <h1 className="text-3xl font-semibold text-slate-900">JBV Updates</h1>
          <p className="text-sm text-slate-500">
            Stay current with the latest updates curated for limited partners.
          </p>
        </div>
        <span className="inline-flex h-fit items-center gap-2 rounded-full border border-blue-100 bg-blue-50 px-4 py-1 text-xs font-semibold text-blue-700 shadow-sm">
          Portal feed
        </span>
      </div>

      {error ? (
        <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          {error}
        </div>
      ) : null}

      {isInitialLoading ? (
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {createSkeletonArray(6).map((item) => (
            <div
              key={item}
              className="h-72 rounded-3xl border border-slate-200 bg-white p-6 shadow-sm"
            >
              <div className="flex h-full flex-col gap-4 animate-pulse">
                <div className="flex items-start gap-3">
                  <div className="h-12 w-12 rounded-2xl bg-slate-200" />
                  <div className="flex-1 space-y-2">
                    <div className="h-4 w-3/5 rounded bg-slate-200" />
                    <div className="h-3 w-2/5 rounded bg-slate-200" />
                  </div>
                </div>
                <div className="h-3 w-full rounded bg-slate-200" />
                <div className="h-3 w-4/5 rounded bg-slate-200" />
                <div className="mt-auto h-8 w-28 rounded-full bg-slate-200" />
              </div>
            </div>
          ))}
        </div>
      ) : (
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          <AnimatePresence mode="popLayout">
            {records.map((record) => (
              <UpdateCard key={record.id} record={record} />
            ))}
          </AnimatePresence>
        </div>
      )}

      {!loading && records.length === 0 && !error ? (
        <div className="rounded-2xl border border-slate-200 bg-white px-6 py-12 text-center text-sm text-slate-500 shadow-sm">
          No updates are available yet. Check back soon for new activity.
        </div>
      ) : null}

      <div className="flex justify-center">
        {offset ? (
          <motion.button
            whileTap={{ scale: 0.97 }}
            whileHover={{ y: -1 }}
            type="button"
            onClick={() => fetchPage(offset)}
            disabled={loading}
            className="inline-flex items-center gap-2 rounded-full border border-slate-200 bg-white px-5 py-2 text-sm font-semibold text-slate-700 shadow-sm transition hover:border-blue-200 hover:text-blue-700 hover:shadow-md disabled:cursor-not-allowed disabled:opacity-60"
          >
            {loading ? "Loading…" : "Load more"}
          </motion.button>
        ) : null}
      </div>
    </div>
  );
}

function UpdateCard({ record }: { record: AirtableRecord }) {
  const [expanded, setExpanded] = useState(false);

  const logo = useMemo(() => getLogo(record), [record]);
  const subject = field(record, "Subject") as string | undefined;
  const typeList = toTextArray(field(record, "Type"));
  const postDate = field(record, "Post Date") as string | undefined;
  const companyName = useMemo(() => resolveCompanyName(record), [record]);
  const content = field(record, "Content") as string | undefined;
  const dataRoom = ensureHttp(field(record, "Data Room") as string | undefined);
  const updatePdf = (() => {
    const attachments = field(record, "Update PDF");
    if (Array.isArray(attachments) && attachments.length > 0) {
      const candidate = attachments[0];
      if (candidate && typeof candidate === "object" && "url" in candidate) {
        return candidate as AirtableAttachment;
      }
    }
    return undefined;
  })();
  const contentAttachments = useMemo(() => {
    const attachments = field(record, "Content Att");
    if (Array.isArray(attachments)) {
      return attachments.filter((item): item is AirtableAttachment => Boolean(item && typeof item === "object" && "url" in item));
    }
    return [];
  }, [record]);
  const partnerNames = toTextArray(field(record, "Partner Names"));
  const partnerEmails = toTextArray(field(record, "Partner Emails"));
  const contactNames = toTextArray(field(record, "Contacts"));
  const partnerList = toTextArray(field(record, "Partner List"));

  const preview = useMemo(() => getPreviewText(content), [content]);

  const summaryHtml = useMemo(() => (content ? renderPlainText(content) : null), [content]);

  const showPartnerSection = partnerNames.length > 0 || partnerEmails.length > 0 || partnerList.length > 0 || contactNames.length > 0;

  return (
    <motion.article
      layout
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -12 }}
      whileHover={{ y: -4 }}
      className="group h-full"
    >
      <div className="flex h-full flex-col overflow-hidden rounded-3xl border border-slate-200 bg-white shadow-sm transition-shadow group-hover:shadow-xl">
        <div className="flex items-start gap-4 border-b border-slate-100 px-6 py-5">
          <CompanyAvatar logo={logo} companyName={companyName} />
          <div className="flex-1 space-y-2">
            <div className="flex flex-wrap items-start gap-2">
              <h2 className="text-base font-semibold leading-5 text-slate-900">
                {subject || "Untitled update"}
              </h2>
              {typeList.map((item) => (
                <span
                  key={item}
                  className="inline-flex items-center rounded-full border border-blue-100 bg-blue-50 px-2.5 py-0.5 text-[11px] font-semibold uppercase tracking-wide text-blue-700"
                >
                  {item}
                </span>
              ))}
            </div>
            <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-slate-500">
              {postDate ? <span>{formatDate(postDate)}</span> : null}
              {companyName ? <span className="font-medium text-slate-600">{companyName}</span> : null}
            </div>
          </div>
        </div>
        <div className="flex flex-1 flex-col gap-4 px-6 py-5">
          {preview && (
            <div className="space-y-2">
              <p className="text-sm text-slate-600">{preview}</p>
              <motion.button
                type="button"
                whileTap={{ scale: 0.97 }}
                onClick={() => setExpanded((previous) => !previous)}
                className="inline-flex items-center gap-1 text-sm font-semibold text-blue-600 transition hover:text-blue-700"
              >
                {expanded ? (
                  <>
                    Hide summary <ChevronUp className="h-4 w-4" />
                  </>
                ) : (
                  <>
                    Read full summary <ChevronDown className="h-4 w-4" />
                  </>
                )}
              </motion.button>
              <AnimatePresence initial={false}>
                {expanded && summaryHtml ? (
                  <motion.div
                    key="summary"
                    initial={{ height: 0, opacity: 0 }}
                    animate={{ height: "auto", opacity: 1 }}
                    exit={{ height: 0, opacity: 0 }}
                    className="overflow-hidden"
                  >
                    <div
                      className="space-y-2 text-sm leading-relaxed text-slate-600 [&_a]:text-blue-600 [&_a]:underline [&_a:hover]:text-blue-700"
                      dangerouslySetInnerHTML={{ __html: summaryHtml }}
                    />
                  </motion.div>
                ) : null}
              </AnimatePresence>
            </div>
          )}

          {showPartnerSection ? (
            <div className="space-y-2">
              <span className="text-xs font-semibold uppercase tracking-[0.25em] text-slate-400">
                Partner Team
              </span>
              <div className="flex flex-wrap gap-2">
                {partnerNames.map((name) => (
                  <div
                    key={name}
                    title={name}
                    className="inline-flex items-center gap-2 rounded-full border border-slate-200 bg-slate-50 px-3 py-1 text-xs font-medium text-slate-600"
                  >
                    <span className="flex h-6 w-6 items-center justify-center rounded-full bg-blue-600 text-[11px] font-semibold text-white">
                      {initialsFromName(name)}
                    </span>
                    {name}
                  </div>
                ))}
                {contactNames
                  .filter((name) => !partnerNames.includes(name))
                  .map((name) => (
                    <div
                      key={`contact-${name}`}
                      title={name}
                      className="inline-flex items-center gap-2 rounded-full border border-slate-200 bg-slate-50 px-3 py-1 text-xs font-medium text-slate-600"
                    >
                      <span className="flex h-6 w-6 items-center justify-center rounded-full bg-slate-300 text-[11px] font-semibold text-slate-700">
                        {initialsFromName(name)}
                      </span>
                      {name}
                    </div>
                  ))}
                {partnerList
                  .filter((name) => !partnerNames.includes(name) && !contactNames.includes(name))
                  .map((name) => (
                    <div
                      key={`list-${name}`}
                      title={name}
                      className="inline-flex items-center gap-2 rounded-full border border-slate-200 bg-slate-50 px-3 py-1 text-xs font-medium text-slate-600"
                    >
                      <span className="flex h-6 w-6 items-center justify-center rounded-full bg-blue-100 text-[11px] font-semibold text-blue-600">
                        <Paperclip className="h-3 w-3" />
                      </span>
                      {name}
                    </div>
                  ))}
                {partnerEmails.map((email) => (
                  <a
                    key={email}
                    href={`mailto:${email}`}
                    className="inline-flex items-center gap-2 rounded-full border border-blue-100 bg-blue-50 px-3 py-1 text-xs font-semibold text-blue-700 transition hover:border-blue-200 hover:bg-blue-100"
                  >
                    <Mail className="h-3.5 w-3.5" />
                    {email}
                  </a>
                ))}
              </div>
            </div>
          ) : null}

          {(dataRoom || updatePdf || contentAttachments.length > 0) && (
            <div className="space-y-2">
              <span className="text-xs font-semibold uppercase tracking-[0.25em] text-slate-400">
                Resources
              </span>
              <div className="flex flex-wrap gap-2">
                {dataRoom ? (
                  <motion.a
                    whileTap={{ scale: 0.97 }}
                    whileHover={{ y: -1 }}
                    href={dataRoom}
                    target="_blank"
                    rel="noreferrer noopener"
                    className="inline-flex items-center gap-2 rounded-full border border-slate-200 bg-white px-3 py-1.5 text-sm font-semibold text-slate-700 shadow-sm transition hover:border-blue-200 hover:text-blue-700 hover:shadow-md"
                  >
                    <Folder className="h-4 w-4" />
                    Data Room
                    <ExternalLink className="h-3.5 w-3.5" />
                  </motion.a>
                ) : null}
                {updatePdf?.url ? (
                  <motion.a
                    whileTap={{ scale: 0.97 }}
                    whileHover={{ y: -1 }}
                    href={updatePdf.url}
                    target="_blank"
                    rel="noreferrer noopener"
                    className="inline-flex items-center gap-2 rounded-full border border-slate-200 bg-white px-3 py-1.5 text-sm font-semibold text-slate-700 shadow-sm transition hover:border-blue-200 hover:text-blue-700 hover:shadow-md"
                  >
                    <FileText className="h-4 w-4" />
                    Update PDF
                    <ExternalLink className="h-3.5 w-3.5" />
                  </motion.a>
                ) : null}
                {contentAttachments.map((attachment, index) => (
                  <motion.a
                    whileTap={{ scale: 0.97 }}
                    whileHover={{ y: -1 }}
                    key={`${attachment.url}-${index}`}
                    href={attachment.url}
                    download={attachment.filename}
                    className="inline-flex items-center gap-2 rounded-full border border-slate-200 bg-white px-3 py-1.5 text-sm font-semibold text-slate-700 shadow-sm transition hover:border-blue-200 hover:text-blue-700 hover:shadow-md"
                  >
                    <Download className="h-4 w-4" />
                    {attachment.filename || `Attachment ${index + 1}`}
                  </motion.a>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>
    </motion.article>
  );
}

function CompanyAvatar({ logo, companyName }: { logo?: AirtableAttachment; companyName: string }) {
  const imageUrl = logo?.thumbnails?.small?.url || logo?.url;
  const initials = initialsFromName(companyName);
  return (
    <div className="relative flex h-12 w-12 items-center justify-center overflow-hidden rounded-2xl border border-slate-200 bg-slate-50 text-sm font-semibold text-slate-600">
      {imageUrl ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={imageUrl}
          alt={companyName ? `${companyName} logo` : "Company logo"}
          className="h-full w-full object-cover"
        />
      ) : (
        <span>{initials}</span>
      )}
    </div>
  );
}
