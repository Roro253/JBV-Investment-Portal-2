import type { NextAuthOptions } from "next-auth";
import CredentialsProvider from "next-auth/providers/credentials";

import { isAdmin, isEmailInAirtableContacts } from "./auth-helpers";

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

        return {
          id: normalizedEmail,
          email: normalizedEmail,
        };
      },
    }),
  ],
  pages: {
    signIn: "/auth/signin",
  },
  secret: process.env.NEXTAUTH_SECRET || "development-secret",
  callbacks: {
    async jwt({ token }) {
      if (typeof token.email === "string") {
        token.role = isAdmin(token.email) ? "admin" : "lp";
      }
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
