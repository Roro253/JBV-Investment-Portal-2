export type Role = "admin" | "lp" | "partner";

export function isAdmin(email?: string | null): boolean {
  const list = (process.env.ADMIN_EMAILS || "")
    .split(",")
    .map((entry) => entry.trim().toLowerCase())
    .filter(Boolean);
  if (!email) return false;
  return list.includes(email.toLowerCase());
}
