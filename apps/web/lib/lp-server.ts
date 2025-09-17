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

const EMAIL_FILTER_STRATEGIES = [
  {
    id: "primaryContactCsv",
    build: (email: string) =>
      `FIND(LOWER('${escapeFormulaValue(email)}'), LOWER({PrimaryContactEmailCSV})) > 0`,
  },
  {
    id: "primaryContactEmail",
    build: (email: string) =>
      `LOWER({Primary Contact Email})='${escapeFormulaValue(email)}'`,
  },
  {
    id: "primaryContactCaps",
    build: (email: string) =>
      `LOWER({PRIMARY CONTACT Email})='${escapeFormulaValue(email)}'`,
  },
];

const VISIBILITY_CACHE_TTL_MS = 60 * 1000;

type VisibilityCacheEntry = {
  hiddenFieldsForLp: Set<string>;
  hiddenNormalizedForLp: Set<string>;
};

type VisibilityCache = {
  expiresAt: number;
  byTable: Map<string, VisibilityCacheEntry>;
};

let cachedFilterStrategy: (typeof EMAIL_FILTER_STRATEGIES)[number] | null = null;
let visibilityCache: VisibilityCache | null = null;

function escapeFormulaValue(value: string) {
  return value.replace(/'/g, "\\'");
}

function normalizeIdentifier(value: string) {
  return value.trim().toLowerCase();
}

function isUnknownFieldError(error: any) {
  const message = typeof error?.message === "string" ? error.message : "";
  const errorString = typeof error?.error === "string" ? error.error : "";
  return /unknown field name/i.test(message) || /unknown field name/i.test(errorString);
}

async function resolveFilterStrategy(email: string) {
  if (cachedFilterStrategy) {
    return cachedFilterStrategy;
  }

  for (const strategy of EMAIL_FILTER_STRATEGIES) {
    try {
      await base(PARTNER_INVESTMENTS_TABLE)
        .select({
          filterByFormula: strategy.build(email),
          maxRecords: 1,
          ...(VIEW_ID ? { view: VIEW_ID } : {}),
        })
        .firstPage();
      cachedFilterStrategy = strategy;
      return strategy;
    } catch (error) {
      if (isUnknownFieldError(error)) {
        continue;
      }
      throw error;
    }
  }

  const fallback = EMAIL_FILTER_STRATEGIES[EMAIL_FILTER_STRATEGIES.length - 1];
  cachedFilterStrategy = fallback;
  return fallback;
}

function toNumber(value: any): number | null {
  if (value === null || value === undefined) return null;
  if (typeof value === "number") return Number.isFinite(value) ? value : null;
  if (typeof value === "string") {
    const cleaned = value.replace(/[^0-9.-]+/g, "");
    if (!cleaned) return null;
    const parsed = Number(cleaned);
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
}

function selectFieldValue(fields: Record<string, any>, normalized: string) {
  for (const [key, value] of Object.entries(fields)) {
    if (normalizeFieldKey(key) === normalized) {
      return value;
    }
  }
  return undefined;
}

async function loadVisibilityCache(): Promise<VisibilityCache> {
  const now = Date.now();
  if (visibilityCache && visibilityCache.expiresAt > now) {
    return visibilityCache;
  }

  const records = await base(VISIBILITY_RULES_TABLE)
    .select({ pageSize: 100 })
    .all();

  const byTable = new Map<string, VisibilityCacheEntry>();
  const partnerTableKey = normalizeIdentifier(PARTNER_INVESTMENTS_TABLE);

  for (const record of records) {
    const fields = (record.fields || {}) as Record<string, any>;
    const tableId = String(fields.tableId ?? "").trim();
    if (!tableId) continue;

    const normalizedTable = normalizeIdentifier(tableId);
    if (normalizedTable !== partnerTableKey && !normalizedTable.startsWith("tbl")) {
      continue;
    }

    const cacheKey = normalizedTable.startsWith("tbl") ? normalizedTable : partnerTableKey;
    let entry = byTable.get(cacheKey);
    if (!entry) {
      entry = { hiddenFieldsForLp: new Set(), hiddenNormalizedForLp: new Set() };
      byTable.set(cacheKey, entry);
    }
    if (cacheKey !== partnerTableKey && !byTable.has(partnerTableKey)) {
      byTable.set(partnerTableKey, entry);
    }

    if (fields.visibleToLP === false) {
      const fieldId = String(fields.fieldId ?? "").trim();
      if (fieldId) {
        entry.hiddenFieldsForLp.add(fieldId);
        entry.hiddenNormalizedForLp.add(normalizeFieldKey(fieldId));
      }
    }
  }

  if (!byTable.has(partnerTableKey)) {
    byTable.set(partnerTableKey, { hiddenFieldsForLp: new Set(), hiddenNormalizedForLp: new Set() });
  }

  visibilityCache = {
    expiresAt: now + VISIBILITY_CACHE_TTL_MS,
    byTable,
  };

  return visibilityCache;
}

export async function filterFormulaForEmail(email: string) {
  const normalized = email.trim().toLowerCase();
  if (!normalized) {
    throw new Error("Email is required to build filter formula.");
  }
  const strategy = await resolveFilterStrategy(normalized);
  return strategy.build(normalized);
}

export async function expandLinked(record: AirtableRecord): Promise<ExpandedRecord> {
  const [expanded] = await expandPartnerInvestmentRecords([record]);
  return expanded;
}

export async function applyVisibility(records: ExpandedRecord[], role: "lp" | "admin" | "partner") {
  if (role !== "lp") {
    return records;
  }

  const cache = await loadVisibilityCache();
  const partnerTableKey = normalizeIdentifier(PARTNER_INVESTMENTS_TABLE);
  const entry = cache.byTable.get(partnerTableKey) ?? Array.from(cache.byTable.values())[0];
  if (!entry) {
    return records;
  }

  return records.map((record) => {
    const filteredFields: Record<string, any> = {};
    const originalFields = record.fields || {};
    for (const [key, value] of Object.entries(originalFields)) {
      const normalizedKey = normalizeFieldKey(key);
      if (entry.hiddenFieldsForLp.has(key) || entry.hiddenNormalizedForLp.has(normalizedKey)) {
        continue;
      }
      filteredFields[key] = value;
    }
    return { ...record, fields: filteredFields };
  });
}

export function computeMetrics(records: ExpandedRecord[]) {
  let commitmentTotal = 0;
  let navTotal = 0;
  let distributionsTotal = 0;
  let moicSum = 0;
  let moicCount = 0;

  for (const record of records) {
    const fields = record.fields || {};
    const commitment = toNumber(selectFieldValue(fields, "commitment"));
    if (commitment !== null) {
      commitmentTotal += commitment;
    }

    const totalNav = toNumber(selectFieldValue(fields, "total nav"));
    const currentNav = toNumber(selectFieldValue(fields, "current nav"));
    if (totalNav !== null) {
      navTotal += totalNav;
    } else if (currentNav !== null) {
      navTotal += currentNav;
    }

    const distributions = toNumber(selectFieldValue(fields, "distributions"));
    if (distributions !== null) {
      distributionsTotal += distributions;
    }

    const netMoic = toNumber(selectFieldValue(fields, "net moic")) ?? toNumber(selectFieldValue(fields, "moic"));
    if (netMoic !== null) {
      moicSum += netMoic;
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

export async function fetchPartnerInvestmentsForEmail(email: string) {
  const formula = await filterFormulaForEmail(email);
  const rows = (await base(PARTNER_INVESTMENTS_TABLE)
    .select({
      filterByFormula: formula,
      ...(VIEW_ID ? { view: VIEW_ID } : {}),
    })
    .all()) as Airtable.Record<any>[];

  const expanded = await expandPartnerInvestmentRecords(rows as AirtableRecord[]);
  const visible = await applyVisibility(expanded, "lp");
  return { records: visible, rawRecords: expanded, formula };
}

export async function fetchPartnerInvestmentRecordById(
  recordId: string,
  email: string,
  role: "lp" | "admin" | "partner" = "lp"
): Promise<ExpandedRecord | null> {
  const normalizedId = recordId.trim();
  if (!normalizedId) return null;
  const formula = await filterFormulaForEmail(email);
  const recordFilter = `AND(RECORD_ID()='${escapeFormulaValue(normalizedId)}', ${formula})`;
  const rows = (await base(PARTNER_INVESTMENTS_TABLE)
    .select({
      filterByFormula: recordFilter,
      maxRecords: 1,
      ...(VIEW_ID ? { view: VIEW_ID } : {}),
    })
    .all()) as Airtable.Record<any>[];
  if (!rows.length) {
    return null;
  }
  const [expanded] = await expandPartnerInvestmentRecords(rows as AirtableRecord[]);
  const [visible] = await applyVisibility([expanded], role);
  return visible ?? null;
}

export type DocumentsResult = {
  records: ExpandedRecord[];
  documents: Array<{
    recordId: string;
    field: string;
    index: number;
    name: string;
    type?: string;
    size?: number;
    url: string;
    investmentName: string;
    periodEnding?: any;
  }>;
};

export function buildDocumentList(records: ExpandedRecord[]): DocumentsResult["documents"] {
  const documents: DocumentsResult["documents"] = [];
  const periodFieldCandidates = ["period ending", "period", "as of date", "date"];

  for (const record of records) {
    const fields = record.fields || {};
    const investmentName = inferInvestmentName(record);
    const periodField = findFirstMatchingField(fields, periodFieldCandidates);
    const periodEnding = periodField ? fields[periodField] : undefined;

    for (const [fieldName, value] of Object.entries(fields)) {
      if (!Array.isArray(value) || !value.length) continue;
      if (!value[0] || typeof value[0] !== "object" || !("url" in value[0])) continue;

      value.forEach((attachment: any, index: number) => {
        documents.push({
          recordId: record.id,
          field: fieldName,
          index,
          name: attachment.name || attachment.filename || fieldName,
          type: attachment.type,
          size: attachment.size,
          url: attachment.url,
          investmentName,
          periodEnding,
        });
      });
    }
  }

  return documents;
}

function findFirstMatchingField(fields: Record<string, any>, candidates: string[]) {
  for (const [key] of Object.entries(fields)) {
    const normalized = normalizeFieldKey(key);
    if (candidates.includes(normalized)) {
      return key;
    }
  }
  return undefined;
}

function inferInvestmentName(record: ExpandedRecord) {
  const fields = record.fields || {};
  for (const key of [
    "Partner Investment",
    "Investment",
    "Name",
    "Title",
  ]) {
    if (Object.prototype.hasOwnProperty.call(fields, key)) {
      const value = fields[key];
      if (typeof value === "string" && value.trim()) {
        return value;
      }
    }
  }
  return "Investment";
}
