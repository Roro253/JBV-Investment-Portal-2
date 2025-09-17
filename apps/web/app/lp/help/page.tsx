export default function HelpPage() {
  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-semibold text-slate-900">Help &amp; Resources</h2>
        <p className="text-sm text-slate-600">
          Looking for assistance? Your dedicated JBV team is ready to help. Reach out to your relationship manager or email
          <a href="mailto:support@jbv.com" className="text-blue-600 hover:underline">
            {" "}support@jbv.com
          </a>
          .
        </p>
      </div>

      <div className="space-y-4 rounded-2xl bg-white p-6 shadow-sm ring-1 ring-slate-200">
        <h3 className="text-lg font-semibold text-slate-900">Key Terms</h3>
        <dl className="grid gap-4 text-sm text-slate-600 md:grid-cols-2">
          <div>
            <dt className="font-semibold text-slate-800">Commitment</dt>
            <dd className="mt-1 text-slate-500">The total capital you have agreed to invest in a specific vehicle.</dd>
          </div>
          <div>
            <dt className="font-semibold text-slate-800">Contributions</dt>
            <dd className="mt-1 text-slate-500">Capital that has been called and funded toward your commitment.</dd>
          </div>
          <div>
            <dt className="font-semibold text-slate-800">Distributions</dt>
            <dd className="mt-1 text-slate-500">Cash or stock returned to you from realized investments.</dd>
          </div>
          <div>
            <dt className="font-semibold text-slate-800">NAV</dt>
            <dd className="mt-1 text-slate-500">Net Asset Value representing the estimated fair value of your remaining holdings.</dd>
          </div>
          <div>
            <dt className="font-semibold text-slate-800">MOIC</dt>
            <dd className="mt-1 text-slate-500">Multiple on Invested Capital, calculated as total value divided by contributed capital.</dd>
          </div>
          <div>
            <dt className="font-semibold text-slate-800">Vintage</dt>
            <dd className="mt-1 text-slate-500">The year in which a fund began deploying capital; useful for comparing peers.</dd>
          </div>
        </dl>
      </div>

      <div className="space-y-3 rounded-2xl bg-white p-6 shadow-sm ring-1 ring-slate-200">
        <h3 className="text-lg font-semibold text-slate-900">Tips</h3>
        <ul className="list-disc space-y-2 pl-4 text-sm text-slate-600">
          <li>Dashboard data refreshes automatically every 15 seconds and when you return to the window.</li>
          <li>Export holdings to CSV directly from the Investments tab for offline analysis.</li>
          <li>Documents are grouped by investment, and new files appear instantly when uploaded to Airtable.</li>
        </ul>
      </div>
    </div>
  );
}
