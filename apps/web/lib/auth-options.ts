import { type NextAuthOptions } from "next-auth";
import CredentialsProvider from "next-auth/providers/credentials";

import { isAdmin, isEmailInAirtableContacts } from "./auth-helpers";

function ensureSecret() {
  if (process.env.NEXTAUTH_SECRET && process.env.NEXTAUTH_SECRET.trim()) {
    return process.env.NEXTAUTH_SECRET;
  }
  if (process.env.NODE_ENV !== "production") {
    return "development-secret";
  }
  throw new Error("NEXTAUTH_SECRET must be configured for production deployments.");
}

export const authOptions: NextAuthOptions = {
  providers: [
    CredentialsProvider({
      name: "Email", 
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

        const exists = await isEmailInAirtableContacts(normalizedEmail);
        if (!exists) {
          return null;
        }

        return { id: normalizedEmail, email: normalizedEmail };
      },
    }),
  ],
  session: {
    strategy: "jwt",
  },
  pages: {
    signIn: "/auth/signin",
  },
  callbacks: {
    async jwt({ token }) {
      if (token.email) {
        token.role = isAdmin(token.email) ? "admin" : "lp";
      }
      return token;
    },
    async session({ session, token }) {
      if (session.user) {
        const email = session.user.email?.toLowerCase();
        if (email) {
          session.user.email = email;
        }
        session.user.role = token.role ?? (email ? (isAdmin(email) ? "admin" : "lp") : "lp");
      }
      return session;
    },
  },
  secret: ensureSecret(),
};

export default authOptions;
