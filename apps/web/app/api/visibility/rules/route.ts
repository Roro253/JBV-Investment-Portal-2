import Airtable from "airtable";

export const runtime = "nodejs";

const AIRTABLE_API_KEY = process.env.AIRTABLE_API_KEY || process.env.AIRTABLE_PAT;

if (!AIRTABLE_API_KEY) {
  throw new Error("Missing Airtable API key. Set AIRTABLE_API_KEY or AIRTABLE_PAT.");
}

const base = new Airtable({ apiKey: AIRTABLE_API_KEY }).base(
  process.env.AIRTABLE_BASE_ID!
);

export async function GET() {
  try {
    const page = await base("VisibilityRules").select({ pageSize: 100 }).firstPage();
    const rows = page.map((r) => ({ id: r.id, ...(r.fields as any) }));
    return Response.json(rows);
  } catch (e: any) {
    return new Response(JSON.stringify({ error: e?.message || "Failed" }), { status: 500 });
  }
}

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const { tableId, fieldId, visibleToLP, visibleToPartners, notes } = body || {};
    if (!tableId || !fieldId)
      return new Response(JSON.stringify({ error: "Bad request" }), { status: 400 });

    const existing = await base("VisibilityRules")
      .select({
        filterByFormula: `AND({tableId}='${tableId}', {fieldId}='${fieldId}')`,
        pageSize: 1,
      })
      .firstPage();

    if (existing[0]) {
      const rec = await base("VisibilityRules").update(existing[0].id, {
        tableId,
        fieldId,
        visibleToLP,
        visibleToPartners,
        notes,
      });
      return Response.json({ id: rec.id, ...(rec.fields as any) });
    } else {
      const rec = await base("VisibilityRules").create({
        tableId,
        fieldId,
        visibleToLP,
        visibleToPartners,
        notes,
      });
      return Response.json({ id: rec.id, ...(rec.fields as any) });
    }
  } catch (e: any) {
    return new Response(JSON.stringify({ error: e?.message || "Failed" }), { status: 500 });
  }
}

