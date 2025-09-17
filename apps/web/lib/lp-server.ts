import {
  PARTNER_INVESTMENTS_TABLE,
  VISIBILITY_RULES_TABLE,
  VIEW_ID,
  base,
  expandPartnerInvestmentRecords,
  normalizeFieldKey,
  type AirtableRecord,
  type ExpandedRecord,
} from "@/lib/airtable";
import type { Role } from "@/lib/auth-helpers";

const EMAIL_FORMULA_BUILDERS: ((email: string) => string)[] = [
  (email) => `FIND(LOWER('${email}'), LOWER({PrimaryContactEmailCSV}))`,
  (email) => `FIND(LOWER('${email}'), LOWER({Primary Contact Email}))`,
  (email) => `FIND(LOWER('${email}'), LOWER({PRIMARY CONTACT Email}))`,
  (email) => `LOWER({Primary Contact Email})='${email}'`,
  (email) => `LOWER({PRIMARY CONTACT Email})='${email}'`,
];

function escapeFormulaValue(value: string) {
  return value.replace(/'/g, "''");
}

function isUnknownFieldError(err: any) {
  const code = err?.error || err?.code;
  if (code === "INVALID_REQUEST_UNKNOWN_FIELD_NAME") return true;
  const message = (err?.message || "") as string;
  return typeof message === "string" && message.toLowerCase().includes("unknown field name");
}

async function fetchRowsForEmail(email: string) {
  const safeEmail = escapeFormulaValue(email.trim().toLowerCase());
  if (!safeEmail) {
    return [] as AirtableRecord[];
  }

  for (const builder of EMAIL_FORMULA_BUILDERS) {
    const formula = builder(safeEmail);
    try {
      const records = await base(PARTNER_INVESTMENTS_TABLE)
        .select({
          filterByFormula: formula,
          ...(VIEW_ID ? { view: VIEW_ID } : {}),
        })
        .all();
      return records as AirtableRecord[];
    } catch (error: any) {
      if (isUnknownFieldError(error)) {
        continue;
      }
      throw error;
    }
  }

  // If every formula failed due to missing fields, return an empty list.
  return [] as AirtableRecord[];
}

type VisibilityContext = {
  role: Role;
  allowedFields: Set<string>;
  allowedNormalized: Set<string>;
  ruleCount: number;
};

async function resolveVisibility(role: Role): Promise<VisibilityContext | null> {
  if (role === "admin") {
    return null;
  }

  const records = (await base(VISIBILITY_RULES_TABLE)
    .select({ filterByFormula: "{tableId}='Partner Investments'" })
    .all()) as AirtableRecord[];

  const allowedFields = new Set<string>();
  const allowedNormalized = new Set<string>();

  for (const record of records) {
    const fields = (record.fields || {}) as Record<string, any>;
    const fieldId = fields.fieldId as string | undefined;
    if (!fieldId) continue;
    const visible = role === "lp" ? fields.visibleToLP === true : fields.visibleToPartners === true;
    if (visible) {
      allowedFields.add(fieldId);
      const normalized = normalizeFieldKey(fieldId);
      if (normalized) allowedNormalized.add(normalized);
    }
  }

  const ruleCount = records.length;

  if (ruleCount === 0) {
    return null;
  }

  return {
    role,
    allowedFields,
    allowedNormalized,
    ruleCount,
  };
}

function filterFields(
  fields: Record<string, any>,
  visibility: VisibilityContext | null
): Record<string, any> {
  if (!visibility) {
    return { ...fields };
  }

  const { allowedFields, allowedNormalized, ruleCount } = visibility;
  if (ruleCount === 0) {
    return { ...fields };
  }

  const filtered: Record<string, any> = {};

  for (const [key, value] of Object.entries(fields)) {
    const normalized = normalizeFieldKey(key);
    if (allowedFields.has(key) || allowedNormalized.has(normalized)) {
      filtered[key] = value;
    }
  }

  return filtered;
}

export async function loadPartnerInvestmentRecords(email: string, role: Role) {
  const rows = await fetchRowsForEmail(email);
  const visibility = await resolveVisibility(role);
  const expanded = await expandPartnerInvestmentRecords(rows);

  const filtered = expanded.map((record) => ({
    ...record,
    fields: filterFields((record.fields || {}) as Record<string, any>, visibility),
  }));

  return { records: filtered, visibility };
}

function parseNumber(value: any) {
  if (value === null || value === undefined) return null;
  if (typeof value === "number") {
    return Number.isFinite(value) ? value : null;
  }
  if (typeof value === "string") {
    const cleaned = value.replace(/[^0-9.-]+/g, "");
    if (!cleaned) return null;
    const parsed = Number(cleaned);
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
}

function findFieldKey(records: ExpandedRecord[], candidates: string[]) {
  if (!records.length) return undefined;
  const normalizedCandidates = candidates.map((name) => normalizeFieldKey(name));
  for (const normalizedCandidate of normalizedCandidates) {
    if (!normalizedCandidate) continue;
    for (const record of records) {
      const fields = record.fields || {};
      for (const key of Object.keys(fields)) {
        if (normalizeFieldKey(key) === normalizedCandidate) {
          return key;
        }
      }
    }
  }
  return undefined;
}

export function computeMetrics(records: ExpandedRecord[]) {
  const commitmentKey = findFieldKey(records, ["Commitment"]);
  const totalNavKey = findFieldKey(records, ["Total NAV"]);
  const currentNavKey = findFieldKey(records, ["Current NAV"]);
  const distributionsKey = findFieldKey(records, ["Distributions"]);
  const netMoicKey = findFieldKey(records, ["Net MOIC", "MOIC"]);

  let commitmentTotal = 0;
  let navTotal = 0;
  let distributionsTotal = 0;
  let netMoicSum = 0;
  let netMoicCount = 0;

  for (const record of records) {
    const fields = record.fields || {};

    if (commitmentKey && Object.prototype.hasOwnProperty.call(fields, commitmentKey)) {
      const value = parseNumber(fields[commitmentKey]);
      if (value !== null) commitmentTotal += value;
    }

    if (totalNavKey && Object.prototype.hasOwnProperty.call(fields, totalNavKey)) {
      const value = parseNumber(fields[totalNavKey]);
      if (value !== null) navTotal += value;
    } else if (currentNavKey && Object.prototype.hasOwnProperty.call(fields, currentNavKey)) {
      const value = parseNumber(fields[currentNavKey]);
      if (value !== null) navTotal += value;
    }

    if (distributionsKey && Object.prototype.hasOwnProperty.call(fields, distributionsKey)) {
      const value = parseNumber(fields[distributionsKey]);
      if (value !== null) distributionsTotal += value;
    }

    if (netMoicKey && Object.prototype.hasOwnProperty.call(fields, netMoicKey)) {
      const value = parseNumber(fields[netMoicKey]);
      if (value !== null) {
        netMoicSum += value;
        netMoicCount += 1;
      }
    }
  }

  const netMoicAvg = netMoicCount > 0 ? netMoicSum / netMoicCount : 0;

  return {
    commitmentTotal,
    navTotal,
    distributionsTotal,
    netMoicAvg,
  };
}
