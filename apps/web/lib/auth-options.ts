import Airtable from "airtable";
import sgMail, { type MailDataRequired } from "@sendgrid/mail";
import { PrismaAdapter } from "@next-auth/prisma-adapter";
import type { NextAuthOptions } from "next-auth";
import EmailProvider from "next-auth/providers/email";

import { env } from "@/env";
import { isAdmin } from "./auth-helpers";
import prisma from "./prisma";

const CONTACTS_TABLE = env.AIRTABLE_CONTACTS_TABLE;
const EMAIL_FIELD = env.AIRTABLE_EMAIL_FIELD;

const airtableBase = new Airtable({ apiKey: env.AIRTABLE_PAT }).base(env.AIRTABLE_BASE_ID);

sgMail.setApiKey(env.SENDGRID_API_KEY);

const normalizeEmail = (value: string) => value.trim().toLowerCase();

const escapeFormulaValue = (value: string) => value.replace(/'/g, "''");

async function emailExists(rawEmail: string): Promise<boolean> {
  const email = normalizeEmail(rawEmail);
  if (!email) return false;

  const filterByFormula = `LOWER({${EMAIL_FIELD}}) = '${escapeFormulaValue(email)}'`;

  try {
    const records = await airtableBase(CONTACTS_TABLE)
      .select({ filterByFormula, maxRecords: 1 })
      .all();
    return records.length > 0;
  } catch (error) {
    console.error("[auth][allowlist] Failed to query Airtable", error);
    return false;
  }
}

const maskEmail = (value?: string | null) => {
  if (!value) return "unknown";
  const normalized = normalizeEmail(value);
  const [local, domain] = normalized.split("@");
  if (!local || !domain) return normalized;
  if (local.length <= 2) {
    return `${local[0] ?? "*"}***@${domain}`;
  }
  return `${local[0]}***${local[local.length - 1]}@${domain}`;
};

const buildEmailHtml = (url: string) => `<!doctype html><html><head><meta name="viewport" content="width=device-width, initial-scale=1.0"/><meta charset="UTF-8"/><style>
  body{background:#f6f9fc;font-family:-apple-system,BlinkMacSystemFont,Segoe UI,Roboto,Helvetica,Arial,sans-serif;margin:0;padding:0}
  .c{max-width:520px;margin:24px auto;background:#fff;border-radius:16px;padding:24px;border:1px solid #eaecef}
  .b{text-align:right}.b img{height:24px;opacity:.9}
  h1{font-size:20px;margin:8px 0 16px;color:#0f172a}
  p{font-size:14px;color:#334155;line-height:1.6}
  .btn{display:inline-block;padding:12px 18px;border-radius:10px;text-decoration:none;background:#111827;color:#fff;font-weight:600}
  .m{color:#64748b;font-size:12px;margin-top:16px}
  .link{word-break:break-all;font-size:12px}
</style></head><body><div class="c"><div class="b"><img src="${env.LOGO_URL}" alt="JBV"/></div>
<h1>Sign in to JBV LP Portal</h1><p>Click the button below to sign in. This link expires in 10 minutes and can be used only once.</p>
<p><a class="btn" href="${url}">Sign in</a></p><p class="m">If the button doesn’t work, copy and paste this URL into your browser:</p>
<p class="link">${url}</p><p class="m">If you didn’t request this, you can safely ignore this email.</p></div></body></html>`;

const buildEmailText = (url: string) =>
  `Sign in to JBV LP Portal\n\nUse the secure link below to finish signing in. This link expires in 10 minutes and can be used only once.\n\n${url}\n\nIf you didn’t request this, you can safely ignore this email.`;

export const authOptions: NextAuthOptions = {
  adapter: PrismaAdapter(prisma),
  pages: {
    signIn: "/auth/signin",
  },
  session: {
    strategy: "jwt",
    maxAge: 60 * 60 * 12,
  },
  secret: env.NEXTAUTH_SECRET,
  providers: [
    EmailProvider({
      from: env.EMAIL_FROM,
      maxAge: 10 * 60,
      normalizeIdentifier(identifier) {
        return normalizeEmail(identifier);
      },
      async sendVerificationRequest({ identifier, url, provider, token }) {
        const normalizedIdentifier = normalizeEmail(identifier);

        const allowed = await emailExists(normalizedIdentifier);
        if (!allowed) {
          console.info("[auth][magic-link] Allowlist miss", {
            email: maskEmail(normalizedIdentifier),
          });
          await prisma.verificationToken.deleteMany({
            where: { identifier: normalizedIdentifier, token },
          });
          return;
        }

        const message: MailDataRequired = {
          to: normalizedIdentifier,
          from: provider.from ?? env.EMAIL_FROM,
          subject: "Your JBV LP Portal sign-in link",
          html: buildEmailHtml(url),
          text: buildEmailText(url),
          trackingSettings: {
            clickTracking: { enable: false, enableText: false },
            openTracking: { enable: false },
          },
        };

        try {
          await sgMail.send(message);
          console.info("[auth][magic-link] Link sent", {
            email: maskEmail(normalizedIdentifier),
          });
        } catch (error) {
          console.error("[auth][magic-link] Failed to send", {
            email: maskEmail(normalizedIdentifier),
            message: error instanceof Error ? error.message : "Unknown error",
          });
          await prisma.verificationToken.deleteMany({
            where: { identifier: normalizedIdentifier, token },
          });
          throw new Error("Unable to send verification email");
        }
      },
    }),
  ],
  callbacks: {
    async jwt({ token, user }) {
      if (user?.email) {
        token.email = normalizeEmail(user.email);
      }

      if (typeof token.email === "string") {
        token.role = isAdmin(token.email) ? "admin" : "lp";
      }

      return token;
    },
    async session({ session, token }) {
      if (session.user) {
        const email = session.user.email ? normalizeEmail(session.user.email) : undefined;
        const roleFromToken = typeof token.role === "string" ? (token.role as string) : undefined;
        session.user.role =
          (roleFromToken as "admin" | "lp" | undefined) ?? (email && isAdmin(email) ? "admin" : "lp");
      }
      return session;
    },
  },
  events: {
    async createVerificationToken(message) {
      console.info("[auth][magic-link] Token created", {
        email: maskEmail(message.identifier),
        expires: message.expires?.toISOString?.() ?? null,
      });
    },
    async useVerificationToken(message) {
      console.info("[auth][magic-link] Token consumed", {
        email: maskEmail(message.identifier),
      });
    },
    async signIn(message) {
      console.info("[auth][magic-link] Sign-in success", {
        email: maskEmail(message.user?.email ?? null),
        isNewUser: message.isNewUser,
      });
    },
    async error(error) {
      console.error("[auth][magic-link] Error", {
        name: error.name,
        message: error.message,
      });
    },
  },
};

export default authOptions;
