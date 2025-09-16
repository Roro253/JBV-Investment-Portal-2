"use client";

import { useEffect, useState } from "react";
import { getProviders, signIn } from "next-auth/react";
import type { ClientSafeProvider } from "next-auth/react";

export default function SignInPage() {
  const [providers, setProviders] = useState<Record<string, ClientSafeProvider> | null>(null);
  const [email, setEmail] = useState("");
  const [emailStatus, setEmailStatus] = useState<"idle" | "sending" | "sent" | "error">("idle");
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let isMounted = true;
    getProviders().then((res) => {
      if (isMounted) setProviders(res);
    });
    return () => {
      isMounted = false;
    };
  }, []);

  const googleProvider = providers?.google;
  const emailProvider = providers?.email;

  async function handleEmailSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!emailProvider) return;
    if (!email) {
      setError("Please enter your email address");
      return;
    }
    setError(null);
    setEmailStatus("sending");
    const result = await signIn("email", {
      email,
      redirect: false,
      callbackUrl: "/lp",
    });
    if (result?.error) {
      setEmailStatus("error");
      setError("Unable to send sign-in link. Please try again.");
    } else {
      setEmailStatus("sent");
    }
  }

  return (
    <div className="min-h-screen bg-slate-50 flex items-center justify-center py-16 px-4">
      <div className="w-full max-w-lg rounded-3xl bg-white shadow-xl border border-slate-200 p-10 space-y-8">
        <div className="space-y-2 text-center">
          <p className="text-sm font-semibold uppercase tracking-wide text-blue-600">JBV Investment Platform</p>
          <h1 className="text-3xl font-semibold text-slate-900">Sign in to continue</h1>
          <p className="text-sm text-slate-500">
            Access your investments, documents, and insights from anywhere.
          </p>
        </div>

        {error ? (
          <div className="rounded-md bg-red-50 px-4 py-3 text-sm text-red-600 border border-red-200">
            {error}
          </div>
        ) : null}

        <div className="space-y-4">
          {googleProvider ? (
            <button
              type="button"
              onClick={() => signIn(googleProvider.id, { callbackUrl: "/lp" })}
              className="w-full inline-flex items-center justify-center gap-2 rounded-xl border border-slate-200 bg-white py-3 text-sm font-medium text-slate-700 shadow-sm transition hover:border-blue-400 hover:text-blue-700"
            >
              <svg
                className="h-5 w-5"
                viewBox="0 0 24 24"
                aria-hidden="true"
                focusable="false"
              >
                <path
                  fill="#4285F4"
                  d="M23.52 12.273c0-.851-.076-1.67-.218-2.455H12v4.648h6.44a5.504 5.504 0 0 1-2.39 3.61v3.003h3.867c2.266-2.087 3.603-5.165 3.603-8.806z"
                />
                <path
                  fill="#34A853"
                  d="M12 24c3.24 0 5.956-1.074 7.941-2.92l-3.867-3.003c-1.075.72-2.449 1.146-4.074 1.146-3.132 0-5.787-2.116-6.737-4.96H1.243v3.118A12.001 12.001 0 0 0 12 24z"
                />
                <path
                  fill="#FBBC05"
                  d="M5.263 14.263A7.198 7.198 0 0 1 4.87 12c0-.785.135-1.545.377-2.263V6.62H1.243A11.998 11.998 0 0 0 0 12c0 1.933.46 3.759 1.243 5.38l4.02-3.117z"
                />
                <path
                  fill="#EA4335"
                  d="M12 4.75c1.76 0 3.337.605 4.583 1.795l3.437-3.438C17.951 1.232 15.235 0 12 0 7.32 0 3.258 2.69 1.243 6.62l4.004 3.117C6.213 6.866 8.868 4.75 12 4.75z"
                />
              </svg>
              Sign in with Google
            </button>
          ) : null}

          {emailProvider ? (
            <div className="space-y-3">
              <div className="flex items-center gap-3">
                <div className="h-px flex-1 bg-slate-200" />
                <span className="text-xs font-medium uppercase tracking-widest text-slate-400">or</span>
                <div className="h-px flex-1 bg-slate-200" />
              </div>
              <form onSubmit={handleEmailSubmit} className="space-y-4">
                <label className="block text-left text-sm font-medium text-slate-600">
                  Email address
                  <input
                    type="email"
                    value={email}
                    onChange={(event) => {
                      setEmail(event.target.value);
                      setEmailStatus("idle");
                    }}
                    className="mt-1 w-full rounded-xl border border-slate-200 px-4 py-3 text-sm text-slate-900 focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-100"
                    placeholder="you@example.com"
                    required
                  />
                </label>
                <button
                  type="submit"
                  className="w-full rounded-xl bg-blue-600 px-4 py-3 text-sm font-semibold text-white shadow-sm transition hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-100"
                  disabled={emailStatus === "sending"}
                >
                  {emailStatus === "sending" ? "Sending magic link…" : "Send magic link"}
                </button>
                {emailStatus === "sent" ? (
                  <p className="text-sm text-blue-600">Check your inbox for a secure sign-in link.</p>
                ) : null}
              </form>
            </div>
          ) : null}

          {!googleProvider && !emailProvider ? (
            <p className="text-sm text-slate-500 text-center">
              No authentication providers are currently configured. Please contact your administrator.
            </p>
          ) : null}
        </div>

        <p className="text-xs text-slate-400 text-center">
          By signing in you agree to our confidentiality and data use policies.
        </p>
      </div>
    </div>
  );
}
