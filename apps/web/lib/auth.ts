import { getServerSession } from "next-auth";
import { redirect } from "next/navigation";
import { authOptions } from "@/app/api/auth/[...nextauth]/route";
import type { Session } from "next-auth";

export async function getSession(): Promise<Session | null> {
  return getServerSession(authOptions);
}

export async function requireSession(): Promise<Session> {
  const session = await getSession();
  if (!session || !session.user?.email) {
    redirect("/auth/signin");
  }
  return session;
}

export function isAdmin(email?: string | null): boolean {
  if (!email) return false;
  const raw = process.env.ADMIN_EMAILS || "";
  const list = raw
    .split(",")
    .map((entry) => entry.trim().toLowerCase())
    .filter(Boolean);
  return list.includes(email.toLowerCase());
}
