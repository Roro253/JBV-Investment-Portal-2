import Airtable from "airtable";
import Bottleneck from "bottleneck";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const base = new Airtable({ apiKey: process.env.AIRTABLE_API_KEY! }).base(
  process.env.AIRTABLE_BASE_ID!
);

const VIEW_ID = process.env.AIRTABLE_VIEW_ID || undefined;

// map of linked fields → linked table names
const LINK_MAP: Record<string, string> = {
  "Target Securities": "Target Securities",
  Partner: "Partners",
  Fund: "JBV Entities",
  "PRIMARY CONTACT": "Contacts",
  "Primary Contact": "Contacts",
};

// Optional limiter to be nice to Airtable rate limits
const limiter = new Bottleneck({ minTime: 60 });

type AirtableRecord = Airtable.Record<any>;

type LinkedRecord = {
  id: string;
  fields: Record<string, any>;
  displayName: any;
};

const CHUNK_SIZE = 50;

function toLinkedRecord(rec: AirtableRecord): LinkedRecord {
  const fields: any = rec.fields || {};
  const primary = fields.Name || fields.Title || Object.values(fields || {})[0];
  return { id: rec.id, fields, displayName: primary };
}

async function fetchLinkedRecords(tableName: string, ids: string[]) {
  if (!ids.length) return new Map<string, LinkedRecord>();

  const uniqueIds = Array.from(new Set(ids));
  const lookup = new Map<string, LinkedRecord>();

  for (let i = 0; i < uniqueIds.length; i += CHUNK_SIZE) {
    const chunk = uniqueIds.slice(i, i + CHUNK_SIZE);
    const filterByFormula =
      chunk.length === 1
        ? `RECORD_ID()='${chunk[0]}'`
        : `OR(${chunk.map((id) => `RECORD_ID()='${id}'`).join(",")})`;

    const records = await limiter.schedule(() =>
      base(tableName)
        .select({ filterByFormula })
        .all()
    );

    for (const rec of records) {
      const formatted = toLinkedRecord(rec as AirtableRecord);
      lookup.set(formatted.id, formatted);
    }
  }

  return lookup;
}

type ExpandedRecord = {
  id: string;
  fields: Record<string, any>;
  _updatedTime: string | null;
};

function normalizeFieldKey(name: string) {
  return (name || "").trim().toLowerCase();
}

function toDisplayLabel(name: string) {
  if (!name) return name;
  if (name === name.toUpperCase()) {
    return name
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
  return name;
}

async function expandRecords(rows: AirtableRecord[]): Promise<ExpandedRecord[]> {
  if (!rows.length) return [];

  const idsByTable = new Map<string, Set<string>>();

  for (const row of rows) {
    const rowFields: Record<string, any> = (row.fields || {}) as Record<string, any>;
    for (const [fieldName, tableName] of Object.entries(LINK_MAP)) {
      const value = rowFields[fieldName];
      if (Array.isArray(value) && value.length) {
        if (!idsByTable.has(tableName)) idsByTable.set(tableName, new Set());
        const idSet = idsByTable.get(tableName)!;
        for (const id of value) idSet.add(id);
      }
    }
  }

  const lookups = new Map<string, Map<string, LinkedRecord>>();

  await Promise.all(
    Array.from(idsByTable.entries()).map(async ([tableName, idSet]) => {
      const tableLookup = await fetchLinkedRecords(tableName, Array.from(idSet));
      lookups.set(tableName, tableLookup);
    })
  );

  return rows.map((row) => {
    const originalFields: Record<string, any> = (row.fields || {}) as Record<string, any>;
    const fields: Record<string, any> = { ...originalFields };

    for (const [fieldName, tableName] of Object.entries(LINK_MAP)) {
      const ids = originalFields[fieldName];
      if (Array.isArray(ids) && ids.length) {
        const lookup = lookups.get(tableName);
        fields[fieldName] = lookup
          ? ids.map((id: string) => lookup.get(id) ?? { id, error: true })
          : [];
      }
    }

    return {
      id: row.id,
      fields,
      _updatedTime: (row as any)._rawJson?.modifiedTime || null,
    };
  });
}

export async function GET() {
  try {
    const rows = await base("Partner Investments")
      .select({ ...(VIEW_ID ? { view: VIEW_ID } : {}) })
      .all();

    const records = await expandRecords(rows as AirtableRecord[]);

    const fieldOrderSet = new Set<string>();
    const first = rows[0] as any;
    const firstFields = (first?._rawJson?.fields as Record<string, any>) || (first?.fields as Record<string, any>) || {};
    for (const key of Object.keys(firstFields)) fieldOrderSet.add(key);
    for (const row of rows as AirtableRecord[]) {
      const fields = (row.fields || {}) as Record<string, any>;
      for (const key of Object.keys(fields)) fieldOrderSet.add(key);
    }
    const fieldOrder = Array.from(fieldOrderSet);

    const displayNameMap: Record<string, string> = {};
    for (const key of fieldOrder) {
      const display = toDisplayLabel(key);
      if (display) {
        if (!displayNameMap[key]) displayNameMap[key] = display;
        const normalized = normalizeFieldKey(key);
        if (normalized && !displayNameMap[normalized]) displayNameMap[normalized] = display;
      }
    }

    return Response.json({ records, fieldOrder, displayNameMap });
  } catch (e: any) {
    return new Response(JSON.stringify({ error: e?.message || "Failed" }), { status: 500 });
  }
}

