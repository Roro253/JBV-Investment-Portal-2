export default function Home() {
  return (
    <main className="min-h-screen bg-slate-50 px-4 py-16">
      <div className="mx-auto flex max-w-4xl flex-col items-center justify-center gap-10 text-center">
        <div className="space-y-4">
          <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-blue-600 text-lg font-semibold text-white">
            JBV
          </div>
          <h1 className="text-3xl font-semibold text-slate-900">Welcome to the JBV Investment Platform</h1>
          <p className="text-sm text-slate-600">
            Select your portal to continue. Limited Partners and administrators use the same secure email authentication.
          </p>
        </div>

        <div className="grid w-full gap-6 md:grid-cols-2">
          <a
            href="/auth/signin?target=lp"
            className="group flex flex-col justify-between rounded-2xl border border-slate-200 bg-white p-6 text-left shadow-sm transition hover:-translate-y-1 hover:border-blue-500 hover:shadow-md"
          >
            <div className="space-y-3">
              <span className="inline-flex items-center rounded-full bg-blue-50 px-3 py-1 text-xs font-semibold text-blue-600">
                Limited Partner
              </span>
              <h2 className="text-xl font-semibold text-slate-900">Investor Dashboard</h2>
              <p className="text-sm text-slate-600">
                Access tailored portfolio metrics, performance charts, and investor documents curated for your allocations.
              </p>
            </div>
            <span className="mt-6 inline-flex items-center gap-2 text-sm font-semibold text-blue-600">
              Continue as LP
              <span aria-hidden>→</span>
            </span>
          </a>
          <a
            href="/auth/signin?target=admin"
            className="group flex flex-col justify-between rounded-2xl border border-slate-200 bg-white p-6 text-left shadow-sm transition hover:-translate-y-1 hover:border-blue-500 hover:shadow-md"
          >
            <div className="space-y-3">
              <span className="inline-flex items-center rounded-full bg-slate-900 px-3 py-1 text-xs font-semibold text-white">
                Admin
              </span>
              <h2 className="text-xl font-semibold text-slate-900">Operations Console</h2>
              <p className="text-sm text-slate-600">
                Manage visibility rules, update records, and oversee investment data for the full JBV portfolio.
              </p>
            </div>
            <span className="mt-6 inline-flex items-center gap-2 text-sm font-semibold text-blue-600 group-hover:text-blue-700">
              Continue as Admin
              <span aria-hidden>→</span>
            </span>
          </a>
        </div>

        <p className="text-xs text-slate-500">
          Need help? Email <a className="font-semibold text-blue-600 hover:underline" href="mailto:support@jbv.com">support@jbv.com</a> for assistance.
        </p>
      </div>
    </main>
  );
}

