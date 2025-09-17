"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import type { ReactNode } from "react";
import { LpDataProvider, useLpData } from "./lp-data-context";

const NAV_ITEMS = [
  { href: "/lp", label: "Overview" },
  { href: "/lp/investments", label: "Investments" },
  { href: "/lp/docs", label: "Documents" },
  { href: "/lp/help", label: "Help" },
];

function ProfileChip() {
  const { data, initialized, status } = useLpData();
  const isActive = initialized && !!data && status !== "error";
  const dotTone = status === "error" ? "bg-red-500" : isActive ? "bg-emerald-500" : "bg-amber-400";
  const sessionLabel = status === "error" ? "Connection issue" : isActive ? "Secure session active" : "Establishing secure session";

  return (
    <div className="flex items-center gap-3 rounded-full bg-slate-100/70 px-4 py-2 text-left shadow-inner">
      <span className={`h-2.5 w-2.5 rounded-full ${dotTone}`} aria-hidden="true" />
      <div>
        <p className="text-sm font-semibold text-slate-900">
          {data?.profile.name || "Investor"}
        </p>
        <p className="text-xs text-slate-500">{data?.profile.email || "Loading…"}</p>
        <p className="mt-1 text-[10px] font-semibold uppercase tracking-wide text-slate-500">{sessionLabel}</p>
      </div>
    </div>
  );
}

export default function LPLayout({ children }: { children: ReactNode }) {
  const pathname = usePathname();

  return (
    <LpDataProvider>
      <div className="min-h-screen bg-slate-50">
        <header className="border-b border-slate-200 bg-white">
          <div className="mx-auto max-w-7xl px-6 py-8">
            <div className="flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
              <div className="space-y-2">
                <p className="text-xs font-semibold uppercase tracking-[0.35em] text-blue-600">JBV Investment Platform</p>
                <h1 className="text-3xl font-semibold text-slate-900">Limited Partner Experience</h1>
                <p className="text-sm text-slate-500">
                  Insights, performance, and documents tailored to your investments.
                </p>
              </div>
              <ProfileChip />
            </div>
            <nav className="mt-6 flex flex-wrap gap-2 text-sm font-medium">
              {NAV_ITEMS.map((item) => {
                const isActive = pathname === item.href || pathname.startsWith(`${item.href}/`);
                return (
                  <Link
                    key={item.href}
                    href={item.href}
                    className={`rounded-full px-4 py-2 transition ${
                      isActive
                        ? "bg-blue-600 text-white shadow"
                        : "text-slate-600 hover:bg-slate-100 hover:text-slate-900"
                    }`}
                  >
                    {item.label}
                  </Link>
                );
              })}
            </nav>
          </div>
        </header>
        <main className="mx-auto max-w-7xl px-6 py-10">{children}</main>
      </div>
    </LpDataProvider>
  );
}
