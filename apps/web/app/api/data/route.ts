import Airtable from "airtable";
import Bottleneck from "bottleneck";

export const runtime = "nodejs";

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

async function fetchByIds(tableName: string, ids: string[]) {
  if (!ids?.length) return [] as any[];
  return Promise.all(
    ids.map((id) =>
      limiter.schedule(async () => {
        try {
          const rec = await base(tableName).find(id);
          const fields: any = rec.fields || {};
          const primary = fields.Name || fields.Title || Object.values(fields || {})[0];
          return { id: rec.id, fields, displayName: primary };
        } catch {
          return { id, error: true };
        }
      })
    )
  );
}

async function expandRecord(rec: any) {
  const fields: any = { ...(rec.fields || {}) };
  for (const [fieldName, linkTable] of Object.entries(LINK_MAP)) {
    const v = fields[fieldName];
    if (Array.isArray(v)) fields[fieldName] = await fetchByIds(linkTable, v);
  }
  return {
    id: rec.id,
    fields,
    _updatedTime: (rec as any)._rawJson?.modifiedTime || null,
  };
}

export async function GET() {
  try {
    const rows = await base("Partner Investments")
      .select({ ...(VIEW_ID ? { view: VIEW_ID } : {}) })
      .all();

    const records = await Promise.all(rows.map((r) => expandRecord(r)));
    return Response.json({ records });
  } catch (e: any) {
    return new Response(JSON.stringify({ error: e?.message || "Failed" }), { status: 500 });
  }
}

