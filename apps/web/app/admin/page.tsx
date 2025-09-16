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
  type ColumnDescriptor,
  type ColumnLayout,
} from "@/components/admin/ColumnManager";
import type { VisibilityRule } from "@/components/admin/types";
import {
  ColumnDef,
  flexRender,
  getCoreRowModel,
  getSortedRowModel,
  type SortingState,
  useReactTable,
} from "@tanstack/react-table";
import { useVirtualizer } from "@tanstack/react-virtual";
import {
  formatCurrencyUSD,
  formatDate,
  formatNumber,
  formatPercent,
} from "@/lib/format";

const API_BASE = process.env.NEXT_PUBLIC_API_BASE || "";
const MAIN_TABLE = "Partner Investments";
const LAYOUT_STORAGE_KEY = "jbv:admin:layout:v1";

const PRIMARY_CONTACT_KEY = normalizeFieldKey("Primary Contact");
const PARTNER_KEY = normalizeFieldKey("Partner");
const FUND_KEY = normalizeFieldKey("Fund");
const STATUS_KEY = normalizeFieldKey("Status");
const STATUS_I_KEY = normalizeFieldKey("Status (I)");
const INVESTMENT_KEY = normalizeFieldKey("Partner Investment");
const CURRENCY_FIELD_KEYS = new Set(
  [
    "Commitment",
    "Current NAV",
    "Cost / Share",
    "Distributions",
    "FMV / Share",
    "Total NAV",
    "Gain / Loss",
  ].map(normalizeFieldKey)
);

const DATE_FIELD_KEYS = new Set(
  ["Paid Dates", "Period Ending"].map(normalizeFieldKey)
);

const PERCENT_FIELD_KEYS = new Set(["Percent"].map(normalizeFieldKey));

const RULE_KEY = (tableId: string, normalized: string) => `${tableId}:${normalized}`;

type Role = "Admin" | "LP" | "Partner";

type AirtableRecord = {
  id: string;
  fields: Record<string, any>;
  _updatedTime: string | null;
};

type LinkedRecord = {
  id: string;
  displayName?: string;
  fields?: Record<string, any>;
  [key: string]: any;
};

type FieldValueType =
  | "linked"
  | "attachment"
  | "checkbox"
  | "currency"
  | "number"
  | "percent"
  | "date"
  | "text"
  | "array";

type FieldGroup = {
  normalized: string;
  fieldNames: string[];
  displayName: string;
  writeFieldId: string;
  type: FieldValueType;
};

function normalizeFieldKey(name: string) {
  return (name || "").trim().toLowerCase();
}

function mergeLayoutWithServerFields(
  serverOrder: string[],
  layout?: ColumnLayout | null
): ColumnLayout {
  const uniqueServerOrder = Array.from(new Set(serverOrder));
  if (!layout) {
    return { order: uniqueServerOrder, hidden: [] };
  }
  const filteredOrder = layout.order.filter((id) => uniqueServerOrder.includes(id));
  const mergedOrder = Array.from(new Set([...filteredOrder, ...uniqueServerOrder]));
  const hidden = layout.hidden.filter((id) => mergedOrder.includes(id));
  return { order: mergedOrder, hidden };
}

function determineDisplayName(
  fieldNames: string[],
  normalized: string,
  displayNameMap: Record<string, string>
) {
  for (const key of fieldNames) {
    if (displayNameMap[key]) return displayNameMap[key];
  }
  if (displayNameMap[normalized]) return displayNameMap[normalized];
  const preferred = fieldNames.find((name) => name !== name.toUpperCase()) || fieldNames[0];
  if (preferred === preferred.toUpperCase()) {
    return preferred
      .toLowerCase()
      .split(/([\s/_()-]+)/)
      .map((part) => {
        if (!part.trim()) return part;
        if (/^[\s/_()-]+$/.test(part)) return part;
        if (part.length <= 3) return part.toUpperCase();
        return part.charAt(0).toUpperCase() + part.slice(1);
      })
      .join("")
      .replace(/\s+/g, " ")
      .trim();
  }
  return preferred;
}

function getFieldValueByNames(
  record: AirtableRecord,
  fieldNames: string[],
  normalized: string
) {
  const fields = record.fields || {};
  for (const name of fieldNames) {
    if (Object.prototype.hasOwnProperty.call(fields, name)) {
      return fields[name];
    }
  }
  for (const key of Object.keys(fields)) {
    if (normalizeFieldKey(key) === normalized) return fields[key];
  }
  return undefined;
}

function inferFieldType(
  fieldNames: string[],
  normalized: string,
  displayName: string,
  records: AirtableRecord[]
): FieldValueType {
  const nameForHints = `${normalized} ${displayName}`.toLowerCase();

  for (const rec of records) {
    const value = getFieldValueByNames(rec, fieldNames, normalized);
    if (value === null || value === undefined || value === "") continue;
    if (Array.isArray(value)) {
      if (value.length === 0) continue;
      const first = value[0];
      if (first && typeof first === "object") {
        if ("url" in first) return "attachment";
        if ("displayName" in first || "fields" in first) return "linked";
      }
      if (typeof first === "string") return "array";
    } else if (typeof value === "boolean") {
      return "checkbox";
    } else if (typeof value === "number") {
      if (CURRENCY_FIELD_KEYS.has(normalized)) return "currency";
      if (PERCENT_FIELD_KEYS.has(normalized) || nameForHints.includes("percent")) return "percent";
      return "number";
    } else if (typeof value === "string") {
      const trimmed = value.trim();
      if (trimmed) {
        if (
          DATE_FIELD_KEYS.has(normalized) ||
          nameForHints.includes("date") ||
          !Number.isNaN(Date.parse(value))
        ) {
          return "date";
        }
      }
      return "text";
    }
  }

  if (CURRENCY_FIELD_KEYS.has(normalized) || nameForHints.includes("nav")) return "currency";
  if (DATE_FIELD_KEYS.has(normalized) || nameForHints.includes("date")) return "date";
  if (PERCENT_FIELD_KEYS.has(normalized) || nameForHints.includes("percent")) return "percent";
  return "text";
}

function getLinkedDisplay(value: any): string[] {
  if (!Array.isArray(value)) return [];
  return value
    .map((item) => {
      if (!item) return "";
      if (typeof item === "string") return item;
      if (typeof item === "object") {
        return (
          item.displayName ||
          item.fields?.Name ||
          item.fields?.["Full Name"] ||
          item.fields?.Title ||
          item.id ||
          ""
        );
      }
      return "";
    })
    .filter((str) => typeof str === "string" && str.trim().length > 0);
}

function getAttachments(value: any): { name: string; url: string }[] {
  if (!Array.isArray(value)) return [];
  return value
    .map((item) => {
      if (!item || typeof item !== "object") return null;
      const url = item.url || item.href;
      if (!url) return null;
      return {
        url,
        name: item.filename || item.name || item.title || url,
      };
    })
    .filter((item): item is { name: string; url: string } => !!item);
}

function formatValueForCsv(group: FieldGroup, value: any): string {
  if (value === undefined || value === null) return "";
  switch (group.type) {
    case "linked":
      return getLinkedDisplay(value).join("; ");
    case "attachment":
      return getAttachments(value)
        .map((item) => `${item.name} (${item.url})`)
        .join("; ");
    case "checkbox":
      return value ? "TRUE" : "FALSE";
    case "currency": {
      const num =
        typeof value === "number"
          ? value
          : value !== undefined && value !== null && value !== ""
          ? Number(value)
          : null;
      return num === null || Number.isNaN(num) ? "" : formatCurrencyUSD(num);
    }
    case "percent": {
      const num =
        typeof value === "number"
          ? value
          : value !== undefined && value !== null && value !== ""
          ? Number(value)
          : null;
      return num === null || Number.isNaN(num) ? "" : formatPercent(num);
    }
    case "number": {
      const num =
        typeof value === "number"
          ? value
          : value !== undefined && value !== null && value !== ""
          ? Number(value)
          : null;
      return num === null || Number.isNaN(num) ? "" : formatNumber(num);
    }
    case "date":
      return typeof value === "string" ? value : formatDate(value);
    case "array":
      return Array.isArray(value) ? value.join("; ") : String(value);
    default:
      return typeof value === "string" ? value : String(value);
  }
}

function csvEscape(value: string) {
  if (value === "") return "";
  const needsQuotes = /["\n,]/.test(value);
  const escaped = value.replace(/"/g, '""');
  return needsQuotes ? `"${escaped}"` : escaped;
}

function extractPrimaryContactName(
  record: AirtableRecord,
  group?: FieldGroup
) {
  if (!group) return "";
  const value = getFieldValueByNames(record, group.fieldNames, group.normalized);
  const names = getLinkedDisplay(value);
  return names[0] || "";
}

type InlineTextCellProps = {
  value: string | null | undefined;
  onSave: (next: string) => void;
};

function InlineTextCell({ value, onSave }: InlineTextCellProps) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(value ?? "");

  useEffect(() => {
    if (!editing) setDraft(value ?? "");
  }, [editing, value]);

  const commit = (next: string) => {
    onSave(next);
    setEditing(false);
  };

  const cancel = () => {
    setDraft(value ?? "");
    setEditing(false);
  };

  if (editing) {
    return (
      <input
        autoFocus
        className="w-full rounded border px-2 py-1 text-sm"
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        onBlur={() => commit(draft)}
        onKeyDown={(e) => {
          if (e.key === "Enter") commit(draft);
          if (e.key === "Escape") cancel();
        }}
      />
    );
  }

  const display = value && value.trim() !== "" ? value : "—";
  return (
    <button
      type="button"
      className="w-full rounded border border-transparent px-2 py-1 text-left text-sm text-slate-700 hover:border-blue-200"
      onClick={() => setEditing(true)}
    >
      {display}
    </button>
  );
}

type InlineNumberCellProps = {
  value: number | null | undefined;
  onSave: (next: number | null) => void;
  format: (val: number) => string;
};

function InlineNumberCell({ value, onSave, format }: InlineNumberCellProps) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(
    value === null || value === undefined ? "" : String(value)
  );

  useEffect(() => {
    if (!editing) {
      setDraft(value === null || value === undefined ? "" : String(value));
    }
  }, [editing, value]);

  const commit = (raw: string) => {
    const trimmed = raw.trim();
    if (trimmed === "") {
      onSave(null);
    } else {
      const next = Number(trimmed);
      onSave(Number.isNaN(next) ? null : next);
    }
    setEditing(false);
  };

  const cancel = () => {
    setDraft(value === null || value === undefined ? "" : String(value));
    setEditing(false);
  };

  if (editing) {
    return (
      <input
        autoFocus
        type="number"
        className="w-full rounded border px-2 py-1 text-sm"
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        onBlur={() => commit(draft)}
        onKeyDown={(e) => {
          if (e.key === "Enter") commit(draft);
          if (e.key === "Escape") cancel();
        }}
      />
    );
  }

  const display =
    value === null || value === undefined ? "—" : format(value);

  return (
    <button
      type="button"
      className="w-full rounded border border-transparent px-2 py-1 text-left text-sm text-slate-700 hover:border-blue-200"
      onClick={() => setEditing(true)}
    >
      {display}
    </button>
  );
}

type InlineDateCellProps = {
  value: string | null | undefined;
  onSave: (next: string | null) => void;
};

function toDateInputValue(value: string | null | undefined) {
  if (!value) return "";
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return value;
  return parsed.toISOString().slice(0, 10);
}

function InlineDateCell({ value, onSave }: InlineDateCellProps) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(toDateInputValue(value));

  useEffect(() => {
    if (!editing) setDraft(toDateInputValue(value));
  }, [editing, value]);

  const commit = (raw: string) => {
    onSave(raw ? raw : null);
    setEditing(false);
  };

  const cancel = () => {
    setDraft(toDateInputValue(value));
    setEditing(false);
  };

  if (editing) {
    return (
      <input
        autoFocus
        type="date"
        className="w-full rounded border px-2 py-1 text-sm"
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        onBlur={() => commit(draft)}
        onKeyDown={(e) => {
          if (e.key === "Enter") commit(draft);
          if (e.key === "Escape") cancel();
        }}
      />
    );
  }

  const display = value ? formatDate(value) : "—";
  return (
    <button
      type="button"
      className="w-full rounded border border-transparent px-2 py-1 text-left text-sm text-slate-700 hover:border-blue-200"
      onClick={() => setEditing(true)}
    >
      {display}
    </button>
  );
}

type CheckboxCellProps = {
  value: boolean | undefined;
  onSave: (next: boolean) => void;
};

function CheckboxCell({ value, onSave }: CheckboxCellProps) {
  return (
    <label className="inline-flex items-center gap-2 text-sm">
      <input
        type="checkbox"
        checked={!!value}
        onChange={(e) => onSave(e.target.checked)}
      />
    </label>
  );
}

function Badge({ children }: { children: ReactNode }) {
  return (
    <span className="inline-flex items-center rounded-full border px-2 py-0.5 text-xs">
      {children}
    </span>
  );
}

function ChipList({ value }: { value: any }) {
  const items = getLinkedDisplay(value);
  if (!items.length) return <span className="text-xs text-gray-400">—</span>;
  return (
    <div className="flex flex-wrap gap-1">
      {items.map((item) => (
        <Badge key={item}>{item}</Badge>
      ))}
    </div>
  );
}

function AttachmentList({ value }: { value: any }) {
  const files = getAttachments(value);
  if (!files.length) return <span className="text-xs text-gray-400">—</span>;
  return (
    <ul className="space-y-1">
      {files.map((file) => (
        <li key={file.url}>
          <a
            className="text-sm text-blue-600 underline"
            href={file.url}
            target="_blank"
            rel="noopener noreferrer"
          >
            {file.name}
          </a>
        </li>
      ))}
    </ul>
  );
}

export default function AdminPage() {
  const [raw, setRaw] = useState<AirtableRecord[]>([]);
  const [fieldOrder, setFieldOrder] = useState<string[]>([]);
  const [displayNameMap, setDisplayNameMap] = useState<Record<string, string>>({});
  const [query, setQuery] = useState("");
  const [status, setStatus] = useState("Idle");
  const [isLoading, setIsLoading] = useState(true);
  const [impersonation, setImpersonation] = useState<Role>("Admin");
  const [rules, setRules] = useState<Record<string, VisibilityRule>>({});
  const [layoutState, setLayoutState] = useState<ColumnLayout | null>(null);
  const [sorting, setSorting] = useState<SortingState>([
    { id: PRIMARY_CONTACT_KEY, desc: false },
  ]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    try {
      const stored = window.localStorage.getItem(LAYOUT_STORAGE_KEY);
      if (stored) {
        const parsed = JSON.parse(stored);
        if (parsed && typeof parsed === "object") setLayoutState(parsed);
      }
    } catch (e) {
      console.warn("Failed to parse layout state", e);
    }
  }, []);

  useEffect(() => {
    (async () => {
      try {
        const res = await fetch(`${API_BASE}/api/visibility/rules`, {
          cache: "no-store",
        });
        const arr = await res.json();
        const map: Record<string, VisibilityRule> = {};
        for (const rec of arr || []) {
          const normalizedFieldId = normalizeFieldKey(rec.fieldId || "");
          map[RULE_KEY(rec.tableId || MAIN_TABLE, normalizedFieldId)] = {
            id: rec.id,
            tableId: rec.tableId || MAIN_TABLE,
            fieldId: rec.fieldId,
            normalizedFieldId,
            visibleToLP: !!rec.visibleToLP,
            visibleToPartners: !!rec.visibleToPartners,
            notes: rec.notes,
          };
        }
        setRules(map);
      } catch (e) {
        console.error("Failed to load visibility rules", e);
      }
    })();
  }, []);

  useEffect(() => {
    let killed = false;
    let lastFetch = 0;

    async function fetchData() {
      try {
        setStatus("Refreshing…");
        const res = await fetch(`${API_BASE}/api/data`, { cache: "no-store" });
        const json = await res.json();
        if (!killed) {
          setRaw(json.records || []);
          setFieldOrder(json.fieldOrder || []);
          setDisplayNameMap(json.displayNameMap || {});
          setStatus("Idle");
        }
      } catch (e) {
        console.error(e);
        if (!killed) setStatus("Error");
      } finally {
        if (!killed) setIsLoading(false);
      }
    }

    const tick = async () => {
      const now = Date.now();
      if (now - lastFetch > 1000) {
        lastFetch = now;
        await fetchData();
      }
    };

    fetchData();
    const id = setInterval(tick, 10000);
    if (typeof window !== "undefined") {
      window.addEventListener("focus", tick);
    }
    return () => {
      killed = true;
      clearInterval(id);
      if (typeof window !== "undefined") {
        window.removeEventListener("focus", tick);
      }
    };
  }, []);

  const fieldStructure = useMemo(() => {
    const order: string[] = [];
    const map = new Map<string, { normalized: string; fieldNames: string[] }>();

    const register = (fieldName: string) => {
      if (!fieldName) return;
      const normalized = normalizeFieldKey(fieldName);
      const existing = map.get(normalized);
      if (existing) {
        if (!existing.fieldNames.includes(fieldName)) {
          existing.fieldNames.push(fieldName);
        }
      } else {
        map.set(normalized, { normalized, fieldNames: [fieldName] });
        order.push(normalized);
      }
    };

    for (const name of fieldOrder) register(name);
    for (const rec of raw) {
      for (const key of Object.keys(rec.fields || {})) register(key);
    }

    return { order, map };
  }, [fieldOrder, raw]);

  const fieldGroups = useMemo(() => {
    const groups = new Map<string, FieldGroup>();
    for (const normalized of fieldStructure.order) {
      const entry = fieldStructure.map.get(normalized);
      if (!entry) continue;
      const displayName = determineDisplayName(
        entry.fieldNames,
        normalized,
        displayNameMap
      );
      const existingRule = rules[RULE_KEY(MAIN_TABLE, normalized)];
      const writeFieldId = existingRule?.fieldId || entry.fieldNames[0];
      const type = inferFieldType(entry.fieldNames, normalized, displayName, raw);
      groups.set(normalized, {
        normalized,
        fieldNames: entry.fieldNames,
        displayName,
        writeFieldId,
        type,
      });
    }
    return { order: fieldStructure.order, map: groups };
  }, [displayNameMap, fieldStructure, raw, rules]);

  const effectiveLayout = useMemo(
    () => mergeLayoutWithServerFields(fieldGroups.order, layoutState),
    [fieldGroups.order, layoutState]
  );

  const handleLayoutChange = useCallback(
    (next: ColumnLayout) => {
      const merged = mergeLayoutWithServerFields(fieldGroups.order, next);
      setLayoutState(merged);
      if (typeof window !== "undefined") {
        window.localStorage.setItem(LAYOUT_STORAGE_KEY, JSON.stringify(merged));
      }
    },
    [fieldGroups.order]
  );

  const columnDescriptors: ColumnDescriptor[] = useMemo(
    () =>
      fieldGroups.order
        .map((normalized) => {
          const group = fieldGroups.map.get(normalized);
          if (!group) return null;
          return { normalizedId: normalized, label: group.displayName };
        })
        .filter((item): item is ColumnDescriptor => !!item),
    [fieldGroups]
  );

  const visibleColumns = useMemo(() => {
    const hiddenSet = new Set(effectiveLayout.hidden);
    return effectiveLayout.order.filter((id) => {
      if (!fieldGroups.map.has(id)) return false;
      if (hiddenSet.has(id)) return false;
      if (impersonation === "Admin") return true;
      const rule = rules[RULE_KEY(MAIN_TABLE, id)];
      if (!rule) return true;
      return impersonation === "LP"
        ? !!rule.visibleToLP
        : !!rule.visibleToPartners;
    });
  }, [effectiveLayout, fieldGroups.map, impersonation, rules]);

  const primaryContactGroup = fieldGroups.map.get(PRIMARY_CONTACT_KEY);

  const filteredRows = useMemo(() => {
    if (!query) return raw;
    const lower = query.toLowerCase();
    return raw.filter((rec) => {
      const investment = getFieldValueByNames(
        rec,
        fieldGroups.map.get(INVESTMENT_KEY)?.fieldNames || ["Partner Investment"],
        INVESTMENT_KEY
      );
      const partner = getFieldValueByNames(
        rec,
        fieldGroups.map.get(PARTNER_KEY)?.fieldNames || ["Partner"],
        PARTNER_KEY
      );
      const fund = getFieldValueByNames(
        rec,
        fieldGroups.map.get(FUND_KEY)?.fieldNames || ["Fund"],
        FUND_KEY
      );
      const statusValue =
        getFieldValueByNames(
          rec,
          fieldGroups.map.get(STATUS_KEY)?.fieldNames || ["Status"],
          STATUS_KEY
        ) ||
        getFieldValueByNames(
          rec,
          fieldGroups.map.get(STATUS_I_KEY)?.fieldNames || ["Status (I)"],
          STATUS_I_KEY
        );
      const primaryContact = extractPrimaryContactName(rec, primaryContactGroup);
      const haystack = [
        investment,
        getLinkedDisplay(partner).join(" "),
        getLinkedDisplay(fund).join(" "),
        typeof statusValue === "string" ? statusValue : "",
        primaryContact,
      ]
        .filter(Boolean)
        .join(" ")
        .toLowerCase();
      return haystack.includes(lower);
    });
  }, [fieldGroups.map, primaryContactGroup, query, raw]);

  const resolveWriteFieldId = useCallback(
    (record: AirtableRecord, group: FieldGroup) => {
      for (const name of group.fieldNames) {
        if (Object.prototype.hasOwnProperty.call(record.fields || {}, name)) {
          return name;
        }
      }
      return group.writeFieldId || group.fieldNames[0];
    },
    []
  );

  const saveField = useCallback(
    async (record: AirtableRecord, group: FieldGroup, value: any) => {
      const fieldId = resolveWriteFieldId(record, group);
      if (!fieldId) return;
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
      if (!res.ok) {
        if (res.status === 409) {
          const fresh = await res.json();
          setRaw((prev) =>
            prev.map((r) => (r.id === record.id ? fresh : r))
          );
          alert("Record was updated elsewhere. Refreshed row.");
        } else {
          const err = await res.json().catch(() => ({}));
          console.error("Failed to save field", err);
          alert("Failed to save field. Please try again.");
        }
        return;
      }
      const updated = await res.json();
      setRaw((prev) =>
        prev.map((r) => {
          if (r.id !== record.id) return r;
          const nextFields = { ...r.fields };
          nextFields[fieldId] = value;
          return {
            ...r,
            fields: nextFields,
            _updatedTime: updated?._updatedTime ?? r._updatedTime,
          };
        })
      );
    },
    [resolveWriteFieldId]
  );

  const updateRuleVisibility = useCallback(
    async (
      normalizedId: string,
      visibility: { visibleToLP: boolean; visibleToPartners: boolean }
    ) => {
      const group = fieldGroups.map.get(normalizedId);
      const fallbackFieldId = group?.writeFieldId || normalizedId;
      const existing = rules[RULE_KEY(MAIN_TABLE, normalizedId)];
      const fieldId = existing?.fieldId || fallbackFieldId;
      const payload = {
        tableId: MAIN_TABLE,
        fieldId,
        visibleToLP: visibility.visibleToLP,
        visibleToPartners: visibility.visibleToPartners,
      };
      const res = await fetch(`${API_BASE}/api/visibility/rules`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      if (!res.ok) throw new Error("Failed to update visibility rule");
      const saved = await res.json();
      const normalizedFieldId = normalizeFieldKey(saved.fieldId || fieldId);
      const rule: VisibilityRule = {
        id: saved.id,
        tableId: saved.tableId || MAIN_TABLE,
        fieldId: saved.fieldId || fieldId,
        normalizedFieldId,
        visibleToLP: !!saved.visibleToLP,
        visibleToPartners: !!saved.visibleToPartners,
        notes: saved.notes,
      };
      setRules((prev) => ({
        ...prev,
        [RULE_KEY(MAIN_TABLE, normalizedFieldId)]: rule,
      }));
    },
    [fieldGroups.map, rules]
  );

  const columns = useMemo<ColumnDef<AirtableRecord>[]>(() => {
    const defs: ColumnDef<AirtableRecord>[] = [];
    for (const normalized of visibleColumns) {
      const group = fieldGroups.map.get(normalized);
      if (!group) continue;
      defs.push({
        id: normalized,
        header: group.displayName,
        accessorFn: (row) =>
          getFieldValueByNames(row, group.fieldNames, group.normalized),
        cell: (ctx) => {
          const row = ctx.row.original;
          const value = ctx.getValue();
          switch (group.type) {
            case "linked":
              return <ChipList value={value} />;
            case "attachment":
              return <AttachmentList value={value} />;
            case "checkbox":
              return (
                <CheckboxCell
                  value={!!value}
                  onSave={(next) => saveField(row, group, next)}
                />
              );
            case "currency": {
              const numericValue =
                typeof value === "number"
                  ? value
                  : value !== undefined && value !== null && value !== ""
                  ? Number(value)
                  : null;
              const safeValue =
                typeof numericValue === "number" && Number.isFinite(numericValue)
                  ? numericValue
                  : null;
              return (
                <InlineNumberCell
                  value={safeValue}
                  onSave={(next) => saveField(row, group, next)}
                  format={(val) => formatCurrencyUSD(val)}
                />
              );
            }
            case "number": {
              const numericValue =
                typeof value === "number"
                  ? value
                  : value !== undefined && value !== null && value !== ""
                  ? Number(value)
                  : null;
              const safeValue =
                typeof numericValue === "number" && Number.isFinite(numericValue)
                  ? numericValue
                  : null;
              return (
                <InlineNumberCell
                  value={safeValue}
                  onSave={(next) => saveField(row, group, next)}
                  format={(val) => formatNumber(val)}
                />
              );
            }
            case "percent": {
              const numericValue =
                typeof value === "number"
                  ? value
                  : value !== undefined && value !== null && value !== ""
                  ? Number(value)
                  : null;
              const safeValue =
                typeof numericValue === "number" && Number.isFinite(numericValue)
                  ? numericValue
                  : null;
              return (
                <InlineNumberCell
                  value={safeValue}
                  onSave={(next) => saveField(row, group, next)}
                  format={(val) => formatPercent(val)}
                />
              );
            }
            case "date":
              return (
                <InlineDateCell
                  value={typeof value === "string" ? value : undefined}
                  onSave={(next) => saveField(row, group, next)}
                />
              );
            case "array":
              return (
                <span className="text-sm text-slate-700">
                  {Array.isArray(value) && value.length
                    ? value.join(", ")
                    : "—"}
                </span>
              );
            default:
              return (
                <InlineTextCell
                  value={
                    typeof value === "string"
                      ? value
                      : value !== undefined && value !== null
                      ? String(value)
                      : ""
                  }
                  onSave={(next) => saveField(row, group, next)}
                />
              );
          }
        },
        sortingFn:
          normalized === PRIMARY_CONTACT_KEY
            ? (a, b) => {
                const aName = extractPrimaryContactName(
                  a.original,
                  primaryContactGroup
                );
                const bName = extractPrimaryContactName(
                  b.original,
                  primaryContactGroup
                );
                return aName.localeCompare(bName);
              }
            : undefined,
        meta: group,
      });
    }
    return defs;
  }, [fieldGroups.map, primaryContactGroup, saveField, visibleColumns]);

  const table = useReactTable({
    data: filteredRows,
    columns,
    state: { sorting },
    onSortingChange: setSorting,
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: getSortedRowModel(),
  });

  const tableContainerRef = useRef<HTMLDivElement>(null);
  const rowModel = table.getRowModel().rows;
  const rowVirtualizer = useVirtualizer({
    count: rowModel.length,
    getScrollElement: () => tableContainerRef.current,
    estimateSize: () => 56,
    overscan: 12,
  });
  const virtualRows = rowVirtualizer.getVirtualItems();
  const paddingTop = virtualRows.length > 0 ? virtualRows[0].start : 0;
  const paddingBottom =
    virtualRows.length > 0
      ? rowVirtualizer.getTotalSize() -
        virtualRows[virtualRows.length - 1].end
      : 0;

  const exportCsv = useCallback(() => {
    if (!visibleColumns.length) {
      alert("No visible columns to export.");
      return;
    }
    const headers = visibleColumns.map((id) =>
      fieldGroups.map.get(id)?.displayName || id
    );
    const rows = filteredRows.map((record) =>
      visibleColumns.map((id) => {
        const group = fieldGroups.map.get(id);
        if (!group) return "";
        const value = getFieldValueByNames(
          record,
          group.fieldNames,
          group.normalized
        );
        return csvEscape(formatValueForCsv(group, value));
      })
    );
    const csvContent = [headers.map(csvEscape), ...rows]
      .map((row) => row.join(","))
      .join("\n");
    const blob = new Blob([csvContent], {
      type: "text/csv;charset=utf-8;",
    });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `partner-investments-${new Date()
      .toISOString()
      .slice(0, 10)}.csv`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  }, [fieldGroups.map, filteredRows, visibleColumns]);

  const columnCount = table.getVisibleLeafColumns().length || columns.length || 1;
  const recordCount = filteredRows.length;

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
              onChange={(e) => setImpersonation(e.target.value as Role)}
              title="Impersonation Preview"
            >
              <option value="Admin">Admin</option>
              <option value="LP">LP</option>
              <option value="Partner">Partner</option>
            </select>
            <span className="text-sm text-gray-500">Refresh: {status}</span>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-7xl px-6 py-6">
        <div className="mb-4 flex flex-col gap-3 md:flex-row md:items-center md:gap-4">
          <input
            placeholder="Search partner, fund, status, contact…"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            className="w-full rounded-xl border px-3 py-2 shadow-sm focus:outline-none focus:ring-2 focus:ring-blue-200 md:w-96"
          />
          <span className="text-sm text-gray-500">{recordCount} records</span>
          <div className="flex flex-1 items-center justify-end gap-2">
            <button
              type="button"
              className="rounded-lg border bg-white px-3 py-2 text-sm shadow-sm hover:bg-blue-50"
              onClick={exportCsv}
            >
              Export CSV
            </button>
            <ColumnManager
              tableId={MAIN_TABLE}
              columns={columnDescriptors}
              layout={effectiveLayout}
              onLayoutChange={handleLayoutChange}
              rules={rules}
              onRuleChange={updateRuleVisibility}
            />
          </div>
        </div>

        <div
          ref={tableContainerRef}
          className="overflow-auto rounded-2xl border shadow-sm"
          style={{ maxHeight: "calc(100vh - 220px)" }}
        >
          <table className="min-w-full border-collapse">
            <thead className="sticky top-0 z-10 bg-blue-50">
              {table.getHeaderGroups().map((hg) => (
                <tr key={hg.id}>
                  {hg.headers.map((header) => (
                    <th
                      key={header.id}
                      className="border-b px-3 py-2 text-left text-sm font-semibold text-slate-700"
                    >
                      {header.isPlaceholder
                        ? null
                        : flexRender(
                            header.column.columnDef.header,
                            header.getContext()
                          )}
                    </th>
                  ))}
                </tr>
              ))}
            </thead>
            <tbody>
              {isLoading ? (
                <tr>
                  <td
                    colSpan={columnCount}
                    className="px-3 py-10 text-center text-gray-400"
                  >
                    Loading…
                  </td>
                </tr>
              ) : rowModel.length === 0 ? (
                <tr>
                  <td
                    colSpan={columnCount}
                    className="px-3 py-10 text-center text-gray-400"
                  >
                    No records
                  </td>
                </tr>
              ) : (
                <>
                  {paddingTop > 0 && (
                    <tr>
                      <td colSpan={columnCount} style={{ height: paddingTop }} />
                    </tr>
                  )}
                  {virtualRows.map((virtualRow) => {
                    const row = rowModel[virtualRow.index];
                    return (
                      <tr
                        key={row.id}
                        className="hover:bg-blue-50/40"
                        style={{ height: virtualRow.size }}
                      >
                        {row.getVisibleCells().map((cell) => (
                          <td
                            key={cell.id}
                            className="px-3 py-2 text-sm text-slate-700 align-top"
                          >
                            {flexRender(
                              cell.column.columnDef.cell,
                              cell.getContext()
                            )}
                          </td>
                        ))}
                      </tr>
                    );
                  })}
                  {paddingBottom > 0 && (
                    <tr>
                      <td
                        colSpan={columnCount}
                        style={{ height: paddingBottom }}
                      />
                    </tr>
                  )}
                </>
              )}
            </tbody>
          </table>
        </div>
      </main>
    </div>
  );
}

