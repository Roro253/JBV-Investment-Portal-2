import { getSession } from "@/lib/auth";
import { type Role } from "@/lib/auth-helpers";
import { loadLpInvestmentRecords } from "@/lib/lp-server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const VIEW_ID = process.env.AIRTABLE_VIEW_ID;

type Attachment = {
  name?: string;
  url?: string;
  size?: number;
  type?: string;
  filename?: string;
};

type DocumentsResponse = {
  documents: Array<{
    name: string;
    size?: number;
    type?: string;
    investmentId: string;
    investmentName?: string;
    periodEnding?: any;
    field: string;
    index: number;
  }>;
  note?: string;
};

function isAttachment(value: any): value is Attachment {
  return value && typeof value === "object" && typeof value.url === "string";
}

function resolveInvestmentName(fields: Record<string, any>) {
  const preferredKeys = ["Partner Investment", "Investment", "Name", "Title"];
  for (const key of preferredKeys) {
    if (Object.prototype.hasOwnProperty.call(fields, key)) {
      const value = fields[key];
      if (Array.isArray(value) && value[0] && typeof value[0] === "object" && "displayName" in value[0]) {
        return value[0].displayName as string;
      }
      if (typeof value === "string" && value.trim()) return value;
    }
  }
  return undefined;
}

function resolvePeriodEnding(fields: Record<string, any>) {
  const candidates = ["Period Ending", "Period", "As of Date"];
  for (const key of candidates) {
    if (Object.prototype.hasOwnProperty.call(fields, key)) {
      return fields[key];
    }
  }
  return undefined;
}

export async function GET() {
  try {
    const session = await getSession();
    const user = session?.user;
    const email = user?.email;
    if (!session || !user || !email) {
      return Response.json({ error: "Unauthorized" }, { status: 401 });
    }

    const role = (user.role as Role | undefined) ?? "lp";
    const { records, note } = await loadLpInvestmentRecords(email, role, VIEW_ID);
    const documents: DocumentsResponse["documents"] = [];

    for (const record of records) {
      const fields = record.fields || {};
      const investmentName = resolveInvestmentName(fields);
      const periodEnding = resolvePeriodEnding(fields);

      for (const [fieldName, value] of Object.entries(fields)) {
        if (!Array.isArray(value)) continue;
        value.forEach((entry, index) => {
          if (isAttachment(entry)) {
            documents.push({
              name: entry.name || entry.filename || "Document",
              size: entry.size,
              type: entry.type,
              investmentId: record.id,
              investmentName,
              periodEnding,
              field: fieldName,
              index,
            });
          }
        });
      }
    }

    const payload: DocumentsResponse = { documents, note };
    return Response.json(payload);
  } catch (error: any) {
    console.error("[lp-documents] Failed to load documents", error);
    return Response.json({ error: error?.message || "Failed to load documents" }, { status: 500 });
  }
}
