import { getSession } from "@/lib/auth";
import { type Role } from "@/lib/auth-helpers";
import { loadPartnerInvestmentRecords } from "@/lib/lp-server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Attachment = {
  name: string;
  url: string;
  size?: number;
  type?: string;
  filename?: string;
};

function isAttachment(value: any): value is Attachment {
  return value && typeof value === "object" && typeof value.url === "string";
}

function resolveInvestmentName(fields: Record<string, any>) {
  const preferredKeys = ["Partner Investment", "Investment", "Name", "Title"];
  for (const key of preferredKeys) {
    if (Object.prototype.hasOwnProperty.call(fields, key)) {
      const value = fields[key];
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
    const { records } = await loadPartnerInvestmentRecords(email, role);

    const documents: Array<{
      name: string;
      url: string;
      size?: number;
      type?: string;
      investmentId: string;
      investmentName?: string;
      periodEnding?: any;
    }> = [];

    for (const record of records) {
      const fields = record.fields || {};
      const investmentName = resolveInvestmentName(fields);
      const periodEnding = resolvePeriodEnding(fields);

      for (const value of Object.values(fields)) {
        if (!Array.isArray(value)) continue;
        for (const entry of value) {
          if (isAttachment(entry)) {
            documents.push({
              name: entry.name || entry.filename || "Document",
              url: entry.url,
              size: entry.size,
              type: entry.type,
              investmentId: record.id,
              investmentName,
              periodEnding,
            });
          }
        }
      }
    }

    return Response.json({ documents });
  } catch (error: any) {
    return Response.json({ error: error?.message || "Failed to load documents" }, { status: 500 });
  }
}
