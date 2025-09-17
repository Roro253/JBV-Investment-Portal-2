import { type NextAuthOptions } from "next-auth";
import CredentialsProvider from "next-auth/providers/credentials";
import EmailProvider, { type EmailConfig } from "next-auth/providers/email";
import GoogleProvider from "next-auth/providers/google";

import { getAdminEmails, isAdmin } from "./auth-helpers";

function resolveEmailServer(): EmailConfig["server"] | null {
  const directServer = process.env.EMAIL_SERVER?.trim();
  if (directServer) {
    return directServer;
  }

  const host = process.env.EMAIL_SERVER_HOST?.trim();
  const portValue = process.env.EMAIL_SERVER_PORT?.trim();
  const user = process.env.EMAIL_SERVER_USER?.trim();
  const password = process.env.EMAIL_SERVER_PASSWORD?.trim();
  const secureValue = process.env.EMAIL_SERVER_SECURE?.trim();

  const hasPartialConfig = Boolean(host || portValue || user || password || secureValue);
  if (!hasPartialConfig) {
    return null;
  }

  if (!host || !portValue) {
    console.warn(
      "[auth] EMAIL_SERVER_HOST and EMAIL_SERVER_PORT must be configured when EMAIL_SERVER is not provided."
    );
    return null;
  }

  const port = Number.parseInt(portValue, 10);
  if (Number.isNaN(port)) {
    console.warn(`[auth] EMAIL_SERVER_PORT must be a valid number. Received: ${portValue}`);
    return null;
  }

  const secure = secureValue
    ? secureValue.toLowerCase() === "true"
    : port === 465;

  const server: {
    host: string;
    port: number;
    secure: boolean;
    auth?: {
      user: string;
      pass: string;
    };
  } = {
    host,
    port,
    secure,
  };

  if (user && password) {
    server.auth = { user, pass: password };
  } else if (user || password) {
    console.warn(
      "[auth] Both EMAIL_SERVER_USER and EMAIL_SERVER_PASSWORD must be provided to configure SMTP authentication."
    );
  }

  return server;
}

function buildProviders(): NextAuthOptions["providers"] {
  const providers: NextAuthOptions["providers"] = [];

  const emailServer = resolveEmailServer();
  if (emailServer && process.env.EMAIL_FROM) {
    providers.push(
      EmailProvider({
        server: emailServer,
        from: process.env.EMAIL_FROM,
      })
    );
  } else if (emailServer && !process.env.EMAIL_FROM) {
    console.warn("[auth] EMAIL_FROM must be configured to send magic link emails.");
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
