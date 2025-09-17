const DEFAULT_ADMIN_EMAILS = ["jb@jbv.com"];

function normalizeEmails(value: string | undefined | null) {
  return (value || "")
    .split(",")
    .map((entry) => entry.trim().toLowerCase())
    .filter(Boolean);
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
