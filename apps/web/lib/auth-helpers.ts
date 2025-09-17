import Bottleneck from "bottleneck";

import { base } from "./airtable";

export type Role = "admin" | "lp" | "partner";

const DEFAULT_ADMIN_EMAILS = ["jb@jbv.com"];
const CONTACTS_TABLE = "Contacts";
const MAX_CONTACT_LOOKUP_ATTEMPTS = 3;

const contactsLimiter = new Bottleneck({ minTime: 120 });

function normalizeEmails(value: string | undefined | null) {
  return (value || "")
    .split(",")
    .map((entry) => entry.trim().toLowerCase())
    .filter(Boolean);
}

function escapeFormulaValue(value: string) {
  return value.replace(/'/g, "\\'");
}

function delay(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function shouldRetryAirtable(error: any) {
  const status = error?.statusCode ?? error?.status ?? error?.code;
  if (typeof status === "number") {
    return status === 429 || status === 503;
  }
  const message = typeof error?.message === "string" ? error.message : "";
  return /too many requests/i.test(message);
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
  if (!normalized) return false;

  const filterByFormula = `LOWER({Email})='${escapeFormulaValue(normalized)}'`;

  for (let attempt = 0; attempt < MAX_CONTACT_LOOKUP_ATTEMPTS; attempt += 1) {
    try {
      const records = await contactsLimiter.schedule(() =>
        base(CONTACTS_TABLE)
          .select({ filterByFormula, maxRecords: 1 })
          .all()
      );

      return records.length > 0;
    } catch (error) {
      if (attempt < MAX_CONTACT_LOOKUP_ATTEMPTS - 1 && shouldRetryAirtable(error)) {
        await delay(200 * (attempt + 1));
        continue;
      }
      throw error;
    }
  }

  return false;
}
