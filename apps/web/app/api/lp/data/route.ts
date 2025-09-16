import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import type Airtable from "airtable";
import {
  expandPartnerInvestmentRecords,
  fetchVisibilityRules,
  selectPartnerInvestmentsByEmail,
  type ExpandedRecord,
} from "@/lib/airtablePartnerInvestments";
import { authOptions } from "@/app/api/auth/[...nextauth]/route";

const ESSENTIAL_FIELDS = [
  "Partner Investment",
  "Investment",
  "Name",
  "Fund",
  "PRIMARY CONTACT",
  "Primary Contact",
  "Period Ending",
  "Status",
  "Status (I)",
  "Commitment",
  "Total NAV",
  "Current NAV",
  "Distributions",
  "Net MOIC",
];

function toNumber(value: any): number | null {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string") {
    const cleaned = value.replace(/[^0-9.-]/g, "");
    if (!cleaned) return null;
    const parsed = Number(cleaned);
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
}

function buildAllowedFields(role: string | undefined, rules: Airtable.Record<any>[]) {
  if (role === "admin" || !rules.length) return null;
  const allowed = new Set<string>();
  for (const rule of rules) {
    const fields = rule.fields as Record<string, any>;
    const fieldId = fields?.fieldId as string | undefined;
    const visibleToLP = Boolean(fields?.visibleToLP);
    if (fieldId && visibleToLP) {
      allowed.add(fieldId);
    }
  }
  for (const field of ESSENTIAL_FIELDS) {
    allowed.add(field);
  }
  return allowed;
}

function filterRecordFields(record: ExpandedRecord, allowed: Set<string> | null) {
  if (!allowed) return record.fields;
  const filtered: Record<string, any> = {};
  for (const [key, value] of Object.entries(record.fields)) {
    if (allowed.has(key)) {
      filtered[key] = value;
    }
  }
  return filtered;
}

function computeMetrics(records: Array<{ fields: Record<string, any> }>) {
  let commitmentTotal = 0;
  let navTotal = 0;
  let distributionsTotal = 0;
  let netMoicSum = 0;
  let netMoicCount = 0;

  for (const record of records) {
    const fields = record.fields || {};

    const commitment = toNumber(fields["Commitment"]);
    if (commitment !== null) commitmentTotal += commitment;

    const nav =
      toNumber(fields["Total NAV"]) ??
      toNumber(fields["Current NAV"]);
    if (nav !== null) navTotal += nav;

    const distributions = toNumber(fields["Distributions"]);
    if (distributions !== null) distributionsTotal += distributions;

    const netMoic = toNumber(fields["Net MOIC"]);
    if (netMoic !== null) {
      netMoicSum += netMoic;
      netMoicCount += 1;
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

export async function GET() {
  const session = await getServerSession(authOptions);
  if (!session || !session.user?.email) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const email = session.user.email;
  const role = session.user.role ?? "lp";

  const [{ rows }, visibilityRules] = await Promise.all([
    selectPartnerInvestmentsByEmail(email),
    fetchVisibilityRules(),
  ]);

  const expanded = await expandPartnerInvestmentRecords(rows);
  const allowedSet = buildAllowedFields(role, visibilityRules as Airtable.Record<any>[]);

  const filteredRecords = expanded.map((record) => ({
    id: record.id,
    fields: filterRecordFields(record, allowedSet),
    _updatedTime: record._updatedTime,
  }));

  const metrics = computeMetrics(filteredRecords);

  return NextResponse.json({
    records: filteredRecords,
    metrics,
  });
}
