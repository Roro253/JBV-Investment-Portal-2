import { PrismaAdapter } from "@next-auth/prisma-adapter";
import sgMail, { type MailDataRequired } from "@sendgrid/mail";
import Airtable from "airtable";
import type { NextAuthOptions } from "next-auth";
import EmailProvider from "next-auth/providers/email";

import { env } from "./env";
import { isAdmin } from "./auth-helpers";
import prisma from "./prisma";

const airtableBase = new Airtable({ apiKey: env.AIRTABLE_TOKEN }).base(env.AIRTABLE_BASE_ID);

sgMail.setApiKey(env.SENDGRID_API_KEY);

const normalizeEmail = (value: string) => value.trim().toLowerCase();

const escapeFormulaValue = (value: string) => value.replace(/'/g, "''");

async function isAllowListed(email: string): Promise<boolean> {
  const normalized = normalizeEmail(email);
  const formula = `LOWER({${env.AIRTABLE_EMAIL_FIELD}}) = '${escapeFormulaValue(normalized)}'`;
  try {
    const records = await airtableBase(env.AIRTABLE_CONTACTS_TABLE)
      .select({ filterByFormula: formula, maxRecords: 1 })
      .all();
    return records.length > 0;
  } catch (error) {
    console.error("[auth][email] Failed to query Airtable allowlist", error);
    return false;
  }
}

function buildEmailHtml(url: string) {
  return `<!doctype html><html><head><meta name="viewport" content="width=device-width, initial-scale=1.0"/><meta charset="UTF-8"/><style>
  body{background:#f6f9fc;font-family:-apple-system,BlinkMacSystemFont,Segoe UI,Roboto,Helvetica,Arial,sans-serif;margin:0;padding:0}
  .wrapper{max-width:520px;margin:24px auto;background:#fff;border-radius:16px;padding:24px;border:1px solid #e2e8f0}
  .logo{text-align:right}.logo img{height:24px;opacity:.9}
  h1{font-size:20px;margin:12px 0 16px;color:#0f172a}
  p{font-size:14px;color:#334155;line-height:1.6;margin:0 0 12px}
  .button{display:inline-block;padding:12px 18px;border-radius:10px;text-decoration:none;background:#111827;color:#fff;font-weight:600}
  .meta{color:#64748b;font-size:12px;margin-top:16px}
  .link{word-break:break-all;font-size:12px;color:#1f2937}
</style></head><body><div class="wrapper"><div class="logo"><img src="${env.LOGO_URL}" alt="JBV" /></div>
<h1>Sign in to JBV LP Portal</h1><p>Click the button below to sign in. This link expires in 10 minutes and can be used only once.</p>
<p><a class="button" href="${url}">Sign in</a></p><p class="meta">If the button doesn’t work, copy and paste this URL into your browser:</p>
<p class="link">${url}</p><p class="meta">If you didn’t request this email, you can safely ignore it.</p></div></body></html>`;
}

async function sendMagicLinkEmail(identifier: string, url: string) {
  const message: MailDataRequired = {
    to: identifier,
    from: env.EMAIL_FROM,
    subject: "Your JBV LP Portal sign-in link",
    html: buildEmailHtml(url),
    text: `Sign in to the JBV LP Portal by visiting this link: ${url}\nThis link expires in 10 minutes and can only be used once.`,
    trackingSettings: {
      clickTracking: { enable: false, enableText: false },
      openTracking: { enable: false },
    },
  };

  await sgMail.send(message);
}

export const authOptions: NextAuthOptions = {
  adapter: PrismaAdapter(prisma),
  session: {
    strategy: "jwt",
    maxAge: 60 * 60 * 12,
  },
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
      async sendVerificationRequest({ identifier, url }) {
        console.info("[auth][email] Magic link requested", { identifier: normalizeEmail(identifier) });
        const allowed = await isAllowListed(identifier);
        if (!allowed) {
          console.info("[auth][email] Identifier not found in allowlist", { identifier: normalizeEmail(identifier) });
          return;
        }

        try {
          await sendMagicLinkEmail(identifier, url);
          console.info("[auth][email] Magic link sent", { identifier: normalizeEmail(identifier) });
        } catch (error) {
          console.error("[auth][email] Failed to send magic link", { identifier: normalizeEmail(identifier), error });
          throw error;
        }
      },
    }),
  ],
  callbacks: {
    async jwt({ token, user }) {
      if (user?.email) {
        token.email = user.email;
      }
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
  events: {
    async signIn({ user }) {
      if (user?.email) {
        console.info("[auth][email] Magic link verified", { identifier: normalizeEmail(user.email) });
      }
    },
  },
};

export default authOptions;
