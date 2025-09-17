export type Role = "admin" | "lp" | "partner";

export { getAdminEmails, isAdmin } from "./is-admin";

function escapeFormulaValue(value: string) {
  return value.replace(/'/g, "''");
}

type AirtableModule = typeof import("./airtable");

let airtableModulePromise: Promise<AirtableModule> | null = null;

async function getAirtableModule(): Promise<AirtableModule> {
  if (!airtableModulePromise) {
    airtableModulePromise = import("./airtable");
  }
  return airtableModulePromise;
}

export async function isEmailInAirtableContacts(email: string): Promise<boolean> {
  const normalized = email.trim().toLowerCase();
  if (!normalized) {
    return false;
  }

  const filterByFormula = `LOWER({Email})='${escapeFormulaValue(normalized)}'`;

  try {
    const { airtableLimiter, base, CONTACTS_TABLE } = await getAirtableModule();
    const records = await airtableLimiter.schedule(() =>
      base(CONTACTS_TABLE)
        .select({ filterByFormula, maxRecords: 1 })
        .all()
    );
    return records.length > 0;
  } catch (error) {
    console.error("[auth] Failed to validate email against Airtable Contacts", error);
    return false;
  }
}
