import {
  PARTNER_INVESTMENTS_TABLE,
  VIEW_ID,
  base,
  expandPartnerInvestmentRecords,
  normalizeFieldKey,
  type AirtableRecord,
} from "@/lib/airtable";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

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

export async function GET() {
  try {
    const rows = await base(PARTNER_INVESTMENTS_TABLE)
      .select({ ...(VIEW_ID ? { view: VIEW_ID } : {}) })
      .all();

    const records = await expandPartnerInvestmentRecords(rows as AirtableRecord[]);

    const fieldOrderSet = new Set<string>();
    const first = rows[0] as any;
    const firstFields =
      (first?._rawJson?.fields as Record<string, any>) || (first?.fields as Record<string, any>) || {};
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
