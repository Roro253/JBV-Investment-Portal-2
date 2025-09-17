"use client";

import { FormEvent, useMemo, useState } from "react";
import { signIn } from "next-auth/react";
import { useSearchParams } from "next/navigation";

const ERROR_MESSAGES: Record<string, string> = {
  CredentialsSignin: "We couldn't find that email in our investor records.",
  AccessDenied: "You do not have permission to access this area.",
};

export default function SignInPage() {
  const searchParams = useSearchParams();
  const [email, setEmail] = useState("");
  const [status, setStatus] = useState<"idle" | "submitting">("idle");
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

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
      const result = await signIn("credentials", {
        email,
        callbackUrl,
        redirect: false,
      });

      if (!result) {
        setErrorMessage("Unexpected authentication response. Please try again.");
        return;
      }

      if (result.error) {
        const friendly = ERROR_MESSAGES[result.error] || "We couldn't verify that email.";
        setErrorMessage(friendly);
        return;
      }

      if (result.url) {
        window.location.href = result.url;
        return;
      }

      window.location.href = callbackUrl;
    } catch (error) {
      console.error("[auth] Email sign-in failed", error);
      setErrorMessage("We couldn't verify that email. Please try again or contact support.");
    } finally {
      setStatus("idle");
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
              {status === "submitting" ? "Signing in…" : "Continue"}
            </button>
          </form>

          {(errorMessage || queryError) && (
            <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-600">
              {errorMessage || queryError}
            </div>
          )}

          <p className="text-xs text-slate-500">
            Need assistance? Contact your JBV relationship manager or email
            {" "}
            <a className="font-medium text-blue-600 hover:underline" href="mailto:support@jbv.com">
              support@jbv.com
            </a>
            .
          </p>
        </div>
      </div>
    </div>
  );
}
