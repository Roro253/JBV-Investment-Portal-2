"use client";

export default function HelpPage() {
  return (
    <div className="rounded-3xl border border-slate-200 bg-white p-8 shadow-sm">
      <h2 className="text-xl font-semibold text-slate-900">Need assistance?</h2>
      <p className="mt-3 text-sm text-slate-600">
        For support with the JBV Investment Platform, please contact <a href="mailto:support@jbv.com" className="text-blue-600 hover:underline">support@jbv.com</a> or reach out to your relationship manager.
      </p>
      <ul className="mt-6 space-y-3 text-sm text-slate-600">
        <li>
          <span className="font-semibold text-slate-800">Account Access:</span> Request new user access or report sign-in issues.
        </li>
        <li>
          <span className="font-semibold text-slate-800">Documents:</span> Let us know if a distribution notice or subscription file is missing.
        </li>
        <li>
          <span className="font-semibold text-slate-800">Data Questions:</span> We can help reconcile commitment balances, NAV values, or performance metrics.
        </li>
      </ul>
    </div>
  );
}
