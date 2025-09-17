import Airtable from "airtable";
import Bottleneck from "bottleneck";
import type { Role } from "@/lib/auth-helpers";
import { normalizeFieldKey } from "@/lib/airtable-shared";

const base = new Airtable({ apiKey: process.env.AIRTABLE_API_KEY! }).base(
  process.env.AIRTABLE_BASE_ID!
);
const limiter = new Bottleneck({ minTime: 220 });

const CONTACTS_TABLE = "Contacts";
const INVEST_TABLE = "Partner Investments";
const VISIBILITY_TABLE = "VisibilityRules";

// Support both "Primary Contact" and "PRIMARY CONTACT"
const CONTACT_LINK_FIELD_CANDIDATES = ["Primary Contact", "PRIMARY CONTACT"];

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
  if (typeof v === "string") return Number.parseFloat(v.replace(/[,$]/g, "")) || 0;
  return 0;
}

type ContactRecord = { id: string; fields: Record<string, any> };
type InvestmentRecord = {
  id: string;
  fields: Record<string, any>;
  _updatedTime: string | null;
};

function escapeFormulaValue(value: string) {
  return value.replace(/'/g, "''");
}

// 1) Find one or more Contact records that match email
export async function findContactsByEmail(email: string): Promise<ContactRecord[]> {
  const e = normEmail(email);
  if (!e) return [];
  const formula = `LOWER({Email}) = '${escapeFormulaValue(e)}'`;
  try {
    const records = await limiter.schedule(() =>
      base(CONTACTS_TABLE)
        .select({ filterByFormula: formula })
        .all()
    );
    return records.map((r) => ({ id: r.id, fields: r.fields as any }));
  } catch (error) {
    console.error("[lp-server] Failed to find contacts by email", error);
    throw error;
  }
}

// 2) Fetch Partner Investments for given Contact IDs (supports multi-contact links)
export async function getInvestmentsForContactIds(
  contactIds: string[],
  viewId?: string
): Promise<InvestmentRecord[]> {
  if (!contactIds.length) return [];

  const sel: { view?: string } = {};
  if (viewId) sel.view = viewId;

  try {
    const records = await limiter.schedule(() => base(INVEST_TABLE).select(sel).all());
    return records
      .filter((rec) => {
        const fields = rec.fields as any;
        const linkFieldName = pickExistingField(fields, CONTACT_LINK_FIELD_CANDIDATES);
        const linked = (linkFieldName ? fields[linkFieldName] : []) as string[] | undefined;
        if (!linked?.length) return false;
        return linked.some((id) => contactIds.includes(id));
      })
      .map((rec) => ({
        id: rec.id,
        fields: rec.fields as any,
        _updatedTime: (rec as any)._rawJson?.modifiedTime || null,
      }));
  } catch (error) {
    console.error("[lp-server] Failed to load partner investments", error);
    throw error;
  }
}

// 3) Expand linked fields (Target Securities, Partner, Fund, Primary Contact/PRIMARY CONTACT)
const LINK_EXPANDS: Record<string, string> = {
  "Target Securities": "Target Securities",
  Partner: "Partners",
  Fund: "JBV Entities",
  "Primary Contact": "Contacts",
  "PRIMARY CONTACT": "Contacts",
};

export async function expandLinked(record: InvestmentRecord): Promise<InvestmentRecord> {
  const fields = { ...record.fields };

  for (const [fieldName, table] of Object.entries(LINK_EXPANDS)) {
    const ids = fields[fieldName] as string[] | undefined;
    if (!ids?.length) continue;

    const linked = (
      await Promise.all(
        ids.map(async (id) => {
          try {
            const result = await limiter.schedule(() => base(table).find(id));
            return {
              id: result.id,
              displayName:
                (result.fields["Name"] as string) ||
                (result.fields["Full Name"] as string) ||
                (result.fields["Company"] as string) ||
                (result.fields["Email"] as string) ||
                result.id,
              fields: result.fields,
            };
          } catch (error) {
            console.error(
              `[lp-server] Failed to expand linked record ${fieldName} (${table})`,
              error
            );
            return null;
          }
        })
      )
    ).filter(Boolean);

    fields[fieldName] = linked;
  }

  return { ...record, fields };
}

const visibilityCache = new Map<Role, Set<string>>();

async function getAllowedFields(role: Role): Promise<Set<string> | null> {
  if (role === "admin") return null;

  if (visibilityCache.has(role)) {
    return visibilityCache.get(role)!;
  }

  try {
    const rules = await limiter.schedule(() =>
      base(VISIBILITY_TABLE)
        .select({ filterByFormula: "{tableId} = 'Partner Investments'" })
        .all()
    );

    const allowSet = new Set<string>();
    for (const r of rules) {
      const rf = r.fields as any;
      const fieldId = rf["fieldId"] as string | undefined;
      if (!fieldId) continue;
      const allow = role === "lp" ? !!rf["visibleToLP"] : !!rf["visibleToPartners"];
      if (allow) allowSet.add(fieldId);
    }

    visibilityCache.set(role, allowSet);
    return allowSet;
  } catch (error) {
    console.error("[lp-server] Failed to load visibility rules", error);
    return new Set();
  }
}

// 4) Visibility: keep only allowed fields
export async function applyVisibility(
  fields: Record<string, any>,
  role: Role
): Promise<Record<string, any>> {
  if (role === "admin") return { ...fields };
  const allowSet = await getAllowedFields(role);
  if (!allowSet || allowSet.size === 0) {
    return {};
  }

  const kept: Record<string, any> = {};
  Object.keys(fields).forEach((k) => {
    if (allowSet.has(k)) kept[k] = fields[k];
  });
  return kept;
}

// 5) Metrics from visible fields (Total NAV preferred, fallback Current NAV)
export function computeMetrics(rows: Array<{ fields: any }>) {
  let commitmentTotal = 0;
  let navTotal = 0;
  let distributionsTotal = 0;
  let moicSum = 0;
  let moicCount = 0;

  let hasCommitment = false;
  let hasNav = false;
  let hasDistributions = false;
  let hasMoic = false;

  for (const r of rows) {
    const rawFields = r.fields || {};
    const normalizedFields: Record<string, any> = {};
    for (const [key, value] of Object.entries(rawFields)) {
      normalizedFields[normalizeFieldKey(key)] = value;
    }

    if (Object.prototype.hasOwnProperty.call(normalizedFields, "commitment")) {
      hasCommitment = true;
      commitmentTotal += num(normalizedFields["commitment"]);
    }

    if (Object.prototype.hasOwnProperty.call(normalizedFields, "distributions")) {
      hasDistributions = true;
      distributionsTotal += num(normalizedFields["distributions"]);
    }

    const totalNavValue = normalizedFields["total nav"];
    const currentNavValue = normalizedFields["current nav"];
    if (totalNavValue !== undefined || currentNavValue !== undefined) {
      hasNav = true;
      const totalNav = totalNavValue !== undefined ? num(totalNavValue) : 0;
      const currentNav = currentNavValue !== undefined ? num(currentNavValue) : 0;
      navTotal += totalNav > 0 ? totalNav : currentNav;
    }

    const moicValue =
      normalizedFields["net moic"] !== undefined
        ? normalizedFields["net moic"]
        : normalizedFields["moic"];
    if (moicValue !== undefined) {
      hasMoic = true;
      const moic = num(moicValue);
      if (moic > 0) {
        moicSum += moic;
        moicCount += 1;
      }
    }
  }

  return {
    commitmentTotal,
    navTotal,
    distributionsTotal,
    netMoicAvg: moicCount ? moicSum / moicCount : 0,
    availability: {
      commitment: hasCommitment,
      nav: hasNav,
      distributions: hasDistributions,
      netMoic: hasMoic,
    },
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

export async function loadLpInvestmentRecords(
  email: string,
  role: Role,
  viewId?: string
): Promise<{ contacts: ContactRecord[]; records: InvestmentRecord[]; note?: string }> {
  const contacts = await findContactsByEmail(email);
  const contactIds = contacts.map((c) => c.id);

  if (!contactIds.length) {
    return { contacts, records: [], note: "contact-not-found" };
  }

  const investments = await getInvestmentsForContactIds(contactIds, viewId);
  const note = !investments.length && viewId ? "view-filtered" : undefined;

  const expanded = await Promise.all(investments.map((record) => expandLinked(record)));
  const visible = await Promise.all(
    expanded.map(async (record) => ({
      ...record,
      fields: await applyVisibility(record.fields, role),
    }))
  );

  return { contacts, records: visible, note };
}

export type { ContactRecord, InvestmentRecord };
