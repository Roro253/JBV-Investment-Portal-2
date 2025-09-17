"use client";

import { FormEvent, Suspense, useState } from "react";
import { signIn } from "next-auth/react";
import { useSearchParams } from "next/navigation";

export default function SignInPage() {
  return (
    <Suspense
      fallback={
        <div className="min-h-screen bg-slate-50 flex flex-col items-center justify-center px-4 py-16">
          <div className="w-full max-w-md space-y-4 text-center">
            <div className="mx-auto h-12 w-12 animate-pulse rounded-full bg-blue-100" />
            <p className="text-sm text-slate-500">Preparing secure sign-in options…</p>
          </div>
        </div>
      }
    >
      <SignInContent />
    </Suspense>
  );
}

function SignInContent() {
  const searchParams = useSearchParams();
  const [email, setEmail] = useState("");
  const [emailStatus, setEmailStatus] = useState<"idle" | "sending" | "sent" | "error">("idle");
  const [magicLinkErrorMessage, setMagicLinkErrorMessage] = useState<string | null>(null);
  const [adminEmail, setAdminEmail] = useState("jb@jbv.com");
  const [adminPassword, setAdminPassword] = useState("");
  const [adminStatus, setAdminStatus] = useState<"idle" | "signing-in">("idle");
  const [adminErrorMessage, setAdminErrorMessage] = useState<string | null>(null);

  const callbackUrl = searchParams?.get("callbackUrl") || "/lp";

  const handleEmailSignIn = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setEmailStatus("sending");
    setMagicLinkErrorMessage(null);
    try {
      const trimmedEmail = email.trim();
      if (!trimmedEmail) {
        setEmailStatus("error");
        setMagicLinkErrorMessage("Enter a valid email address to receive a sign-in link.");
        return;
      }

      const result = await signIn("email", {
        email: trimmedEmail,
        redirect: false,
        callbackUrl,
      });

      if (result?.error) {
        setEmailStatus("error");
        if (result.error === "AccessDenied" || result.error === "CredentialsSignin") {
          setMagicLinkErrorMessage("This email is not authorized to access the portal.");
        } else if (result.error === "EmailSignin") {
          setMagicLinkErrorMessage(
            "We couldn't send the sign-in link. Please try again or contact support if the issue persists."
          );
        } else {
          setMagicLinkErrorMessage(result.error);
        }
        return;
      }

      if (result?.url) {
        window.location.href = result.url;
        return;
      }

      setEmailStatus("sent");
    } catch (err: any) {
      setEmailStatus("error");
      setMagicLinkErrorMessage(err?.message || "Failed to send sign-in link.");
    }
  };

  const handleAdminPasswordSignIn = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setAdminErrorMessage(null);

    const trimmedEmail = adminEmail.trim();
    const password = adminPassword;

    if (!trimmedEmail) {
      setAdminErrorMessage("Enter the admin email address.");
      return;
    }

    if (!password) {
      setAdminErrorMessage("Enter the admin password.");
      return;
    }

    setAdminStatus("signing-in");

    try {
      const result = await signIn("admin-credentials", {
        email: trimmedEmail,
        password,
        redirect: false,
        callbackUrl,
      });

      if (result?.error) {
        setAdminErrorMessage("Invalid email or password. Please try again.");
        setAdminStatus("idle");
        return;
      }

      if (result?.ok) {
        window.location.href = callbackUrl;
        return;
      }

      setAdminErrorMessage("We couldn't complete the sign-in. Please try again.");
      setAdminStatus("idle");
    } catch (err: any) {
      setAdminErrorMessage(err?.message || "Failed to sign in with password.");
      setAdminStatus("idle");
    }
  };

  return (
    <div className="min-h-screen bg-slate-50 flex flex-col items-center justify-center px-4 py-16">
      <div className="w-full max-w-md space-y-8">
        <div className="text-center space-y-3">
          <div className="mx-auto h-12 w-12 rounded-full bg-blue-600 flex items-center justify-center text-white font-semibold">
            JBV
          </div>
          <h1 className="text-2xl font-semibold text-slate-900">JBV Investment Platform</h1>
          <p className="text-sm text-slate-600">Access your investor dashboard securely with your preferred sign-in method.</p>
        </div>

        <div className="space-y-4 rounded-2xl bg-white p-6 shadow-sm ring-1 ring-slate-200">
          <button
            type="button"
            onClick={() => signIn("google", { callbackUrl })}
            className="w-full inline-flex items-center justify-center rounded-lg border border-slate-200 bg-white px-4 py-2 text-sm font-medium text-slate-700 shadow-sm transition hover:border-blue-600 hover:text-blue-600 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-600"
          >
            Sign in with Google
          </button>

          <div className="relative text-center text-xs uppercase tracking-wide text-slate-400">
            <span className="bg-white px-2">or</span>
            <div className="absolute inset-x-0 top-1/2 h-px -translate-y-1/2 bg-slate-200" aria-hidden="true" />
          </div>

          <form onSubmit={handleEmailSignIn} className="space-y-3">
            <label className="block text-sm font-medium text-slate-700" htmlFor="email">
              Email address
            </label>
            <input
              id="email"
              type="email"
              required
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 shadow-sm focus:border-blue-600 focus:outline-none focus:ring-2 focus:ring-blue-100"
              placeholder="you@example.com"
            />
            <button
              type="submit"
              disabled={!email || emailStatus === "sending"}
              className="w-full rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white shadow-sm transition disabled:cursor-not-allowed disabled:bg-blue-300 hover:bg-blue-700 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-600"
            >
              {emailStatus === "sending" ? "Sending link…" : "Sign in with Email Link"}
            </button>
            {emailStatus === "sent" ? (
              <p className="text-sm text-green-600">Check your inbox for a secure sign-in link.</p>
            ) : null}
            {emailStatus === "error" && magicLinkErrorMessage ? (
              <p className="text-sm text-red-600">{magicLinkErrorMessage}</p>
            ) : null}
          </form>
        </div>

        <div className="space-y-4 rounded-2xl bg-white p-6 shadow-sm ring-1 ring-slate-200">
          <h2 className="text-lg font-semibold text-slate-900">Admin access</h2>
          <p className="text-sm text-slate-600">
            Administrators can sign in instantly with their secure password or use the email link above.
          </p>
          <form onSubmit={handleAdminPasswordSignIn} className="space-y-3">
            <label className="block text-sm font-medium text-slate-700" htmlFor="admin-email">
              Admin email
            </label>
            <input
              id="admin-email"
              type="email"
              required
              value={adminEmail}
              onChange={(event) => setAdminEmail(event.target.value)}
              className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 shadow-sm focus:border-blue-600 focus:outline-none focus:ring-2 focus:ring-blue-100"
              placeholder="jb@jbv.com"
            />

            <label className="block text-sm font-medium text-slate-700" htmlFor="admin-password">
              Password
            </label>
            <input
              id="admin-password"
              type="password"
              required
              value={adminPassword}
              onChange={(event) => setAdminPassword(event.target.value)}
              className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 shadow-sm focus:border-blue-600 focus:outline-none focus:ring-2 focus:ring-blue-100"
              placeholder="Enter admin password"
            />

            <button
              type="submit"
              disabled={!adminEmail || !adminPassword || adminStatus === "signing-in"}
              className="w-full rounded-lg bg-slate-900 px-4 py-2 text-sm font-medium text-white shadow-sm transition disabled:cursor-not-allowed disabled:bg-slate-500 hover:bg-slate-800 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-slate-900"
            >
              {adminStatus === "signing-in" ? "Signing in…" : "Sign in with Password"}
            </button>

            {adminErrorMessage ? <p className="text-sm text-red-600">{adminErrorMessage}</p> : null}
          </form>
        </div>
      </div>
    </div>
  );
}
