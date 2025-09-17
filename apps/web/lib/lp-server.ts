import Airtable from "airtable";
import Bottleneck from "bottleneck";
import type { Role } from "@/lib/auth-helpers";
import type { LpInvestmentRecord, LpMetrics } from "@/types/lp";

const base = new Airtable({ apiKey: process.env.AIRTABLE_API_KEY! }).base(
  process.env.AIRTABLE_BASE_ID!
);
const limiter = new Bottleneck({ minTime: 220 });

const CONTACTS_TABLE = "Contacts";
const INVEST_TABLE = "Partner Investments";
const VISIBILITY_TABLE = "VisibilityRules";
export const PARTNER_INVESTMENTS_TABLE = INVEST_TABLE;

const CONTACT_LINK_FIELD_CANDIDATES = ["Primary Contact", "PRIMARY CONTACT"];

const LINK_EXPANDS: Record<string, string> = {
  "Target Securities": "Target Securities",
  Partner: "Partners",
  Fund: "JBV Entities",
  "Primary Contact": "Contacts",
  "PRIMARY CONTACT": "Contacts",
};

const ZERO_METRICS: LpMetrics = {
  commitmentTotal: 0,
  navTotal: 0,
  distributionsTotal: 0,
  netMoicAvg: 0,
};

export type ContactRecord = { id: string; fields: Record<string, any> };
export type LoadLpInvestmentsResult = {
  contacts: ContactRecord[];
  records: LpInvestmentRecord[];
  note?: "contact-not-found" | "view-filtered";
};

function escapeFormulaValue(value: string) {
  return value.replace(/'/g, "''");
}

function normalizeFieldKey(name: string) {
  return (name || "").trim().toLowerCase();
}

// Try to find a field name that exists on a record
export function pickExistingField(fields: Record<string, any>, candidates: string[]) {
  return candidates.find((c) => Object.prototype.hasOwnProperty.call(fields, c));
}

// Normalize emails for comparison
export function normEmail(s: string) {
  return (s || "").toLowerCase().trim();
}

// Coerce currency/number strings like "$30,000.00" → 30000
export function num(v: any): number {
  if (v == null || v === "") return 0;
  if (typeof v === "number") return Number.isFinite(v) ? v : 0;
  if (typeof v === "string") {
    const cleaned = v.replace(/[,$]/g, "");
    const parsed = Number.parseFloat(cleaned);
    return Number.isFinite(parsed) ? parsed : 0;
  }
  return 0;
}

// 1) Find one or more Contact records that match email
export async function findContactsByEmail(email: string) {
  const e = normEmail(email);
  if (!e) return [] as ContactRecord[];

  const formula = `LOWER({Email}) = '${escapeFormulaValue(e)}'`;
  try {
    const records = await limiter.schedule(() =>
      base(CONTACTS_TABLE)
        .select({ filterByFormula: formula })
        .all()
    );
    return records.map((r) => ({ id: r.id, fields: (r.fields || {}) as Record<string, any> }));
  } catch (error) {
    console.error("[lp-server] Failed to find contacts by email", error);
    throw error;
  }
}

// 2) Fetch Partner Investments for given Contact IDs (supports multi-contact links)
export async function getInvestmentsForContactIds(contactIds: string[], viewId?: string) {
  if (!contactIds.length) return [] as LpInvestmentRecord[];

  const sel: Airtable.SelectOptions<Record<string, any>> = {};
  if (viewId) sel.view = viewId;

  try {
    const records = await limiter.schedule(() => base(INVEST_TABLE).select(sel).all());
    return records
      .filter((rec) => {
        const fields = (rec.fields || {}) as Record<string, any>;
        const linkFieldName = pickExistingField(fields, CONTACT_LINK_FIELD_CANDIDATES);
        const linked = (linkFieldName ? fields[linkFieldName] : []) as string[] | undefined;
        if (!linked?.length) return false;
        return linked.some((id) => contactIds.includes(id));
      })
      .map((rec) => ({
        id: rec.id,
        fields: (rec.fields || {}) as Record<string, any>,
        _updatedTime: (rec as any)._rawJson?.modifiedTime || null,
      }));
  } catch (error) {
    console.error("[lp-server] Failed to load partner investments", error);
    throw error;
  }
}

// 3) Expand linked fields (Target Securities, Partner, Fund, Primary Contact/PRIMARY CONTACT)
export async function expandLinked(record: { id: string; fields: any; _updatedTime?: string | null }) {
  const fields = { ...(record.fields || {}) };

  for (const [fieldName, table] of Object.entries(LINK_EXPANDS)) {
    const ids = fields[fieldName] as string[] | undefined;
    if (!ids?.length) continue;

    const linked = await Promise.all(
      ids.map(async (id) => {
        try {
          const r = await limiter.schedule(() => base(table).find(id));
          return {
            id: r.id,
            displayName:
              (r.fields["Name"] as string) ||
              (r.fields["Full Name"] as string) ||
              (r.fields["Company"] as string) ||
              (r.fields["Email"] as string) ||
              r.id,
            fields: r.fields,
          };
        } catch (error) {
          console.error(`(lp-server) Failed to expand linked record ${table}:${id}`, error);
          return { id, displayName: id, fields: {} };
        }
      })
    );

    fields[fieldName] = linked;
  }

  return { ...record, fields };
}

const visibilityCache = new Map<
  "lp" | "partner",
  { allow: Set<string>; allowNormalized: Set<string>; fetchedAt: number; hasRules: boolean }
>();

async function resolveVisibility(role: "lp" | "partner") {
  const cached = visibilityCache.get(role);
  const now = Date.now();
  if (cached && now - cached.fetchedAt < 5 * 60 * 1000) {
    return cached;
  }

  try {
    const rules = await limiter.schedule(() =>
      base(VISIBILITY_TABLE)
        .select({ filterByFormula: `{tableId} = 'Partner Investments'` })
        .all()
    );

    const allow = new Set<string>();
    const allowNormalized = new Set<string>();

    for (const r of rules) {
      const rf = (r.fields || {}) as Record<string, any>;
      const fieldId = rf["fieldId"] as string | undefined;
      if (!fieldId) continue;
      const allowForRole = role === "lp" ? rf["visibleToLP"] === true : rf["visibleToPartners"] === true;
      if (allowForRole) {
        allow.add(fieldId);
        allowNormalized.add(normalizeFieldKey(fieldId));
      }
    }

    const entry = { allow, allowNormalized, fetchedAt: now, hasRules: rules.length > 0 };
    visibilityCache.set(role, entry);
    return entry;
  } catch (error) {
    console.error("[lp-server] Failed to load visibility rules", error);
    throw error;
  }
}

// 4) Visibility: keep only allowed fields
export async function applyVisibility(fields: Record<string, any>, role: "lp" | "partner" | "admin") {
  if (role === "admin") return { ...fields };

  const { allow, allowNormalized, hasRules } = await resolveVisibility(role);
  if (!hasRules) {
    return { ...fields };
  }
  if (!allow.size && !allowNormalized.size) {
    return {};
  }

  const kept: Record<string, any> = {};
  Object.keys(fields).forEach((k) => {
    if (allow.has(k) || allowNormalized.has(normalizeFieldKey(k))) {
      kept[k] = fields[k];
    }
  });
  return kept;
}

// 5) Metrics from visible fields (Total NAV preferred, fallback Current NAV)
export function computeMetrics(rows: Array<{ fields: any }>): LpMetrics {
  if (!rows.length) return { ...ZERO_METRICS };

  let commitmentTotal = 0;
  let navTotal = 0;
  let distributionsTotal = 0;
  let moicSum = 0;
  let moicCount = 0;

  for (const r of rows) {
    const f = r.fields || {};
    commitmentTotal += num(f["Commitment"]);
    distributionsTotal += num(f["Distributions"]);

    const totalNav = num(f["Total NAV"]);
    const currentNav = num(f["Current NAV"]);
    navTotal += totalNav > 0 ? totalNav : currentNav;

    const moic = num(f["Net MOIC"]);
    if (moic > 0) {
      moicSum += moic;
      moicCount += 1;
    }
  }

  return {
    commitmentTotal,
    navTotal,
    distributionsTotal,
    netMoicAvg: moicCount ? moicSum / moicCount : 0,
  };
}

// 6) Profile: derive display name from Contacts
export function contactDisplayName(contact: { fields: any }) {
  const f = contact.fields || {};
  return (
    f["Name"] ||
    f["Full Name"] ||
    f["Primary Contact"] ||
    f["PRIMARY CONTACT"] ||
    f["Company"] ||
    f["Email"] ||
    "Investor"
  );
}

export async function loadLpInvestmentsForEmail(email: string, role: Role = "lp"): Promise<LoadLpInvestmentsResult> {
  const contacts = await findContactsByEmail(email);
  if (!contacts.length) {
    return { contacts: [], records: [], note: "contact-not-found" };
  }

  const contactIds = contacts.map((contact) => contact.id).filter(Boolean);
  if (!contactIds.length) {
    return { contacts, records: [], note: "contact-not-found" };
  }

  const viewId = process.env.AIRTABLE_VIEW_ID || undefined;
  const rawRecords = await getInvestmentsForContactIds(contactIds, viewId);

  let note: "view-filtered" | undefined;
  if (viewId && !rawRecords.length) {
    note = "view-filtered";
  }

  const result: LpInvestmentRecord[] = [];
  for (const record of rawRecords) {
    const expanded = await expandLinked(record);
    const visibleFields = await applyVisibility(expanded.fields, role);
    result.push({ id: expanded.id, fields: visibleFields, _updatedTime: expanded._updatedTime ?? null });
  }

  return { contacts, records: result, note };
}

export function withLimiter<T>(task: () => Promise<T>) {
  return limiter.schedule(task);
}

export { base };
