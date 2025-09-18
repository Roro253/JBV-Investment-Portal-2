"use client";

import Link from "next/link";
import { FormEvent, Suspense, useMemo, useState } from "react";
import { signIn } from "next-auth/react";
import { useSearchParams } from "next/navigation";

const ERROR_MESSAGES: Record<string, string> = {
  Configuration: "We were unable to process your request. Please try again.",
  AccessDenied: "We couldn't sign you in. Please try again.",
};
const CONFIRMATION_MESSAGE = "If your email is registered, we've sent a sign-in link.";

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
  const [status, setStatus] = useState<"idle" | "submitting">("idle");
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [hasSubmitted, setHasSubmitted] = useState(false);

  const callbackUrl = searchParams?.get("callbackUrl") || "/lp";

  const queryError = useMemo(() => {
    const errorKey = searchParams?.get("error");
    if (!errorKey) return null;
    return ERROR_MESSAGES[errorKey] || "We were unable to sign you in. Please try again.";
  }, [searchParams]);

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setStatus("submitting");
    setErrorMessage(null);

    try {
      const result = await signIn("email", {
        email,
        callbackUrl,
        redirect: false,
      });

      if (result?.status === 429) {
        setErrorMessage("Too many sign-in requests. Please try again later.");
      } else if (result?.error) {
        const friendly = ERROR_MESSAGES[result.error] || "We couldn't send the sign-in link. Please try again.";
        setErrorMessage(friendly);
      } else if (result && result.ok === false) {
        setErrorMessage("We couldn't send the sign-in link. Please try again.");
      }
    } catch (error) {
      console.error("[auth] Email sign-in request failed", error);
      setErrorMessage("We couldn't send the sign-in link. Please try again or contact support.");
    } finally {
      setStatus("idle");
      setHasSubmitted(true);
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
                onChange={(event) => setEmail(event.target.value)}
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
              {status === "submitting" ? "Sending link…" : "Send sign-in link"}
            </button>
          </form>

          {(hasSubmitted || queryError) && (
            <div className="rounded-lg border border-blue-200 bg-blue-50 px-3 py-2 text-sm text-slate-700">
              {CONFIRMATION_MESSAGE}
            </div>
          )}

          {(errorMessage || queryError) && (
            <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-600">
              {errorMessage || queryError}
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
