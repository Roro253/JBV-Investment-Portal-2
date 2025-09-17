import Link from "next/link";

const OPTIONS = [
  {
    href: "/auth/signin?callbackUrl=/lp",
    title: "Limited Partner",
    description: "Portfolio analytics, distributions, and capital account documents.",
    cta: "Sign in as LP",
  },
  {
    href: "/auth/signin?callbackUrl=/admin",
    title: "Administrator",
    description: "Manage visibility, documents, and partner communications.",
    cta: "Sign in as Admin",
  },
];

export default function Home() {
  return (
    <main className="flex min-h-screen items-center justify-center bg-slate-50 px-6 py-16">
      <div className="w-full max-w-4xl space-y-10 text-center">
        <div className="space-y-4">
          <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-blue-600 text-base font-semibold text-white">
            JBV
          </div>
          <h1 className="text-3xl font-semibold text-slate-900">Welcome to the JBV Investment Platform</h1>
          <p className="text-base text-slate-600">
            Choose how you would like to access the portal. We&apos;ll guide you through a secure email-only sign in.
          </p>
        </div>

        <div className="grid gap-6 md:grid-cols-2">
          {OPTIONS.map((option) => (
            <Link
              key={option.href}
              href={option.href}
              className="group flex flex-col justify-between rounded-2xl border border-slate-200 bg-white p-6 text-left shadow-sm transition hover:border-blue-400 hover:shadow-lg"
            >
              <div className="space-y-3">
                <p className="text-sm font-semibold uppercase tracking-[0.18em] text-blue-600">Secure Access</p>
                <h2 className="text-2xl font-semibold text-slate-900">{option.title}</h2>
                <p className="text-sm text-slate-600">{option.description}</p>
              </div>
              <span className="mt-6 inline-flex items-center text-sm font-semibold text-blue-600 group-hover:translate-x-1 transition">
                {option.cta}
                <svg
                  className="ml-2 h-4 w-4"
                  viewBox="0 0 16 16"
                  fill="none"
                  xmlns="http://www.w3.org/2000/svg"
                >
                  <path
                    d="M5.25 3.75L10.25 8L5.25 12.25"
                    stroke="currentColor"
                    strokeWidth="1.5"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  />
                </svg>
              </span>
            </Link>
          ))}
        </div>
      </div>
    </main>
  );
}
