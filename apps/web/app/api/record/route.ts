import Airtable from "airtable";

export const runtime = "nodejs";

const AIRTABLE_API_KEY = process.env.AIRTABLE_API_KEY || process.env.AIRTABLE_PAT;

if (!AIRTABLE_API_KEY) {
  throw new Error("Missing Airtable API key. Set AIRTABLE_API_KEY or AIRTABLE_PAT.");
}

const base = new Airtable({ apiKey: AIRTABLE_API_KEY }).base(
  process.env.AIRTABLE_BASE_ID!
);

async function expand(tableName: string, rec: any) {
  return {
    id: rec.id,
    fields: rec.fields,
    _updatedTime: (rec as any)._rawJson?.modifiedTime || null,
  };
}

export async function PUT(req: Request) {
  try {
    const body = await req.json();
    const { tableIdOrName, recordId, fields } = body || {};
    if (!tableIdOrName || !recordId || !fields) {
      return new Response(JSON.stringify({ error: "Bad request" }), { status: 400 });
    }
    const updated = await base(tableIdOrName).update(recordId, fields, { typecast: true });
    const payload = await expand(tableIdOrName, updated);
    return Response.json(payload);
  } catch (e: any) {
    return new Response(JSON.stringify({ error: e?.message || "Failed" }), { status: 500 });
  }
}

