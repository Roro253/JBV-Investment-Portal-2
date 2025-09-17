import { type NextAuthOptions } from "next-auth";
import CredentialsProvider from "next-auth/providers/credentials";
import EmailProvider, { type EmailConfig } from "next-auth/providers/email";
import GoogleProvider from "next-auth/providers/google";

import { getAdminEmails, isAdmin } from "./auth-helpers";
import createInMemoryAuthAdapter from "./in-memory-auth-adapter";

const MAGIC_LINK_MAX_AGE_SECONDS = 15 * 60; // 15 minutes

const DEFAULT_ADMIN_CREDENTIAL_EMAIL = "jb@jbv.com";
const DEFAULT_ADMIN_CREDENTIAL_PASSWORD = "admin123";

function normalizeEmail(value: string | null | undefined): string | null {
  if (typeof value !== "string") {
    return null;
  }
  const trimmed = value.trim();
  if (!trimmed) {
    return null;
  }
  return trimmed.toLowerCase();
}

function getAdminCredentialEmail(): string {
  return normalizeEmail(process.env.ADMIN_CREDENTIAL_EMAIL) ?? DEFAULT_ADMIN_CREDENTIAL_EMAIL;
}

function getAdminCredentialPassword(): string {
  const raw = process.env.ADMIN_CREDENTIAL_PASSWORD;
  if (typeof raw === "string") {
    const trimmed = raw.trim();
    if (trimmed) {
      return trimmed;
    }
  }
  return DEFAULT_ADMIN_CREDENTIAL_PASSWORD;
}

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
  const adminCredentialEmail = getAdminCredentialEmail();
  const adminCredentialPassword = getAdminCredentialPassword();

  const providers: NextAuthOptions["providers"] = [
    CredentialsProvider({
      id: "admin-credentials",
      name: "Admin Credentials",
      credentials: {
        email: {
          label: "Email",
          type: "email",
          placeholder: adminCredentialEmail,
        },
        password: {
          label: "Password",
          type: "password",
        },
      },
      async authorize(credentials) {
        const providedEmail = normalizeEmail(credentials?.email);
        const providedPassword =
          typeof credentials?.password === "string" ? credentials.password : null;

        if (!providedEmail || !providedPassword) {
          return null;
        }

        if (providedEmail !== adminCredentialEmail) {
          console.warn(`[auth] Admin credential sign-in rejected for unauthorized email: ${providedEmail}`);
          return null;
        }

        if (providedPassword !== adminCredentialPassword) {
          console.warn(`[auth] Admin credential sign-in rejected due to invalid password for: ${providedEmail}`);
          return null;
        }

        return {
          id: providedEmail,
          email: providedEmail,
          name: "Admin",
        };
      },
    }),
  ];

  let hasAdditionalProviders = false;

  const emailServer = resolveEmailServer();
  const emailFrom = process.env.EMAIL_FROM?.trim();
  if (emailServer && emailFrom) {
    providers.push(
      EmailProvider({
        server: emailServer,
        from: emailFrom,
        maxAge: MAGIC_LINK_MAX_AGE_SECONDS,
        normalizeIdentifier(identifier) {
          return identifier.trim().toLowerCase();
        },
      })
    );
    hasAdditionalProviders = true;
  } else if (emailServer && !emailFrom) {
    console.warn("[auth] EMAIL_FROM must be configured to send magic link emails.");
  }

  if (process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET) {
    providers.push(
      GoogleProvider({
        clientId: process.env.GOOGLE_CLIENT_ID,
        clientSecret: process.env.GOOGLE_CLIENT_SECRET,
      })
    );
    hasAdditionalProviders = true;
  }

  if (!hasAdditionalProviders) {
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
  adapter: createInMemoryAuthAdapter(),
  providers: buildProviders(),
  session: {
    strategy: "jwt",
  },
  secret: process.env.NEXTAUTH_SECRET || "development-secret",
  pages: {
    signIn: "/auth/signin",
  },
  callbacks: {
    async signIn({ user, account }) {
      if (account?.provider === "email" || account?.provider === "admin-credentials") {
        const candidateEmail = normalizeEmail(user?.email ?? account.providerAccountId);
        if (!candidateEmail || !isAdmin(candidateEmail)) {
          const attemptedEmail = user?.email ?? account?.providerAccountId ?? "<unknown>";
          console.warn(
            `[auth] Sign-in rejected for unauthorized email: ${attemptedEmail} (provider: ${account?.provider ?? "<unknown>"})`
          );
          return false;
        }
      }
      return true;
    },
    async jwt({ token }) {
      const normalizedEmail = normalizeEmail(token.email);
      if (normalizedEmail) {
        token.email = normalizedEmail;
      }
      token.role = normalizedEmail && isAdmin(normalizedEmail) ? "admin" : "lp";
      return token;
    },
    async session({ session, token }) {
      if (session.user) {
        const normalizedEmail = normalizeEmail(session.user.email) ?? (typeof token.email === "string" ? token.email : null);
        if (normalizedEmail) {
          session.user.email = normalizedEmail;
        }
        session.user.role = (token.role as typeof session.user.role) ?? (normalizedEmail && isAdmin(normalizedEmail) ? "admin" : "lp");
      }
      return session;
    },
  },
};

export default authOptions;
