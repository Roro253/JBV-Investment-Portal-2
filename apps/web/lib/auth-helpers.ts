export type Role = "admin" | "lp" | "partner";

const DEFAULT_ADMIN_EMAILS = ["jb@jbv.com"];

function parseEmailList(value?: string | null) {
  return (value || "")
    .split(",")
    .map((entry) => entry.trim().toLowerCase())
    .filter(Boolean);
}

export function getAdminEmails(): string[] {
  const envAdmins = parseEmailList(process.env.ADMIN_EMAILS);
  const combined = new Set<string>([...envAdmins, ...DEFAULT_ADMIN_EMAILS.map((email) => email.toLowerCase())]);
  return Array.from(combined);
}

export function isAdmin(email?: string | null): boolean {
  if (!email) return false;
  const normalized = email.trim().toLowerCase();
  if (!normalized) return false;
  return getAdminEmails().includes(normalized);
}

export function buildAllowListFromEnv(value?: string | null): Set<string> {
  return new Set(parseEmailList(value));
}
