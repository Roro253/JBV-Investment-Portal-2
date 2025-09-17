import { getSession } from "@/lib/auth";
import { type Role } from "@/lib/auth-helpers";
import {
  applyVisibility,
  expandLinked,
  findContactsByEmail,
  getInvestmentsForContactIds,
} from "@/lib/lp-server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const VIEW_ID = process.env.AIRTABLE_VIEW_ID;

const RECOMMENDED_FIELDS = [
  "Partner Investment",
  "Partner",
  "Fund",
  "Status",
  "Commitment",
  "Contributed / Total LP Commitment",
  "Current NAV",
  "Total NAV",
  "Distributions",
  "Gain / Loss",
  "Net MOIC",
  "FMV / Share",
  "Cost / Share",
  "Paid Dates",
  "Period Ending",
  "Vintage",
  "Investment Year (K-1 Formula)",
  "Target Securities",
  "Subscription Doc",
  "Latest PCAP File",
  "PCAP Distribution Report",
  "Calculation",
  "Status (I)",
  "SubDoc Name",
  "PRIMARY CONTACT",
  "Primary Contact",
] as const;

const LINKED_FIELD_NAMES = new Set([
  "Partner",
  "Fund",
  "Target Securities",
  "Primary Contact",
  "PRIMARY CONTACT",
]);

type SummaryRecord = {
  id: string;
  fields: Record<string, any>;
  _updatedTime: string | null;
};

type SummaryResponse = {
  fieldOrder: string[];
  records: SummaryRecord[];
};

type LinkedValue = { id: string; displayName: string };

type AttachmentValue = {
  url?: string;
  name?: string;
  filename?: string;
  type?: string;
  size?: number;
};

function sanitizeLinkedValues(value: any[]): LinkedValue[] {
  return value
    .map((entry, index) => {
      if (!entry) return null;
      if (typeof entry === "string") {
        return { id: entry, displayName: entry };
      }
      if (typeof entry === "object") {
        const id = typeof entry.id === "string" ? entry.id : String(index);
        const displayName =
          (typeof entry.displayName === "string" && entry.displayName) ||
          (typeof entry.name === "string" && entry.name) ||
          (entry.fields &&
            (entry.fields["Name"] ||
              entry.fields["Full Name"] ||
              entry.fields["Company"] ||
              entry.fields["Email"])) ||
          id;
        return { id, displayName };
      }
      return null;
    })
    .filter((item): item is LinkedValue => Boolean(item));
}

function sanitizeAttachmentValues(value: any[]): AttachmentValue[] {
  return value
    .map((entry) => {
      if (!entry || typeof entry !== "object") return null;
      if (typeof entry.url !== "string") return null;
      return {
        url: entry.url,
        name: typeof entry.name === "string" ? entry.name : undefined,
        filename: typeof entry.filename === "string" ? entry.filename : undefined,
        type: typeof entry.type === "string" ? entry.type : undefined,
        size: typeof entry.size === "number" ? entry.size : undefined,
      };
    })
    .filter((item): item is AttachmentValue => Boolean(item));
}

function sanitizeFields(fields: Record<string, any>): Record<string, any> {
  const sanitized: Record<string, any> = {};
  for (const [key, value] of Object.entries(fields || {})) {
    if (value === undefined) continue;
    if (Array.isArray(value)) {
      if (LINKED_FIELD_NAMES.has(key)) {
        sanitized[key] = sanitizeLinkedValues(value);
        continue;
      }
      if (value.length && value.every((entry) => entry && typeof entry === "object" && "url" in entry)) {
        sanitized[key] = sanitizeAttachmentValues(value);
        continue;
      }
      sanitized[key] = value.slice();
      continue;
    }
    sanitized[key] = value;
  }
  return sanitized;
}

function buildFieldOrder(records: SummaryRecord[]): string[] {
  const fieldNames = new Set<string>();
  for (const record of records) {
    Object.keys(record.fields || {}).forEach((key) => {
      fieldNames.add(key);
    });
  }

  const seen = new Set<string>();
  const curated: string[] = [];
  for (const field of RECOMMENDED_FIELDS) {
    if (fieldNames.has(field) && !seen.has(field)) {
      curated.push(field);
      seen.add(field);
    }
  }

  const extras = Array.from(fieldNames)
    .filter((field) => !seen.has(field))
    .sort((a, b) => a.localeCompare(b));

  return [...curated, ...extras];
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
    const contacts = await findContactsByEmail(email);
    if (!contacts.length) {
      const payload: SummaryResponse = { fieldOrder: [], records: [] };
      return Response.json(payload);
    }

    const contactIds = contacts.map((contact) => contact.id);
    const investments = await getInvestmentsForContactIds(contactIds, VIEW_ID);

    if (!investments.length) {
      const payload: SummaryResponse = { fieldOrder: [], records: [] };
      return Response.json(payload);
    }

    const processed = await Promise.all(
      investments.map(async (record) => {
        const expanded = await expandLinked(record);
        const visibleFields = await applyVisibility(expanded.fields, role);
        const sanitizedFields = sanitizeFields(visibleFields);
        return {
          id: expanded.id,
          fields: sanitizedFields,
          _updatedTime: expanded._updatedTime ?? null,
        } satisfies SummaryRecord;
      })
    );

    const filteredRecords = processed.filter((record) => Object.keys(record.fields).length > 0);

    if (!filteredRecords.length) {
      const payload: SummaryResponse = { fieldOrder: [], records: [] };
      return Response.json(payload);
    }

    const fieldOrder = buildFieldOrder(filteredRecords);
    const payload: SummaryResponse = { fieldOrder, records: filteredRecords };
    return Response.json(payload);
  } catch (error) {
    console.error("[lp-summary] Failed to load LP summary", error);
    return Response.json({ error: "Failed to load summary" }, { status: 500 });
  }
}
