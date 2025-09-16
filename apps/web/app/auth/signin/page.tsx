"use client";

import { FormEvent, useState } from "react";
import { signIn } from "next-auth/react";
import { useSearchParams } from "next/navigation";

export default function SignInPage() {
  const searchParams = useSearchParams();
  const [email, setEmail] = useState("");
  const [emailStatus, setEmailStatus] = useState<"idle" | "sending" | "sent" | "error">("idle");
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const callbackUrl = searchParams?.get("callbackUrl") || "/lp";

  const handleEmailSignIn = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setEmailStatus("sending");
    setErrorMessage(null);
    try {
      const result = await signIn("email", {
        email,
        redirect: false,
        callbackUrl,
      });

      if (result?.error) {
        setEmailStatus("error");
        setErrorMessage(result.error);
      } else {
        setEmailStatus("sent");
      }
    } catch (err: any) {
      setEmailStatus("error");
      setErrorMessage(err?.message || "Failed to send sign-in link.");
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
            {emailStatus === "error" && errorMessage ? (
              <p className="text-sm text-red-600">{errorMessage}</p>
            ) : null}
          </form>
        </div>
      </div>
    </div>
  );
}
