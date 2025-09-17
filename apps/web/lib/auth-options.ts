import { type NextAuthOptions } from "next-auth";
import CredentialsProvider from "next-auth/providers/credentials";
import EmailProvider from "next-auth/providers/email";
import GoogleProvider from "next-auth/providers/google";

import { getAdminEmails, isAdmin } from "./auth-helpers";

function buildProviders(): NextAuthOptions["providers"] {
  const providers: NextAuthOptions["providers"] = [];

  if (process.env.EMAIL_SERVER && process.env.EMAIL_FROM) {
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
    const allowedEmails = new Set(getAdminEmails());
    const devEmails = (process.env.DEV_LOGIN_EMAILS || "")
      .split(",")
      .map((entry) => entry.trim().toLowerCase())
      .filter(Boolean);
    for (const email of devEmails) {
      allowedEmails.add(email);
    }

    console.warn(
      "[auth] No authentication providers configured. Falling back to in-memory development login restricted to:",
      Array.from(allowedEmails)
    );

    providers.push(
      CredentialsProvider({
        id: "email",
        name: "Development Email",
        credentials: {
          email: {
            label: "Email",
            type: "email",
            placeholder: "you@example.com",
          },
        },
        async authorize(credentials) {
          const email = credentials?.email;
          if (!email || typeof email !== "string") {
            return null;
          }

          const normalizedEmail = email.trim().toLowerCase();
          if (!normalizedEmail) {
            return null;
          }

          if (allowedEmails.size > 0 && !allowedEmails.has(normalizedEmail)) {
            console.warn(`[auth] Development login rejected for unauthorized email: ${normalizedEmail}`);
            return null;
          }

          return {
            id: normalizedEmail,
            email: normalizedEmail,
            name: normalizedEmail,
          };
        },
      })
    );
  }

  return providers;
}

export const authOptions: NextAuthOptions = {
  providers: buildProviders(),
  secret: process.env.NEXTAUTH_SECRET || "development-secret",
  pages: {
    signIn: "/auth/signin",
  },
  callbacks: {
    async jwt({ token }) {
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
