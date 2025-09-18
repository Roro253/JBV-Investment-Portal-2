import Link from "next/link";

export default function HelpPage() {
  return (
    <div className="space-y-4">
      <h2 className="text-2xl font-semibold text-slate-900">Help & Resources</h2>
      <p className="text-sm text-slate-600">
        Looking for assistance? Your dedicated JBV team is ready to help. Reach out to your relationship manager or email
        <a href="mailto:jb@JBV.com" className="text-blue-600 hover:underline">
          jb@JBV.com
        </a>
        .
      </p>
      <div className="space-y-3 rounded-2xl bg-white p-6 shadow-sm ring-1 ring-slate-200">
        <h3 className="text-lg font-semibold text-slate-900">Tips</h3>
        <ul className="list-disc space-y-2 pl-4 text-sm text-slate-600">
          <li>Dashboard data refreshes automatically every 15 seconds and when you return to the window.</li>
          <li>Export holdings to CSV directly from the Investments tab for offline analysis.</li>
          <li>Documents are grouped by investment, and new files appear instantly when uploaded to Airtable.</li>
        </ul>
      </div>
      <div className="space-y-3 rounded-2xl bg-white p-6 shadow-sm ring-1 ring-slate-200">
        <h3 className="text-lg font-semibold text-slate-900">Compliance &amp; Legal References</h3>
        <p className="text-sm text-slate-600">
          Review the governing policies for the Portal at any time via the resources below.
        </p>
        <ul className="space-y-2 text-sm text-slate-600">
          <li>
            <Link className="font-semibold text-blue-600 hover:underline" href="/privacy-policy">
              Privacy Policy of the JBV Investment Capital Limited Partner Portal
            </Link>
          </li>
          <li>
            <Link className="font-semibold text-blue-600 hover:underline" href="/terms-of-use">
              Terms of Use of the JBV Investment Capital Limited Partner Portal
            </Link>
          </li>
        </ul>
      </div>
    </div>
  );
}
