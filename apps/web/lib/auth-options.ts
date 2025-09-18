import Airtable from "airtable";
import sgMail, { type MailDataRequired } from "@sendgrid/mail";
import EmailProvider from "next-auth/providers/email";
import { PrismaAdapter } from "@next-auth/prisma-adapter";
import type { NextAuthOptions } from "next-auth";

import { env } from "@/lib/env";
import { prisma } from "@/lib/prisma";
import { isAdmin } from "./is-admin";

const airtableBase = new Airtable({ apiKey: env.AIRTABLE_TOKEN }).base(env.AIRTABLE_BASE_ID);
const CONTACTS_TABLE = env.AIRTABLE_CONTACTS_TABLE;
const EMAIL_FIELD = env.AIRTABLE_EMAIL_FIELD;

sgMail.setApiKey(env.SENDGRID_API_KEY);

const normalizeEmail = (value: string) => value.trim().toLowerCase();

function escapeFormulaValue(value: string) {
  return value.replace(/'/g, "''");
}

async function emailExists(rawEmail: string): Promise<boolean> {
  const email = normalizeEmail(rawEmail);
  if (!email) return false;

  const formula = `LOWER({${EMAIL_FIELD}}) = '${escapeFormulaValue(email)}'`;

  try {
    const records = await airtableBase(CONTACTS_TABLE)
      .select({ filterByFormula: formula, maxRecords: 1 })
      .all();
    return records.length > 0;
  } catch (error) {
    console.error("[auth] Airtable allowlist lookup failed", error);
    return false;
  }
}

function renderEmailHtml(url: string) {
  return `<!doctype html><html><head><meta name="viewport" content="width=device-width, initial-scale=1.0"/><meta charset="UTF-8"/><style>
  body{background:#f6f9fc;font-family:-apple-system,BlinkMacSystemFont,Segoe UI,Roboto,Helvetica,Arial,sans-serif;margin:0;padding:0}
  .container{max-width:520px;margin:24px auto;background:#fff;border-radius:16px;padding:24px;border:1px solid #e2e8f0}
  .logo{display:flex;justify-content:flex-end}
  .logo img{height:24px;opacity:.9}
  h1{font-size:20px;margin:8px 0 16px;color:#0f172a;font-weight:600}
  p{font-size:14px;color:#334155;line-height:1.6;margin:12px 0}
  .btn{display:inline-block;padding:12px 18px;border-radius:10px;text-decoration:none;background:#111827;color:#fff;font-weight:600}
  .muted{color:#64748b;font-size:12px;margin-top:16px}
  .link{word-break:break-all;font-size:12px;color:#1e293b}
  </style></head><body><div class="container"><div class="logo"><img src="${env.LOGO_URL}" alt="JBV" /></div>
  <h1>Sign in to JBV LP Portal</h1><p>Click the button below to sign in. This link expires in 10 minutes and can be used only once.</p>
  <p><a class="btn" href="${url}">Sign in</a></p><p class="muted">If the button doesn’t work, copy and paste this URL into your browser:</p>
  <p class="link">${url}</p><p class="muted">If you didn’t request this, you can safely ignore this email.</p></div></body></html>`;
}

function logAuthEvent(event: string, email?: string | null, metadata?: Record<string, unknown>) {
  const payload = {
    event,
    ...(email ? { email: normalizeEmail(email) } : {}),
    ...metadata,
  };
  console.log("[auth]", payload);
}

export const authOptions: NextAuthOptions = {
  adapter: PrismaAdapter(prisma),
  session: { strategy: "jwt", maxAge: 60 * 60 * 12 },
  secret: env.NEXTAUTH_SECRET,
  pages: {
    signIn: "/auth/signin",
  },
  providers: [
    EmailProvider({
      from: env.EMAIL_FROM,
      maxAge: 10 * 60,
      normalizeIdentifier(identifier) {
        return normalizeEmail(identifier);
      },
      async sendVerificationRequest({ identifier, url, provider }) {
        const recipient = normalizeEmail(identifier);
        logAuthEvent("magic_link.requested", recipient);

        const allowed = await emailExists(recipient);
        if (!allowed) {
          logAuthEvent("magic_link.skipped", recipient, { reason: "not_allowlisted" });
          return;
        }

        const html = renderEmailHtml(url);
        const text = `Sign in to JBV LP Portal\n\nUse the link below to sign in. This link expires in 10 minutes and can only be used once.\n\n${url}\n\nIf you didn’t request this, you can safely ignore this email.`;

        const message: MailDataRequired = {
          to: recipient,
          from: provider.from ?? env.EMAIL_FROM,
          subject: "Your JBV LP Portal sign-in link",
          html,
          text,
          trackingSettings: {
            clickTracking: { enable: false, enableText: false },
            openTracking: { enable: false },
          },
        };

        try {
          await sgMail.send(message);
          logAuthEvent("magic_link.sent", recipient);
        } catch (error) {
          const message = error instanceof Error ? error.message : "Unknown error";
          logAuthEvent("magic_link.error", recipient, { message });
          throw new Error("Failed to send verification email");
        }
      },
    }),
  ],
  callbacks: {
    async jwt({ token, user }) {
      const email = (user?.email ?? token.email) as string | undefined;
      if (email) {
        const normalized = normalizeEmail(email);
        token.email = normalized;
        token.role = isAdmin(normalized) ? "admin" : "lp";
      }
      return token;
    },
    async session({ session, token }) {
      if (session.user) {
        if (typeof token.email === "string") {
          session.user.email = token.email;
        }
        if (token.role) {
          session.user.role = token.role as typeof session.user.role;
        } else if (session.user.email) {
          session.user.role = isAdmin(session.user.email) ? "admin" : "lp";
        }
      }
      return session;
    },
  },
  events: {
    async signIn({ user }) {
      logAuthEvent("magic_link.verified", user.email);
    },
    async error(message) {
      logAuthEvent("magic_link.failure", undefined, {
        error: message?.name ?? "Unknown",
        description: message?.message,
      });
    },
  },
};

export default authOptions;
