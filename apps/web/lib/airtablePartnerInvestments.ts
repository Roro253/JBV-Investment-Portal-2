import Airtable from "airtable";
import Bottleneck from "bottleneck";

const base = new Airtable({ apiKey: process.env.AIRTABLE_API_KEY! }).base(
  process.env.AIRTABLE_BASE_ID!
);

const VIEW_ID = process.env.AIRTABLE_VIEW_ID || undefined;

const LINK_MAP: Record<string, string> = {
  "Target Securities": "Target Securities",
  Partner: "Partners",
  Fund: "JBV Entities",
  "PRIMARY CONTACT": "Contacts",
  "Primary Contact": "Contacts",
};

const limiter = new Bottleneck({ minTime: 60 });

export const PARTNER_INVESTMENTS_TABLE = "Partner Investments";

export type AirtableRecord = Airtable.Record<any>;

export type LinkedRecord = {
  id: string;
  fields: Record<string, any>;
  displayName: any;
};

export type ExpandedRecord = {
  id: string;
  fields: Record<string, any>;
  _updatedTime: string | null;
};

const EMAIL_FIELD_FORMULAS: Array<{
  field: string;
  build: (email: string) => string;
}> = [
  {
    field: "PrimaryContactEmailCSV",
    build: (email) => `FIND(LOWER('${email}'), LOWER({PrimaryContactEmailCSV})) > 0`,
  },
  {
    field: "Primary Contact Email",
    build: (email) => `LOWER({Primary Contact Email})='${email}'`,
  },
  {
    field: "PRIMARY CONTACT Email",
    build: (email) => `LOWER({PRIMARY CONTACT Email})='${email}'`,
  },
];

const CHUNK_SIZE = 50;

function sanitizeEmailForFormula(email: string) {
  return email.replace(/'/g, "\\'").toLowerCase();
}

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

export async function expandPartnerInvestmentRecords(
  rows: AirtableRecord[]
): Promise<ExpandedRecord[]> {
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

export async function selectPartnerInvestments(filterByFormula?: string) {
  return limiter.schedule(() =>
    base(PARTNER_INVESTMENTS_TABLE)
      .select({
        ...(VIEW_ID ? { view: VIEW_ID } : {}),
        ...(filterByFormula ? { filterByFormula } : {}),
      })
      .all()
  );
}

export async function selectPartnerInvestmentsByEmail(email: string) {
  const sanitized = sanitizeEmailForFormula(email);
  let lastError: unknown = null;

  for (const candidate of EMAIL_FIELD_FORMULAS) {
    const filterByFormula = candidate.build(sanitized);
    try {
      const rows = await selectPartnerInvestments(filterByFormula);
      return { rows, filterByFormula, field: candidate.field };
    } catch (error: any) {
      if (error?.statusCode === 422 || error?.statusCode === 400) {
        lastError = error;
        continue;
      }
      throw error;
    }
  }

  if (lastError) {
    throw lastError;
  }

  return { rows: [] as AirtableRecord[], filterByFormula: undefined, field: undefined };
}

export async function fetchVisibilityRules() {
  return limiter.schedule(() =>
    base("VisibilityRules")
      .select({
        filterByFormula: "{tableId}='Partner Investments'",
      })
      .all()
  );
}
