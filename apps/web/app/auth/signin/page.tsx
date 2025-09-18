"use client";

import Link from "next/link";
import { FormEvent, Suspense, useMemo, useState } from "react";
import { signIn } from "next-auth/react";
import { useSearchParams } from "next/navigation";

const ERROR_MESSAGES: Record<string, string> = {
  AccessDenied: "You do not have permission to access this area.",
  Verification: "That sign-in link is no longer valid. Request a new one.",
  EmailSignin: "We were unable to verify that link. Request a new one.",
};

const SUCCESS_MESSAGE =
  "If your email is registered, we've sent a sign-in link. Please check your inbox and spam folder.";

export default function SignInPage() {
  return (
    <Suspense fallback={<SignInLoadingState />}>
      <SignInForm />
    </Suspense>
  );
}

function SignInForm() {
  const searchParams = useSearchParams();
  const [email, setEmail] = useState("");
  const [status, setStatus] = useState<"idle" | "submitting" | "success">("idle");
  const [statusMessage, setStatusMessage] = useState<string | null>(null);

  const callbackUrl = searchParams?.get("callbackUrl") || "/lp";

  const queryError = useMemo(() => {
    const errorKey = searchParams?.get("error");
    if (!errorKey) return null;
    return ERROR_MESSAGES[errorKey] || "We were unable to sign you in. Please try again.";
  }, [searchParams]);

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setStatus("submitting");
    setStatusMessage(null);

    try {
      const result = await signIn("email", {
        email,
        callbackUrl,
        redirect: false,
      });

      if (result?.error) {
        console.error("[auth] Magic link request returned an error", result.error);
      }

      setStatus("success");
      setStatusMessage(SUCCESS_MESSAGE);
    } catch (error) {
      console.error("[auth] Email sign-in failed", error);
      setStatus("success");
      setStatusMessage(SUCCESS_MESSAGE);
    }
  };

  return (
    <div className="flex min-h-screen items-center justify-center bg-slate-50 px-4 py-16">
      <div className="w-full max-w-md space-y-8">
        <div className="space-y-3 text-center">
          <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-blue-600 text-sm font-semibold text-white">
            JBV
          </div>
          <h1 className="text-2xl font-semibold text-slate-900">JBV Investment Platform</h1>
          <p className="text-sm text-slate-600">
            Enter the email associated with your investor profile to access the limited partner experience.
          </p>
        </div>

        <div className="space-y-4 rounded-2xl bg-white p-6 shadow-sm ring-1 ring-slate-200">
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="space-y-2 text-left">
              <label className="text-sm font-medium text-slate-700" htmlFor="email">
                Email address
              </label>
              <input
                id="email"
                type="email"
                required
                value={email}
                onChange={(event) => {
                  setEmail(event.target.value);
                  if (status === "success") {
                    setStatus("idle");
                    setStatusMessage(null);
                  }
                }}
                className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 shadow-sm focus:border-blue-600 focus:outline-none focus:ring-2 focus:ring-blue-100"
                placeholder="you@example.com"
                autoComplete="email"
              />
            </div>
            <button
              type="submit"
              disabled={!email || status === "submitting"}
              className="w-full rounded-lg bg-blue-600 px-4 py-2 text-sm font-semibold text-white shadow-sm transition disabled:cursor-not-allowed disabled:bg-blue-300 hover:bg-blue-700 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-600"
            >
              {status === "submitting"
                ? "Sending…"
                : status === "success"
                  ? "Resend link"
                  : "Send sign-in link"}
            </button>
          </form>

          {(statusMessage || queryError) && (
            <div className="space-y-2">
              {statusMessage && (
                <div className="rounded-lg border border-blue-200 bg-blue-50 px-3 py-2 text-sm text-blue-800">
                  {statusMessage}
                </div>
              )}
              {queryError && (
                <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-600">
                  {queryError}
                </div>
              )}
            </div>
          )}

          <p className="text-xs text-slate-500">
            By logging in, you acknowledge that you have read and agree to the {" "}
            <Link className="font-semibold text-blue-600 hover:underline" href="/terms-of-use">
              Terms of Use
            </Link>{" "}
            and that you have reviewed the {" "}
            <Link className="font-semibold text-blue-600 hover:underline" href="/privacy-policy">
              Privacy Policy
            </Link>
            .
          </p>

          <p className="text-xs text-slate-500">
            Need assistance? Contact your JBV relationship manager or email
            {" "}
            <a className="font-medium text-blue-600 hover:underline" href="mailto:jb@JBV.com">
              jb@JBV.com
            </a>
            .
          </p>
        </div>
      </div>
    </div>
  );
}

function SignInLoadingState() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-slate-50 px-4 py-16">
      <div className="w-full max-w-md rounded-2xl bg-white p-6 shadow-sm ring-1 ring-slate-200">
        <div className="space-y-3 text-center">
          <div className="mx-auto h-12 w-12 rounded-full bg-blue-100" />
          <div className="mx-auto h-6 w-40 rounded-full bg-slate-200" />
          <div className="mx-auto h-4 w-full rounded-full bg-slate-100" />
        </div>
      </div>
    </div>
  );
}
