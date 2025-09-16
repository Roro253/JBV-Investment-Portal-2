"use client";

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import type { ReactNode } from "react";
import ColumnManager, {
  type ColumnManagerColumn,
  type VisibilityRule,
} from "@/components/admin/ColumnManager";
import {
  ColumnDef,
  SortingState,
  flexRender,
  getCoreRowModel,
  useReactTable,
} from "@tanstack/react-table";
import { useVirtualizer } from "@tanstack/react-virtual";
import {
  ColumnLayoutState,
  getAttachments,
  getLinkedDisplay,
  mergeLayoutWithServerFields,
  normalizeFieldKey,
} from "@/lib/fields";
import {
  formatCurrencyUSD,
  formatNumber,
  formatPercent,
} from "@/lib/format";

const API_BASE = process.env.NEXT_PUBLIC_API_BASE || "";
const MAIN_TABLE = "Partner Investments";
const LOCAL_LAYOUT_KEY = "jbv:admin:layout:v1";
const PRIMARY_CONTACT_KEY = normalizeFieldKey("Primary Contact");
const SEARCH_KEYS = Array.from(
  new Set([
    normalizeFieldKey("Partner Investment"),
    normalizeFieldKey("Partner"),
    normalizeFieldKey("Fund"),
    normalizeFieldKey("Status"),
    normalizeFieldKey("Status (I)"),
    PRIMARY_CONTACT_KEY,
  ])
);

const dateFormatter = new Intl.DateTimeFormat("en-US", {
  month: "short",
  day: "numeric",
  year: "numeric",
});

const numberLikeCurrencyKeywords = [
  "nav",
  "commitment",
  "distribution",
  "cost",
  "fmv",
  "gain",
  "loss",
  "capital",
  "investment",
];

const percentKeywords = ["%", "percent", "irr", "rate"];

type AirtableRecord = {
  id: string;
  fields: Record<string, any>;
  _updatedTime?: string | null;
};

type FieldKind =
  | "text"
  | "number"
  | "currency"
  | "percent"
  | "date"
  | "checkbox"
  | "linked"
  | "attachments"
  | "unknown";

type ColumnMeta = {
  key: string;
  label: string;
  actualIds: string[];
  kind: FieldKind;
};

type CaseMap = Record<string, string[]>;

type ApiPayload = {
  records: AirtableRecord[];
  fieldOrder: string[];
  displayNameMap: Record<string, string>;
};

function looksLikeDate(value: any): boolean {
  if (typeof value !== "string") return false;
  if (!value) return false;
  if (/^\d{4}-\d{2}-\d{2}/.test(value) || /^\d{1,2}\/\d{1,2}\/\d{4}$/.test(value)) {
    const dt = new Date(value);
    return !isNaN(+dt);
  }
  if (value.includes("T") && !isNaN(+new Date(value))) return true;
  return false;
}

function inferFieldKind(label: string, sample: any): FieldKind {
  if (Array.isArray(sample)) {
    if (!sample.length) return "unknown";
    const first = sample[0];
    if (first && typeof first === "object" && ("url" in first || first?.url)) {
      return "attachments";
    }
    if (first && typeof first === "object" && ("displayName" in first || "fields" in first)) {
      return "linked";
    }
    if (typeof first === "string") {
      return "text";
    }
    return "unknown";
  }
  if (typeof sample === "boolean") return "checkbox";
  if (typeof sample === "number") {
    const lower = label.toLowerCase();
    if (percentKeywords.some((keyword) => lower.includes(keyword))) {
      return "percent";
    }
    if (numberLikeCurrencyKeywords.some((keyword) => lower.includes(keyword))) {
      return "currency";
    }
    return "number";
  }
  if (typeof sample === "string") {
    if (sample.trim().endsWith("%")) return "percent";
    if (looksLikeDate(sample)) return "date";
    return "text";
  }
  if (sample instanceof Date) return "date";
  return "unknown";
}

function getAccessorValue(raw: any, kind: FieldKind): any {
  if (raw === undefined || raw === null) return null;
  switch (kind) {
    case "linked":
      return getLinkedDisplay(raw).join(", ");
    case "attachments":
      return getAttachments(raw).length;
    case "checkbox":
      return raw ? 1 : 0;
    case "date": {
      const dt = new Date(raw);
      return isNaN(+dt) ? null : dt.getTime();
    }
    case "percent":
    case "currency":
    case "number": {
      const num = Number(raw);
      return Number.isFinite(num) ? num : null;
    }
    case "text":
    default:
      return String(raw);
  }
}

function formatDisplayValue(raw: any, kind: FieldKind): string {
  if (raw === undefined || raw === null || raw === "") return "—";
  switch (kind) {
    case "currency":
      return formatCurrencyUSD(raw);
    case "percent":
      return formatPercent(raw);
    case "number":
      return formatNumber(raw);
    case "date": {
      const dt = new Date(raw);
      return isNaN(+dt) ? "—" : dateFormatter.format(dt);
    }
    case "checkbox":
      return raw ? "Yes" : "No";
    case "linked":
      return getLinkedDisplay(raw).join(", ");
    case "attachments":
      return getAttachments(raw)
        .map((att) => att.name)
        .join(", ");
    default:
      return String(raw);
  }
}

function formatValueForCsv(raw: any, kind: FieldKind): string {
  if (raw === undefined || raw === null || raw === "") return "";
  switch (kind) {
    case "linked":
      return getLinkedDisplay(raw).join("; ");
    case "attachments":
      return getAttachments(raw)
        .map((att) => `${att.name}: ${att.url}`)
        .join("; ");
    case "currency":
      return formatCurrencyUSD(raw);
    case "percent":
      return formatPercent(raw);
    case "number":
      return formatNumber(raw);
    case "date": {
      const dt = new Date(raw);
      return isNaN(+dt) ? "" : dateFormatter.format(dt);
    }
    case "checkbox":
      return raw ? "true" : "false";
    default:
      return String(raw);
  }
}

function escapeCsv(value: string): string {
  if (value.includes(",") || value.includes("\n") || value.includes('"')) {
    return `"${value.replace(/"/g, '""')}"`;
  }
  return value;
}

function loadLayoutFromLocalStorage(): ColumnLayoutState | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(LOCAL_LAYOUT_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (!parsed || !Array.isArray(parsed.order) || typeof parsed.hidden !== "object") {
      return null;
    }
    return {
      order: parsed.order as string[],
      hidden: parsed.hidden as Record<string, boolean>,
    };
  } catch {
    return null;
  }
}

function persistLayout(layout: ColumnLayoutState) {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(LOCAL_LAYOUT_KEY, JSON.stringify(layout));
}

function getEditableFieldId(meta: ColumnMeta, record: AirtableRecord): string | undefined {
  for (const fieldId of meta.actualIds) {
    if (Object.prototype.hasOwnProperty.call(record.fields, fieldId)) {
      return fieldId;
    }
  }
  return meta.actualIds[0];
}

function getFieldValue(record: AirtableRecord, meta: ColumnMeta): any {
  for (const fieldId of meta.actualIds) {
    if (Object.prototype.hasOwnProperty.call(record.fields, fieldId)) {
      return record.fields[fieldId];
    }
  }
  return undefined;
}

function getValueFromCaseMap(record: AirtableRecord, key: string, caseMap: CaseMap): any {
  const candidates = caseMap[key] || [];
  for (const candidate of candidates) {
    if (Object.prototype.hasOwnProperty.call(record.fields, candidate)) {
      return record.fields[candidate];
    }
  }
  return undefined;
}

function Badge({ children }: { children: ReactNode }) {
  return (
    <span className="inline-flex items-center rounded-full border px-2 py-0.5 text-xs text-slate-700">
      {children}
    </span>
  );
}

function ChipList({ value }: { value: any }) {
  const labels = getLinkedDisplay(value);
  if (!labels.length) return <span className="text-sm text-gray-400">—</span>;
  return (
    <div className="flex flex-wrap gap-1">
      {labels.map((label) => (
        <Badge key={label}>{label}</Badge>
      ))}
    </div>
  );
}

function AttachmentList({ value }: { value: any }) {
  const attachments = getAttachments(value);
  if (!attachments.length) return <span className="text-sm text-gray-400">—</span>;
  return (
    <ul className="space-y-1">
      {attachments.map((attachment) => (
        <li key={attachment.url}>
          <a
            className="text-sm text-blue-600 underline"
            href={attachment.url}
            target="_blank"
            rel="noopener noreferrer"
          >
            {attachment.name}
          </a>
        </li>
      ))}
    </ul>
  );
}

type EditableBaseProps<T> = {
  value: T;
  onSave: (value: T) => Promise<void> | void;
  disabled?: boolean;
  display?: string;
};

function EditableTextCell({ value, onSave, disabled, display }: EditableBaseProps<string | null>) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(value ?? "");
  const [pending, setPending] = useState(false);

  useEffect(() => {
    setDraft(value ?? "");
  }, [value]);

  const shown = display ?? (value && value !== "" ? value : "—");

  const commit = useCallback(
    async (nextValue: string) => {
      if (pending) return;
      setPending(true);
      try {
        await onSave(nextValue === "" ? null : nextValue);
      } finally {
        setPending(false);
      }
      setEditing(false);
    },
    [onSave, pending]
  );

  if (disabled) {
    return <span className="text-sm text-slate-700">{shown}</span>;
  }

  if (!editing) {
    return (
      <button
        type="button"
        className="w-full text-left text-sm text-slate-700 hover:text-blue-600"
        onClick={() => setEditing(true)}
      >
        {shown}
      </button>
    );
  }

  return (
    <input
      className="w-full rounded border px-2 py-1 text-sm"
      value={draft}
      onChange={(e) => setDraft(e.target.value)}
      onBlur={() => commit(draft)}
      onKeyDown={(e) => {
        if (e.key === "Enter") commit(draft);
        if (e.key === "Escape") {
          setDraft(value ?? "");
          setEditing(false);
        }
      }}
      disabled={pending}
      autoFocus
    />
  );
}

function EditableNumberCell({ value, onSave, disabled, display }: EditableBaseProps<number | null>) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState<number | null>(value ?? null);
  const [pending, setPending] = useState(false);

  useEffect(() => {
    setDraft(value ?? null);
  }, [value]);

  const shown = display ?? (value === null || value === undefined ? "—" : String(value));

  const commit = useCallback(
    async (nextValue: number | null) => {
      if (pending) return;
      setPending(true);
      try {
        await onSave(nextValue);
      } finally {
        setPending(false);
      }
      setEditing(false);
    },
    [onSave, pending]
  );

  if (disabled) {
    return <span className="text-sm text-slate-700">{display ?? shown}</span>;
  }

  if (!editing) {
    return (
      <button
        type="button"
        className="w-full text-left text-sm text-slate-700 hover:text-blue-600"
        onClick={() => setEditing(true)}
      >
        {display ?? shown}
      </button>
    );
  }

  return (
    <input
      type="number"
      className="w-full rounded border px-2 py-1 text-sm"
      value={draft ?? ""}
      onChange={(e) => {
        const val = e.target.value;
        setDraft(val === "" ? null : Number(val));
      }}
      onBlur={() => commit(draft ?? null)}
      onKeyDown={(e) => {
        if (e.key === "Enter") commit(draft ?? null);
        if (e.key === "Escape") {
          setDraft(value ?? null);
          setEditing(false);
        }
      }}
      disabled={pending}
      autoFocus
    />
  );
}

function EditableDateCell({ value, onSave, disabled, display }: EditableBaseProps<string | null>) {
  const [pending, setPending] = useState(false);

  const inputValue = useMemo(() => {
    if (!value) return "";
    const dt = new Date(value);
    if (isNaN(+dt)) return "";
    return dt.toISOString().slice(0, 10);
  }, [value]);

  const commit = useCallback(
    async (nextValue: string) => {
      if (pending) return;
      setPending(true);
      try {
        await onSave(nextValue === "" ? null : nextValue);
      } finally {
        setPending(false);
      }
    },
    [onSave, pending]
  );

  if (disabled) {
    return <span className="text-sm text-slate-700">{display ?? "—"}</span>;
  }

  return (
    <input
      type="date"
      className="rounded border px-2 py-1 text-sm"
      value={inputValue}
      onChange={(e) => commit(e.target.value)}
      disabled={pending}
    />
  );
}

function EditableCheckboxCell({ value, onSave, disabled }: EditableBaseProps<boolean>) {
  const [pending, setPending] = useState(false);

  const handleChange = async (checked: boolean) => {
    if (pending) return;
    setPending(true);
    try {
      await onSave(checked);
    } finally {
      setPending(false);
    }
  };

  return (
    <input
      type="checkbox"
      className="h-4 w-4"
      checked={!!value}
      onChange={(e) => handleChange(e.target.checked)}
      disabled={disabled || pending}
    />
  );
}

export default function AdminPage() {
  const [records, setRecords] = useState<AirtableRecord[]>([]);
  const [fieldOrder, setFieldOrder] = useState<string[]>([]);
  const [displayNameMap, setDisplayNameMap] = useState<Record<string, string>>({});
  const [layout, setLayout] = useState<ColumnLayoutState | null>(null);
  const [query, setQuery] = useState("");
  const [status, setStatus] = useState("Idle");
  const [isLoading, setIsLoading] = useState(true);
  const [impersonation, setImpersonation] = useState<"Admin" | "LP" | "Partner">("Admin");
  const [rules, setRules] = useState<Record<string, VisibilityRule>>({});
  const [sorting, setSorting] = useState<SortingState>([
    { id: PRIMARY_CONTACT_KEY, desc: false },
  ]);

  const layoutLoadedRef = useRef(false);

  const fetchData = useCallback(async () => {
    try {
      setStatus("Refreshing…");
      const res = await fetch(`${API_BASE}/api/data`, { cache: "no-store" });
      if (!res.ok) {
        throw new Error(`Failed with status ${res.status}`);
      }
      const json = (await res.json()) as ApiPayload;
      setRecords(json.records || []);
      setFieldOrder(json.fieldOrder || []);
      setDisplayNameMap(json.displayNameMap || {});
      setStatus("Idle");
    } catch (err) {
      console.error("Failed to fetch data", err);
      setStatus("Error");
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    let cancelled = false;
    let lastFetch = 0;

    const tick = async () => {
      if (cancelled) return;
      const now = Date.now();
      if (now - lastFetch < 1000) return;
      lastFetch = now;
      await fetchData();
    };

    fetchData();
    const interval = setInterval(tick, 10000);
    if (typeof window !== "undefined") window.addEventListener("focus", tick);

    return () => {
      cancelled = true;
      clearInterval(interval);
      if (typeof window !== "undefined") window.removeEventListener("focus", tick);
    };
  }, [fetchData]);

  useEffect(() => {
    (async () => {
      try {
        const res = await fetch(`${API_BASE}/api/visibility/rules`, {
          cache: "no-store",
        });
        if (!res.ok) throw new Error(`Failed with status ${res.status}`);
        const arr = (await res.json()) as VisibilityRule[];
        const map: Record<string, VisibilityRule> = {};
        for (const rule of arr || []) {
          if (!rule?.fieldId) continue;
          const key = `${rule.tableId || MAIN_TABLE}:${rule.fieldId}`;
          map[key] = {
            ...rule,
            tableId: rule.tableId || MAIN_TABLE,
          };
        }
        setRules(map);
      } catch (err) {
        console.error("Failed to load visibility rules", err);
      }
    })();
  }, []);

  const caseMap: CaseMap = useMemo(() => {
    const map = new Map<string, Set<string>>();
    const add = (fieldName: string) => {
      const normalized = normalizeFieldKey(fieldName);
      if (!normalized) return;
      if (!map.has(normalized)) map.set(normalized, new Set());
      map.get(normalized)!.add(fieldName);
    };

    fieldOrder.forEach(add);
    for (const record of records) {
      Object.keys(record.fields || {}).forEach(add);
    }

    const result: CaseMap = {};
    for (const [key, value] of map.entries()) {
      result[key] = Array.from(value);
    }
    return result;
  }, [fieldOrder, records]);

  const allNormalizedKeys = useMemo(() => {
    const seen = new Set<string>();
    const ordered: string[] = [];

    const push = (fieldName: string) => {
      const normalized = normalizeFieldKey(fieldName);
      if (!normalized || seen.has(normalized)) return;
      seen.add(normalized);
      ordered.push(normalized);
    };

    fieldOrder.forEach(push);
    for (const record of records) {
      Object.keys(record.fields || {}).forEach(push);
    }

    return ordered;
  }, [fieldOrder, records]);

  useEffect(() => {
    if (!allNormalizedKeys.length) return;
    setLayout((prev) => {
      let base = prev;
      if (!layoutLoadedRef.current) {
        base = loadLayoutFromLocalStorage() || prev;
      }
      const merged = mergeLayoutWithServerFields(allNormalizedKeys, base);
      return merged;
    });
    layoutLoadedRef.current = true;
  }, [allNormalizedKeys]);

  useEffect(() => {
    if (!layout) return;
    persistLayout(layout);
  }, [layout]);

  const fallbackLayout = useMemo(
    () => mergeLayoutWithServerFields(allNormalizedKeys, null),
    [allNormalizedKeys]
  );

  const activeLayout = layout ?? fallbackLayout;

  const columnMetas = useMemo<ColumnMeta[]>(() => {
    if (!allNormalizedKeys.length) return [];

    const builders = new Map<string, { actualIds: Set<string>; samples: any[] }>();
    const orderIndex = new Map<string, number>();
    fieldOrder.forEach((field, idx) => orderIndex.set(field, idx));

    const addField = (fieldName: string, value: any) => {
      const normalized = normalizeFieldKey(fieldName);
      if (!normalized) return;
      if (!builders.has(normalized)) {
        builders.set(normalized, { actualIds: new Set(), samples: [] });
      }
      const builder = builders.get(normalized)!;
      builder.actualIds.add(fieldName);
      if (
        value !== undefined &&
        value !== null &&
        (!Array.isArray(value) || value.length > 0)
      ) {
        builder.samples.push(value);
      }
    };

    fieldOrder.forEach((fieldName) => addField(fieldName, undefined));
    for (const record of records) {
      for (const [fieldName, value] of Object.entries(record.fields || {})) {
        addField(fieldName, value);
      }
    }

    const metas: ColumnMeta[] = [];
    for (const [key, builder] of builders.entries()) {
      const actualIds = Array.from(builder.actualIds).sort((a, b) => {
        const idxA = orderIndex.has(a) ? orderIndex.get(a)! : Number.MAX_SAFE_INTEGER;
        const idxB = orderIndex.has(b) ? orderIndex.get(b)! : Number.MAX_SAFE_INTEGER;
        if (idxA !== idxB) return idxA - idxB;
        return a.localeCompare(b);
      });
      const preferredId = actualIds[0];
      const sample = builder.samples.find((value) => {
        if (value === undefined || value === null) return false;
        if (Array.isArray(value)) return value.length > 0;
        return true;
      });
      let label = preferredId || key;
      for (const candidate of actualIds) {
        if (displayNameMap[candidate]) {
          label = displayNameMap[candidate];
          break;
        }
      }
      const kind = inferFieldKind(label, sample);
      metas.push({ key, label, actualIds, kind });
    }

    metas.sort((a, b) => {
      const idxA = allNormalizedKeys.indexOf(a.key);
      const idxB = allNormalizedKeys.indexOf(b.key);
      return idxA - idxB;
    });

    return metas;
  }, [allNormalizedKeys, displayNameMap, fieldOrder, records]);

  const columnMetaMap = useMemo(() => {
    const map = new Map<string, ColumnMeta>();
    for (const meta of columnMetas) map.set(meta.key, meta);
    return map;
  }, [columnMetas]);

  const columnManagerColumns: ColumnManagerColumn[] = useMemo(
    () => columnMetas.map((meta) => ({ key: meta.key, label: meta.label, fieldIds: meta.actualIds })),
    [columnMetas]
  );

  const isFieldAllowedForRole = useCallback(
    (key: string) => {
      if (impersonation === "Admin") return true;
      const meta = columnMetaMap.get(key);
      if (!meta) return true;
      const ids = meta.actualIds.length ? meta.actualIds : [meta.label];
      return ids.some((fieldId) => {
        const rule = rules[`${MAIN_TABLE}:${fieldId}`];
        if (!rule) return true;
        return impersonation === "LP" ? !!rule.visibleToLP : !!rule.visibleToPartners;
      });
    },
    [columnMetaMap, impersonation, rules]
  );

  const visibleKeys = useMemo(() => {
    const visible = activeLayout.order.filter((key) => !activeLayout.hidden[key]);
    return visible.filter((key) => isFieldAllowedForRole(key));
  }, [activeLayout, isFieldAllowedForRole]);

  const filteredRecords = useMemo(() => {
    if (!query) return records;
    const q = query.toLowerCase();
    return records.filter((record) => {
      const haystack: string[] = [];
      for (const key of SEARCH_KEYS) {
        const meta = columnMetaMap.get(key);
        let raw = meta ? getFieldValue(record, meta) : getValueFromCaseMap(record, key, caseMap);
        if (meta?.kind === "linked") {
          haystack.push(getLinkedDisplay(raw).join(" "));
        } else {
          const display = meta ? formatDisplayValue(raw, meta.kind) : raw;
          if (display && typeof display === "string") haystack.push(display);
        }
      }
      return haystack.join(" ").toLowerCase().includes(q);
    });
  }, [records, query, columnMetaMap, caseMap]);

  const saveField = useCallback(
    async (record: AirtableRecord, fieldId: string | undefined, value: any) => {
      if (!fieldId) return;
      try {
        const body = {
          tableIdOrName: MAIN_TABLE,
          recordId: record.id,
          fields: { [fieldId]: value },
          lastSeenModifiedTime: record._updatedTime || null,
        };
        const res = await fetch(`${API_BASE}/api/record`, {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
        });
        if (!res.ok) throw new Error(`Failed with status ${res.status}`);
        const updated = (await res.json()) as AirtableRecord;
        setRecords((prev) =>
          prev.map((row) => {
            if (row.id !== record.id) return row;
            const mergedFields: Record<string, any> = { ...(updated.fields || {}) };
            const previousFields = row.fields || {};
            for (const [key, previous] of Object.entries(previousFields)) {
              const nextVal = mergedFields[key];
              if (
                Array.isArray(nextVal) &&
                nextVal.length > 0 &&
                typeof nextVal[0] === "string" &&
                Array.isArray(previous) &&
                previous.length > 0 &&
                typeof previous[0] === "object"
              ) {
                mergedFields[key] = previous;
              }
              if (!(key in mergedFields)) {
                mergedFields[key] = previous;
              }
            }
            return { ...row, ...updated, fields: mergedFields };
          })
        );
      } catch (err) {
        console.error("Failed to save field", err);
        alert("Failed to save field. Please try again.");
      }
    },
    []
  );

  const columnDefs = useMemo<ColumnDef<AirtableRecord>[]>(() => {
    return visibleKeys
      .map((key) => {
        const meta = columnMetaMap.get(key);
        if (!meta) return null;
        return {
          id: key,
          header: meta.label,
          accessorFn: (record: AirtableRecord) => {
            const raw = getFieldValue(record, meta);
            return getAccessorValue(raw, meta.kind);
          },
          cell: (ctx) => {
            const record = ctx.row.original as AirtableRecord;
            const raw = getFieldValue(record, meta);
            const display = formatDisplayValue(raw, meta.kind);
            const fieldId = getEditableFieldId(meta, record);
            const canEdit =
              impersonation === "Admin" &&
              ["text", "number", "currency", "percent", "date", "checkbox"].includes(meta.kind) &&
              !!fieldId;

            if (meta.kind === "linked") {
              return <ChipList value={raw} />;
            }
            if (meta.kind === "attachments") {
              return <AttachmentList value={raw} />;
            }
            if (!canEdit) {
              return <span className="text-sm text-slate-700">{display}</span>;
            }

            switch (meta.kind) {
              case "checkbox":
                return (
                  <EditableCheckboxCell
                    value={!!raw}
                    onSave={(val) => saveField(record, fieldId, val)}
                    disabled={false}
                  />
                );
              case "date":
                return (
                  <EditableDateCell
                    value={raw ?? null}
                    display={display}
                    onSave={(val) => saveField(record, fieldId, val)}
                    disabled={false}
                  />
                );
              case "currency":
              case "percent":
              case "number": {
                const numericValue =
                  raw === null || raw === undefined
                    ? null
                    : typeof raw === "number"
                    ? raw
                    : Number(raw);
                return (
                  <EditableNumberCell
                    value={Number.isFinite(numericValue ?? NaN) ? numericValue : null}
                    display={display}
                    onSave={(val) => saveField(record, fieldId, val)}
                    disabled={false}
                  />
                );
              }
              case "text":
              default:
                return (
                  <EditableTextCell
                    value={raw ?? null}
                    display={display}
                    onSave={(val) => saveField(record, fieldId, val)}
                    disabled={false}
                  />
                );
            }
          },
        } as ColumnDef<AirtableRecord>;
      })
      .filter(Boolean) as ColumnDef<AirtableRecord>[];
  }, [visibleKeys, columnMetaMap, impersonation, saveField]);

  const table = useReactTable({
    data: filteredRecords,
    columns: columnDefs,
    state: { sorting },
    onSortingChange: setSorting,
    getCoreRowModel: getCoreRowModel(),
    autoResetSorting: false,
  });

  const tableContainerRef = useRef<HTMLDivElement>(null);
  const rowModel = table.getRowModel().rows;
  const rowVirtualizer = useVirtualizer({
    count: rowModel.length,
    getScrollElement: () => tableContainerRef.current,
    estimateSize: () => 52,
    overscan: 12,
    getItemKey: (index) => rowModel[index]?.id ?? index,
  });
  const virtualRows = rowVirtualizer.getVirtualItems();
  const paddingTop = virtualRows.length > 0 ? virtualRows[0].start : 0;
  const paddingBottom =
    virtualRows.length > 0
      ? rowVirtualizer.getTotalSize() - virtualRows[virtualRows.length - 1].end
      : 0;

  const handleExport = useCallback(() => {
    const rowsToExport = table.getRowModel().rows;
    if (!rowsToExport.length) return;
    const headers = visibleKeys.map((key) => columnMetaMap.get(key)?.label ?? key);
    const csv: string[] = [headers.map(escapeCsv).join(",")];

    for (const row of rowsToExport) {
      const record = row.original as AirtableRecord;
      const values = visibleKeys.map((key) => {
        const meta = columnMetaMap.get(key);
        if (!meta) return "";
        const raw = getFieldValue(record, meta);
        const text = formatValueForCsv(raw, meta.kind);
        return escapeCsv(text);
      });
      csv.push(values.join(","));
    }

    const blob = new Blob([csv.join("\n")], {
      type: "text/csv;charset=utf-8;",
    });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = `partner-investments-${Date.now()}.csv`;
    anchor.click();
    URL.revokeObjectURL(url);
  }, [table, visibleKeys, columnMetaMap]);

  const recordCount = filteredRecords.length;

  return (
    <div className="min-h-screen bg-white text-slate-900">
      <header className="sticky top-0 z-10 border-b bg-white/90 backdrop-blur">
        <div className="mx-auto flex max-w-7xl items-center gap-4 px-6 py-4">
          <div className="flex items-center gap-2">
            <div className="h-7 w-7 rounded bg-[#2563EB]" />
            <h1 className="text-xl font-semibold">JBV Investment Platform</h1>
            <span className="text-gray-400">·</span>
            <span className="text-slate-600">Admin · Partner Investments</span>
          </div>
          <div className="ml-auto flex items-center gap-3">
            <select
              className="rounded-lg border px-2 py-1"
              value={impersonation}
              onChange={(e) => setImpersonation(e.target.value as any)}
              title="Impersonation Preview"
            >
              <option>Admin</option>
              <option>LP</option>
              <option>Partner</option>
            </select>
            <span className="text-sm text-gray-500">Refresh: {status}</span>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-7xl px-6 py-6">
        <div className="mb-4 flex flex-wrap items-center gap-3">
          <input
            placeholder="Search partner, fund, status…"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            className="w-full rounded-xl border px-3 py-2 shadow-sm focus:outline-none focus:ring-2 focus:ring-blue-200 md:w-96"
          />
          <span className="rounded-full bg-blue-50 px-3 py-1 text-sm text-blue-700">
            {recordCount} records
          </span>
          <button
            type="button"
            className="rounded-lg border bg-white px-3 py-2 text-sm font-medium text-slate-700 shadow-sm hover:bg-blue-50"
            onClick={handleExport}
            disabled={!recordCount}
          >
            Export CSV
          </button>
          {columnManagerColumns.length > 0 && (
            <ColumnManager
              tableId={MAIN_TABLE}
              layout={activeLayout}
              onLayoutChange={setLayout}
              columns={columnManagerColumns}
              rules={rules}
              onChangeRules={setRules}
            />
          )}
        </div>

        <div className="overflow-hidden rounded-2xl border shadow-sm">
          <div ref={tableContainerRef} className="max-h-[70vh] overflow-auto">
            <table className="min-w-full border-collapse">
              <thead className="sticky top-0 z-10 bg-blue-50">
                {table.getHeaderGroups().map((headerGroup) => (
                  <tr key={headerGroup.id}>
                    {headerGroup.headers.map((header) => (
                      <th
                        key={header.id}
                        className="border-b px-3 py-2 text-left text-sm font-medium text-slate-700"
                      >
                        {header.isPlaceholder
                          ? null
                          : flexRender(header.column.columnDef.header, header.getContext())}
                      </th>
                    ))}
                  </tr>
                ))}
              </thead>
              <tbody>
                {isLoading ? (
                  <tr>
                    <td
                      colSpan={table.getVisibleLeafColumns().length || 1}
                      className="px-3 py-10 text-center text-gray-400"
                    >
                      Loading…
                    </td>
                  </tr>
                ) : rowModel.length === 0 ? (
                  <tr>
                    <td
                      colSpan={table.getVisibleLeafColumns().length || 1}
                      className="px-3 py-10 text-center text-gray-400"
                    >
                      No records
                    </td>
                  </tr>
                ) : (
                  <>
                    {paddingTop > 0 && (
                      <tr>
                        <td
                          style={{ height: paddingTop }}
                          colSpan={table.getVisibleLeafColumns().length || 1}
                        />
                      </tr>
                    )}
                    {virtualRows.map((virtualRow) => {
                      const row = rowModel[virtualRow.index];
                      return (
                        <tr
                          key={row.id}
                          ref={(node) => rowVirtualizer.measureElement(node)}
                          className="hover:bg-blue-50/40"
                        >
                          {row.getVisibleCells().map((cell) => (
                            <td key={cell.id} className="border-b px-3 py-2 text-sm align-top">
                              {flexRender(cell.column.columnDef.cell, cell.getContext())}
                            </td>
                          ))}
                        </tr>
                      );
                    })}
                    {paddingBottom > 0 && (
                      <tr>
                        <td
                          style={{ height: paddingBottom }}
                          colSpan={table.getVisibleLeafColumns().length || 1}
                        />
                      </tr>
                    )}
                  </>
                )}
              </tbody>
            </table>
          </div>
        </div>
      </main>
    </div>
  );
}

