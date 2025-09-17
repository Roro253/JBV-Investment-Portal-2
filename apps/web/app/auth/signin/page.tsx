"use client";

import { FormEvent, useCallback, useEffect, useState } from "react";
import { signIn } from "next-auth/react";
import { useSearchParams } from "next/navigation";

const ERROR_MESSAGES: Record<string, string> = {
  CredentialsSignin: "We couldn't find that email in our investor records.",
};

export default function SignInPage() {
  const searchParams = useSearchParams();
  const [email, setEmail] = useState("");
  const [status, setStatus] = useState<"idle" | "submitting" | "error">("idle");
  const [message, setMessage] = useState<string | null>(null);

  const callbackUrl = searchParams?.get("callbackUrl") || (searchParams?.get("target") === "admin" ? "/admin" : "/lp");
  const target = searchParams?.get("target") === "admin" ? "admin" : "lp";
  const errorParam = searchParams?.get("error");

  useEffect(() => {
    if (!errorParam) {
      return;
    }
    const friendly = ERROR_MESSAGES[errorParam] || "Sign-in failed. Please try again.";
    setStatus("error");
    setMessage(friendly);
  }, [errorParam]);

  const heading = target === "admin" ? "Admin access" : "Limited Partner access";
  const description =
    target === "admin"
      ? "Use your authorized JBV email address to manage platform visibility and records."
      : "Enter the email associated with your JBV investor profile to access portfolio insights.";

  const handleSubmit = useCallback(
    async (event: FormEvent<HTMLFormElement>) => {
      event.preventDefault();
      if (!email) return;

      setStatus("submitting");
      setMessage(null);

      try {
        const result = await signIn("credentials", {
          email,
          callbackUrl,
          redirect: false,
        });

        if (result?.error) {
          setStatus("error");
          setMessage(ERROR_MESSAGES[result.error] || "We couldn't verify that email. Please try again or contact support.");
          return;
        }

        if (result?.url) {
          window.location.href = result.url;
          return;
        }

        window.location.href = callbackUrl;
      } catch (error: any) {
        setStatus("error");
        setMessage(error?.message || "Sign-in failed. Please try again.");
      }
    },
    [email, callbackUrl]
  );

  return (
    <div className="min-h-screen bg-slate-50 px-4 py-16">
      <div className="mx-auto flex max-w-xl flex-col gap-8 rounded-2xl bg-white p-8 shadow-lg ring-1 ring-slate-200">
        <div className="space-y-3 text-center">
          <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-blue-600 text-sm font-semibold text-white">
            JBV
          </div>
          <h1 className="text-2xl font-semibold text-slate-900">Sign in to the JBV Investment Platform</h1>
          <p className="text-sm text-slate-600">{heading}</p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-2">
            <label className="block text-sm font-medium text-slate-700" htmlFor="email">
              Email address
            </label>
            <input
              id="email"
              type="email"
              required
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              placeholder="you@example.com"
              className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 shadow-sm transition focus:border-blue-600 focus:outline-none focus:ring-2 focus:ring-blue-100"
            />
            <p className="text-xs text-slate-500">{description}</p>
          </div>

          <button
            type="submit"
            disabled={!email || status === "submitting"}
            className="w-full rounded-lg bg-blue-600 px-4 py-2 text-sm font-semibold text-white shadow-sm transition disabled:cursor-not-allowed disabled:bg-blue-300 hover:bg-blue-700 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-600"
          >
            {status === "submitting" ? "Checking access…" : "Continue"}
          </button>
        </form>

        {message ? (
          <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-600">{message}</div>
        ) : null}

        <div className="space-y-2 text-xs text-slate-500">
          <p>
            Authentication is email-only; Google and password-based access are disabled for this MVP. If you need help, reach out to
            <a className="font-semibold text-blue-600 hover:underline" href="mailto:support@jbv.com">
              {" "}support@jbv.com
            </a>
            .
          </p>
          <p>By continuing, you confirm you are an authorized JBV investor or administrator.</p>
        </div>
      </div>
    </div>
  );
}
