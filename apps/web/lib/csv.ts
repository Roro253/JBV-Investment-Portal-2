import { normalizeFieldKey } from "@/lib/airtable-shared";
import { formatCurrencyUSD, formatDate, formatNumber, formatPercent } from "@/lib/format";

type SummaryRecord = {
  id: string;
  fields: Record<string, any>;
  _updatedTime: string | null;
};

type SummaryResponse = {
  fieldOrder: string[];
  records: SummaryRecord[];
};

type LinkedValue = { id: string; displayName?: string };

type AttachmentValue = { url?: string; name?: string; filename?: string };

function parseNumber(value: any): number | null {
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

function isLinkedArray(value: any): value is LinkedValue[] {
  return (
    Array.isArray(value) &&
    value.length > 0 &&
    value.every((item) => item && typeof item === "object" && "displayName" in item)
  );
}

function isAttachmentArray(value: any): value is AttachmentValue[] {
  return (
    Array.isArray(value) &&
    value.length > 0 &&
    value.every((item) => item && typeof item === "object" && "url" in item)
  );
}

function formatPrimitiveValue(fieldName: string, value: any): string {
  if (value === null || value === undefined) return "";
  if (typeof value === "boolean") return value ? "Yes" : "No";

  const normalized = normalizeFieldKey(fieldName);

  if (typeof value === "number") {
    if (/commitment|capital|nav|distribution|gain|loss|cost|value|amount/.test(normalized)) {
      return formatCurrencyUSD(value);
    }
    if (/percent|irr/.test(normalized)) {
      return formatPercent(value, 2);
    }
    if (/moic|multiple/.test(normalized)) {
      return `${formatNumber(value, 2)}x`;
    }
    return formatNumber(value, 2);
  }

  if (typeof value === "string") {
    const parsedDate = new Date(value);
    if (!Number.isNaN(parsedDate.getTime()) && /date|period|as of|paid/.test(normalized)) {
      return formatDate(parsedDate.toISOString());
    }
    if (/commitment|capital|nav|distribution|gain|loss|cost|value|amount/.test(normalized)) {
      const parsed = parseNumber(value);
      if (parsed !== null) {
        return formatCurrencyUSD(parsed);
      }
    }
    if (/percent|irr/.test(normalized)) {
      const parsed = parseNumber(value);
      if (parsed !== null) {
        return formatPercent(parsed, 2);
      }
    }
    if (/moic|multiple/.test(normalized)) {
      const parsed = parseNumber(value);
      if (parsed !== null) {
        return `${formatNumber(parsed, 2)}x`;
      }
    }
    return value;
  }

  return String(value);
}

function formatCellValue(fieldName: string, value: any): string {
  if (value === null || value === undefined) return "";
  if (isLinkedArray(value)) {
    return value.map((item) => item.displayName || "").filter(Boolean).join("; ");
  }
  if (isAttachmentArray(value)) {
    return value
      .map((item) => item.name || item.filename || item.url || "")
      .filter(Boolean)
      .join("; ");
  }
  if (Array.isArray(value)) {
    return value
      .map((item) => formatPrimitiveValue(fieldName, item))
      .filter((item) => item && item !== "—")
      .join("; ");
  }
  return formatPrimitiveValue(fieldName, value);
}

function escapeCsvValue(value: string): string {
  if (value === "") return "";
  let escaped = value;
  if (escaped.includes("\"")) {
    escaped = escaped.replace(/"/g, '""');
  }
  if (/[",\n]/.test(escaped)) {
    return `"${escaped}"`;
  }
  return escaped;
}

export function toCsv(data: SummaryResponse): Blob {
  const { fieldOrder, records } = data;
  const lines: string[] = [];
  lines.push(fieldOrder.map((field) => escapeCsvValue(field)).join(","));

  for (const record of records) {
    const row = fieldOrder.map((field) => {
      const value = Object.prototype.hasOwnProperty.call(record.fields, field)
        ? record.fields[field]
        : undefined;
      const formatted = formatCellValue(field, value);
      return escapeCsvValue(formatted);
    });
    lines.push(row.join(","));
  }

  const csvContent = lines.join("\r\n");
  return new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
}

export type { SummaryRecord, SummaryResponse };
