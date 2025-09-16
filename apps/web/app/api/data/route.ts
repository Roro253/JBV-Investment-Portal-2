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

const DISPLAY_NAME_OVERRIDES: Record<string, string> = {
  "primary contact": "Primary Contact",
  "partner investment": "Partner Investment",
  "pcap distribution report": "PCAP Distribution Report",
  "latest pcap file": "Latest PCAP File",
  "status (i)": "Status (I)",
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
  const primary =
    fields.Name ||
    fields["Full Name"] ||
    fields.Title ||
    fields["Primary Contact"] ||
    Object.values(fields || {}).find((val) => typeof val === "string") ||
    Object.values(fields || {})[0];
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

function normalizeKey(name: string): string {
  return name?.trim().toLowerCase() ?? "";
}

function toDisplayName(fieldName: string): string {
  const normalized = normalizeKey(fieldName);
  return DISPLAY_NAME_OVERRIDES[normalized] || fieldName;
}

function deriveFieldMetadata(rows: AirtableRecord[]) {
  const seenNormalized = new Set<string>();
  const order: string[] = [];
  const displayNameMap: Record<string, string> = {};

  const pushField = (fieldName: string) => {
    const normalized = normalizeKey(fieldName);
    if (!seenNormalized.has(normalized)) {
      seenNormalized.add(normalized);
      order.push(fieldName);
    }
    if (!displayNameMap[fieldName]) {
      displayNameMap[fieldName] = toDisplayName(fieldName);
    }
  };

  if (rows.length) {
    const firstRawFields =
      ((rows[0] as any)._rawJson?.fields as Record<string, any>) ||
      ((rows[0].fields || {}) as Record<string, any>);
    for (const key of Object.keys(firstRawFields || {})) {
      pushField(key);
    }
  }

  for (const row of rows) {
    const rawFields =
      ((row as any)._rawJson?.fields as Record<string, any>) ||
      ((row.fields || {}) as Record<string, any>);
    for (const key of Object.keys(rawFields || {})) {
      pushField(key);
    }
  }

  return { fieldOrder: order, displayNameMap };
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

    const { fieldOrder, displayNameMap } = deriveFieldMetadata(rows as AirtableRecord[]);
    const records = await expandRecords(rows as AirtableRecord[]);

    return Response.json({ records, fieldOrder, displayNameMap });
  } catch (e: any) {
    return new Response(JSON.stringify({ error: e?.message || "Failed" }), { status: 500 });
  }
}

