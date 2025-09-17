import { type NextAuthOptions } from "next-auth";
import CredentialsProvider from "next-auth/providers/credentials";
import EmailProvider from "next-auth/providers/email";
import GoogleProvider from "next-auth/providers/google";

import { getAdminEmails, isAdmin } from "./auth-helpers";

const RESEND_API_URL = "https://api.resend.com/emails";

type EmailTheme = {
  brandColor?: string | null;
  buttonText?: string | null;
};

function escapeHtml(value: string) {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

function buildSignInEmail(url: string, host: string, theme?: EmailTheme) {
  const escapedHost = host.replace(/\./g, "&#8203;.");
  const brandColor = theme?.brandColor || "#2563eb";
  const buttonText = theme?.buttonText || "#ffffff";

  return {
    subject: `Sign in to ${host}`,
    text: `Sign in to ${host}\n${url}\n\nIf you did not request this email, you can safely ignore it.`,
    html: `<!DOCTYPE html>
<html>
  <head>
    <meta http-equiv="Content-Type" content="text/html; charset=UTF-8" />
  </head>
  <body style="background-color:#f8fafc; margin:0; padding:24px; font-family:Helvetica,Arial,sans-serif; color:#0f172a;">
    <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="max-width:560px; margin:0 auto; background-color:#ffffff; border-radius:16px; padding:32px 32px 40px; box-shadow:0 8px 24px rgba(15, 23, 42, 0.08);">
      <tr>
        <td style="text-align:center;">
          <h1 style="margin:0 0 16px; font-size:20px; font-weight:600;">Sign in to ${escapedHost}</h1>
          <p style="margin:0 0 24px; font-size:14px; line-height:1.6; color:#475569;">Use the secure link below to access your JBV Investment Portal dashboard.</p>
          <a href="${url}" style="display:inline-block; padding:12px 24px; background-color:${brandColor}; color:${buttonText}; border-radius:8px; text-decoration:none; font-weight:600;">Sign in</a>
          <p style="margin:24px 0 8px; font-size:12px; color:#64748b;">If the button doesn’t work, copy and paste this link into your browser:</p>
          <p style="margin:0; font-size:12px; line-height:1.6; color:#1e293b; word-break:break-all;">${escapeHtml(url)}</p>
          <p style="margin:24px 0 0; font-size:12px; color:#94a3b8;">If you didn’t request this email, you can safely ignore it.</p>
        </td>
      </tr>
    </table>
  </body>
</html>`,
  };
}

function buildEmailProvider() {
  const emailServer = process.env.EMAIL_SERVER;
  const emailFrom = process.env.EMAIL_FROM;
  const resendApiKey = process.env.RESEND_API_KEY;

  if (emailServer && emailFrom) {
    return EmailProvider({
      server: emailServer,
      from: emailFrom,
    });
  }

  if (resendApiKey) {
    if (!emailFrom) {
      console.error("[auth] RESEND_API_KEY is set but EMAIL_FROM is missing. Email sign-in is disabled.");
      return null;
    }

    return EmailProvider({
      from: emailFrom,
      async sendVerificationRequest({ identifier, url, provider, theme }) {
        const { host } = new URL(url);
        const { subject, text, html } = buildSignInEmail(url, host, theme as EmailTheme | undefined);

        try {
          const response = await fetch(RESEND_API_URL, {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              Authorization: `Bearer ${resendApiKey}`,
            },
            body: JSON.stringify({
              from: provider.from,
              to: identifier,
              subject,
              text,
              html,
            }),
          });

          const responseText = await response.text();
          let parsed: any = null;
          if (responseText) {
            try {
              parsed = JSON.parse(responseText);
            } catch {
              parsed = responseText;
            }
          }

          if (!response.ok || (parsed && typeof parsed === "object" && "error" in parsed && parsed.error)) {
            const errorMessage =
              typeof parsed === "string"
                ? parsed
                : parsed?.error?.message || parsed?.message || `${response.status} ${response.statusText}`;
            console.error(`[auth] Failed to send sign-in email to ${identifier}: ${errorMessage}`);
            throw new Error("Failed to send sign-in email. Please try again later.");
          }

          if (process.env.NODE_ENV !== "production") {
            console.log(`[auth] Sent sign-in email via Resend to ${identifier}.`);
          }
        } catch (error) {
          console.error("[auth] Error sending sign-in email via Resend:", error);
          throw new Error("Failed to send sign-in email. Please try again later.");
        }
      },
    });
  }

  if (process.env.NODE_ENV !== "production") {
    console.warn(
      "[auth] Email sign-in is not configured. Set EMAIL_SERVER/EMAIL_FROM or RESEND_API_KEY/EMAIL_FROM to enable magic links."
    );
  }

  return null;
}

function buildProviders(): NextAuthOptions["providers"] {
  const providers: NextAuthOptions["providers"] = [];

  const emailProvider = buildEmailProvider();
  if (emailProvider) {
    providers.push(emailProvider);
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
