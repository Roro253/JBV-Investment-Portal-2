"use client";

import { normalizeFieldKey } from "@/lib/airtable-shared";
import { formatCurrencyUSD, formatDate, formatNumber, formatPercent } from "@/lib/format";

type CsvRecord = {
  id: string;
  fields: Record<string, any>;
  _updatedTime?: string | null;
};

type CsvInput = {
  fieldOrder: string[];
  records: CsvRecord[];
};

function parseNumberValue(value: any): number | null {
  if (typeof value === "number") {
    return Number.isFinite(value) ? value : null;
  }
  if (typeof value === "string") {
    const cleaned = value.replace(/[^0-9.-]+/g, "");
    if (!cleaned) return null;
    const parsed = Number(cleaned);
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
}

function isCurrencyField(normalized: string) {
  return /commitment|capital|nav|distribution|gain|loss|cost|contributed|value|amount|fmv|paid/.test(normalized);
}

function isPercentField(normalized: string) {
  return /percent|irr|yield|rate/.test(normalized);
}

function isMoicField(normalized: string) {
  return /moic|multiple/.test(normalized);
}

function isDateField(normalized: string) {
  return /date|period|as of|paid/.test(normalized);
}

function escapeCsvValue(value: string) {
  if (value.includes("\"")) {
    value = value.replace(/"/g, '""');
  }
  if (/[",\n\r]/.test(value)) {
    return `"${value}"`;
  }
  return value;
}

function isLinkedArray(value: any[]): boolean {
  return value.some((entry) => entry && typeof entry === "object" && "displayName" in entry);
}

function isAttachmentEntry(entry: any): boolean {
  return entry && typeof entry === "object" && typeof entry.url === "string";
}

function formatAttachmentValue(recordId: string, field: string, attachments: any[]): string {
  const parts = attachments
    .map((entry, index) => {
      if (!isAttachmentEntry(entry)) return null;
      const downloadUrl = `/api/lp/documents/download?recordId=${encodeURIComponent(
        recordId
      )}&field=${encodeURIComponent(field)}&index=${index}`;
      const label = entry.name || entry.filename || entry.title;
      return label ? `${label} (${downloadUrl})` : downloadUrl;
    })
    .filter((value): value is string => Boolean(value));
  return parts.join("; ");
}

function formatPrimitiveValue(field: string, value: number | string): string {
  const normalized = normalizeFieldKey(field);
  if (typeof value === "number") {
    if (isCurrencyField(normalized)) {
      return formatCurrencyUSD(value);
    }
    if (isPercentField(normalized)) {
      return formatPercent(value);
    }
    if (isMoicField(normalized)) {
      return `${formatNumber(value, 2)}x`;
    }
    return formatNumber(value, 2);
  }

  const trimmed = value.trim();
  if (!trimmed) return "";

  if (isDateField(normalized)) {
    const formatted = formatDate(value);
    if (formatted !== "—") return formatted;
  }

  const parsed = parseNumberValue(value);
  if (parsed !== null) {
    if (isCurrencyField(normalized)) {
      return formatCurrencyUSD(parsed);
    }
    if (isPercentField(normalized)) {
      return formatPercent(parsed);
    }
    if (isMoicField(normalized)) {
      return `${formatNumber(parsed, 2)}x`;
    }
  }

  if (isPercentField(normalized) && /%$/.test(trimmed)) {
    return trimmed;
  }

  if (isMoicField(normalized) && /x$/i.test(trimmed)) {
    return trimmed;
  }

  return trimmed;
}

function formatValueForCsv(field: string, value: any, recordId: string): string {
  if (value === null || value === undefined) return "";

  if (Array.isArray(value)) {
    if (!value.length) return "";
    if (isLinkedArray(value)) {
      return value
        .map((entry) => {
          if (entry && typeof entry === "object") {
            const name = entry.displayName ?? entry.name ?? entry.id;
            return name != null ? String(name) : "";
          }
          return entry != null ? String(entry) : "";
        })
        .filter(Boolean)
        .join("; ");
    }
    if (value.some((entry) => isAttachmentEntry(entry))) {
      return formatAttachmentValue(recordId, field, value);
    }
    return value
      .map((entry) => (entry != null ? String(entry) : ""))
      .filter(Boolean)
      .join("; ");
  }

  if (typeof value === "boolean") {
    return value ? "Yes" : "No";
  }

  if (typeof value === "number" || typeof value === "string") {
    return formatPrimitiveValue(field, value as any);
  }

  if (value && typeof value === "object") {
    if (isAttachmentEntry(value)) {
      return formatAttachmentValue(recordId, field, [value]);
    }
    try {
      return JSON.stringify(value);
    } catch {
      return String(value);
    }
  }

  return String(value);
}

export function toCsv({ fieldOrder, records }: CsvInput): Blob {
  const rows: string[][] = [];
  rows.push(fieldOrder.slice());

  records.forEach((record) => {
    const row = fieldOrder.map((field) => {
      const value = Object.prototype.hasOwnProperty.call(record.fields, field)
        ? record.fields[field]
        : undefined;
      return formatValueForCsv(field, value, record.id);
    });
    rows.push(row);
  });

  const csvContent = rows.map((row) => row.map((cell) => escapeCsvValue(cell ?? "")).join(",")).join("\r\n");
  return new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
}
