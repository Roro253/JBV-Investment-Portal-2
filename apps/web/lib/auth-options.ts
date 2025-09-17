import { type NextAuthOptions } from "next-auth";
import CredentialsProvider from "next-auth/providers/credentials";
import EmailProvider from "next-auth/providers/email";
import GoogleProvider from "next-auth/providers/google";

import { buildAllowListFromEnv, getAdminEmails, isAdmin } from "./auth-helpers";

function buildProviders(): NextAuthOptions["providers"] {
  const providers: NextAuthOptions["providers"] = [];

  const hasEmailProvider = Boolean(process.env.EMAIL_SERVER && process.env.EMAIL_FROM);

  if (hasEmailProvider) {
    providers.push(
      EmailProvider({
        server: process.env.EMAIL_SERVER,
        from: process.env.EMAIL_FROM,
      })
    );
  }

  if (process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET) {
    providers.push(
      GoogleProvider({
        clientId: process.env.GOOGLE_CLIENT_ID,
        clientSecret: process.env.GOOGLE_CLIENT_SECRET,
      })
    );
  }

  if (providers.length === 0) {
    const allowList = new Set<string>();
    const fallbackSources = [
      process.env.FALLBACK_SIGNIN_EMAILS,
      process.env.AUTH_EMAIL_ALLOWLIST,
      process.env.NEXT_PUBLIC_FALLBACK_SIGNIN_EMAILS,
    ];

    for (const source of fallbackSources) {
      for (const email of buildAllowListFromEnv(source)) {
        allowList.add(email);
      }
    }

    if (allowList.size === 0) {
      for (const email of getAdminEmails()) {
        allowList.add(email);
      }
    }

    if (allowList.size === 0) {
      console.warn(
        "[auth] No authentication providers configured and no fallback allow list found. All email addresses will be allowed for fallback sign-in."
      );
    } else {
      console.warn(
        `[auth] No authentication providers configured. Enabling fallback email sign-in for: ${Array.from(allowList).join(", ")}`
      );
    }

    providers.push(
      CredentialsProvider({
        id: "email",
        name: "Email",
        credentials: {
          email: { label: "Email", type: "email" },
        },
        async authorize(credentials) {
          const input = credentials?.email;
          const email = typeof input === "string" ? input.trim().toLowerCase() : "";

          if (!email) {
            console.warn("[auth] Sign-in attempt rejected because the email address was missing.");
            throw new Error("Email address is required.");
          }

          if (allowList.size > 0 && !allowList.has(email)) {
            console.warn(`[auth] Sign-in attempt rejected for ${email}: not included in fallback allow list.`);
            throw new Error("That email is not authorized to access this site.");
          }

          return { id: email, email };
        },
      })
    );
  }

  return providers;
}

export const authOptions: NextAuthOptions = {
  providers: buildProviders(),
  secret: process.env.NEXTAUTH_SECRET,
  pages: {
    signIn: "/auth/signin",
  },
  callbacks: {
    async jwt({ token, user }) {
      if (user?.email) {
        token.email = user.email;
      }
      token.role = isAdmin(token.email) ? "admin" : "lp";
      return token;
    },
    async session({ session, token }) {
      if (session.user) {
        session.user.role = token.role ?? (isAdmin(session.user.email) ? "admin" : "lp");
      }
      return session;
    },
  },
};

export default authOptions;
