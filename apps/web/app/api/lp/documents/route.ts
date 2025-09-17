import { getSession } from "@/lib/auth";
import type { Role } from "@/lib/auth-helpers";
import { loadLpInvestmentsForEmail } from "@/lib/lp-server";
import type { LpDocumentItem, LpDocumentsResponse } from "@/types/lp";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Attachment = {
  name?: string;
  url?: string;
  size?: number;
  type?: string;
  filename?: string;
};

function isAttachment(value: any): value is Attachment {
  return value && typeof value === "object" && typeof value.url === "string";
}

function resolveInvestmentName(fields: Record<string, any>) {
  const preferredKeys = ["Partner Investment", "Investment", "Name", "Title", "Fund"];
  for (const key of preferredKeys) {
    if (!Object.prototype.hasOwnProperty.call(fields, key)) continue;
    const value = fields[key];
    if (typeof value === "string" && value.trim()) return value;
    if (Array.isArray(value) && value.length) {
      const first = value[0];
      if (first && typeof first === "object" && "displayName" in first) {
        return (value as any[])
          .map((item) => (item && typeof item === "object" ? item.displayName || item.name || item.id : String(item)))
          .filter(Boolean)
          .join(", ");
      }
    }
  }
  return undefined;
}

function resolvePeriodEnding(fields: Record<string, any>) {
  const candidates = ["Period Ending", "Period", "As of Date", "Date"];
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
    const { records, note } = await loadLpInvestmentsForEmail(email, role);

    const documents: LpDocumentItem[] = [];

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

    const payload: LpDocumentsResponse = { documents };
    if (note) payload.note = note;

    return Response.json(payload);
  } catch (error: any) {
    console.error("[lp-documents] Failed to load documents", error);
    return Response.json({ error: error?.message || "Failed to load documents" }, { status: 500 });
  }
}
