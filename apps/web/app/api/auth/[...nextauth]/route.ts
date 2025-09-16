import NextAuth, { type NextAuthOptions } from "next-auth";
import EmailProvider from "next-auth/providers/email";
import GoogleProvider from "next-auth/providers/google";
import { isAdmin } from "@/lib/auth-helpers";

function buildProviders() {
  const providers = [] as NextAuthOptions["providers"];

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
    throw new Error("No authentication providers configured.");
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

const handler = NextAuth(authOptions);

export { handler as GET, handler as POST };
