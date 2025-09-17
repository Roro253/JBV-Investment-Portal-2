import { airtableLimiter, base, CONTACTS_TABLE } from "./airtable";

export type Role = "admin" | "lp" | "partner";

const DEFAULT_ADMIN_EMAILS = ["jb@jbv.com"];

function normalizeEmails(value: string | undefined | null) {
  return (value || "")
    .split(",")
    .map((entry) => entry.trim().toLowerCase())
    .filter(Boolean);
}

function escapeFormulaValue(value: string) {
  return value.replace(/'/g, "''");
}

export function getAdminEmails(): string[] {
  const configured = normalizeEmails(process.env.ADMIN_EMAILS);
  if (configured.length > 0) {
    return configured;
  }
  return DEFAULT_ADMIN_EMAILS.slice();
}

export function isAdmin(email?: string | null): boolean {
  if (!email) return false;
  const normalizedEmail = email.toLowerCase();
  return getAdminEmails().includes(normalizedEmail);
}

export async function isEmailInAirtableContacts(email: string): Promise<boolean> {
  const normalized = email.trim().toLowerCase();
  if (!normalized) {
    return false;
  }

  const filterByFormula = `LOWER({Email})='${escapeFormulaValue(normalized)}'`;

  try {
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
