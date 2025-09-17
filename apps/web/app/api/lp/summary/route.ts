import { getSession } from "@/lib/auth";
import { type Role } from "@/lib/auth-helpers";
import { applyVisibility, expandLinked, findContactsByEmail, getInvestmentsForContactIds } from "@/lib/lp-server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const VIEW_ID = process.env.AIRTABLE_VIEW_ID;

const LINKED_FIELD_NAMES = new Set(["Partner", "Fund", "Target Securities", "Primary Contact", "PRIMARY CONTACT"]);

const CURATED_FIELDS = [
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
];

type SummaryRecord = {
  id: string;
  fields: Record<string, any>;
  _updatedTime: string | null;
};

type SummaryResponse = {
  fieldOrder: string[];
  records: SummaryRecord[];
};

function sanitizeFields(fields: Record<string, any>) {
  const sanitized: Record<string, any> = {};
  for (const [key, value] of Object.entries(fields)) {
    if (LINKED_FIELD_NAMES.has(key) && Array.isArray(value)) {
      sanitized[key] = value
        .filter((entry) => entry !== null && entry !== undefined)
        .map((entry) => {
          if (entry && typeof entry === "object") {
            const idValue = entry.id ?? entry.recordId ?? entry.displayName;
            const id = idValue != null ? String(idValue) : "";
            const displayNameValue =
              entry.displayName ?? entry.name ?? entry.fields?.Name ?? entry.fields?.["Full Name"];
            const displayName = displayNameValue != null ? String(displayNameValue) : id;
            return { id, displayName };
          }
          const asString = String(entry);
          return { id: asString, displayName: asString };
        });
      continue;
    }
    sanitized[key] = value;
  }
  return sanitized;
}

function buildFieldOrder(records: SummaryRecord[]) {
  const encountered: string[] = [];
  const seen = new Set<string>();
  records.forEach((record) => {
    const fields = record.fields || {};
    Object.keys(fields).forEach((key) => {
      if (!seen.has(key)) {
        seen.add(key);
        encountered.push(key);
      }
    });
  });

  if (!encountered.length) return [];

  const curated: string[] = [];
  const curatedSet = new Set<string>();
  for (const field of CURATED_FIELDS) {
    if (seen.has(field) && !curatedSet.has(field)) {
      curated.push(field);
      curatedSet.add(field);
    }
  }

  const additional = encountered.filter((field) => !curatedSet.has(field));
  additional.sort((a, b) => a.localeCompare(b, undefined, { sensitivity: "base" }));

  return [...curated, ...additional];
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
    const contactIds = contacts.map((contact) => contact.id);

    if (!contactIds.length) {
      const payload: SummaryResponse = { fieldOrder: [], records: [] };
      return Response.json(payload);
    }

    const investments = await getInvestmentsForContactIds(contactIds, VIEW_ID);
    if (!investments.length) {
      const payload: SummaryResponse = { fieldOrder: [], records: [] };
      return Response.json(payload);
    }

    const expanded = await Promise.all(investments.map((record) => expandLinked(record)));
    const visible = await Promise.all(
      expanded.map(async (record) => {
        const allowed = await applyVisibility(record.fields, role);
        const sanitized = sanitizeFields(allowed);
        return {
          id: record.id,
          fields: sanitized,
          _updatedTime: record._updatedTime ?? null,
        } as SummaryRecord;
      })
    );

    const filtered = visible.filter((record) => Object.keys(record.fields).length > 0);
    if (!filtered.length) {
      const payload: SummaryResponse = { fieldOrder: [], records: [] };
      return Response.json(payload);
    }

    const fieldOrder = buildFieldOrder(filtered);
    const payload: SummaryResponse = { fieldOrder, records: filtered };
    return Response.json(payload);
  } catch (error: any) {
    console.error("[lp-summary] Failed to load LP summary", error);
    return Response.json({ error: error?.message || "Failed to load summary" }, { status: 500 });
  }
}
