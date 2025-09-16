import { getServerSession } from "next-auth";
import type { Session } from "next-auth";
import { authOptions } from "./auth-options";
export { isAdmin } from "./auth-helpers";

export async function getSession(): Promise<Session | null> {
  return getServerSession(authOptions);
}

export async function requireSession(options?: { redirectTo?: string | null }): Promise<Session> {
  const session = await getSession();
  if (session) {
    return session;
  }

  if (options?.redirectTo === null) {
    throw new Error("Unauthorized");
  }

  const destination = options?.redirectTo ?? "/auth/signin";
  const { redirect } = await import("next/navigation");
  redirect(destination);
  throw new Error("Redirected");
}
