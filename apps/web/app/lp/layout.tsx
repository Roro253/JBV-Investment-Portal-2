import type { ReactNode } from "react";
import NavTabs from "./NavTabs";

export const metadata = {
  title: "JBV Investment Platform | Limited Partner Portal",
};

export default function LpLayout({ children }: { children: ReactNode }) {
  return (
    <div className="min-h-screen bg-slate-50 text-slate-900">
      <header className="border-b border-slate-200 bg-white">
        <div className="mx-auto flex max-w-6xl flex-col gap-6 px-6 py-8">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.4em] text-blue-500">JBV Investment Platform</p>
            <h1 className="mt-2 text-3xl font-semibold text-slate-900">Limited Partner Center</h1>
            <p className="mt-2 max-w-3xl text-sm text-slate-500">
              Monitor commitments, performance, and key documents with a clear, data-rich dashboard tailored for investors.
            </p>
          </div>
          <NavTabs />
        </div>
      </header>
      <main className="mx-auto flex max-w-6xl flex-col gap-8 px-6 py-10">{children}</main>
    </div>
  );
}
