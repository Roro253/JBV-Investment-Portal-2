"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useMemo, useState, type ReactNode } from "react";

const NAV_ITEMS = [
  { href: "/lp", label: "Overview" },
  { href: "/lp/investments", label: "Investments" },
  { href: "/lp/docs", label: "Documents" },
  { href: "/lp/help", label: "Help" },
  { href: "/lp/summary", label: "Investment Summary" },
];

type Profile = {
  name: string;
  email: string;
};

export default function LPLayout({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const [profile, setProfile] = useState<Profile | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);

  useEffect(() => {
    let isMounted = true;

    const loadProfile = async () => {
      try {
        const response = await fetch("/api/lp/data", {
          cache: "no-store",
          credentials: "same-origin",
        });
        if (!response.ok) {
          throw new Error(`Request failed with status ${response.status}`);
        }
        const payload = (await response.json()) as { profile?: Profile | null };
        if (!isMounted) return;
        setProfile(payload.profile ?? null);
        setError(false);
      } catch (err) {
        if (!isMounted) return;
        setError(true);
      } finally {
        if (isMounted) setLoading(false);
      }
    };

    loadProfile();

    const handleFocus = () => {
      loadProfile();
    };

    window.addEventListener("focus", handleFocus);
    return () => {
      isMounted = false;
      window.removeEventListener("focus", handleFocus);
    };
  }, []);

  const initials = useMemo(() => {
    const name = profile?.name?.trim();
    if (!name) return "LP";
    const parts = name.split(/\s+/).filter(Boolean);
    if (!parts.length) return name.slice(0, 2).toUpperCase();
    const first = parts[0]?.[0] ?? "";
    const last = parts.length > 1 ? parts[parts.length - 1]?.[0] ?? "" : "";
    const combo = `${first}${last}`.toUpperCase();
    return combo || name.slice(0, 2).toUpperCase();
  }, [profile?.name]);

  const status = useMemo(() => {
    if (profile) {
      return { label: "Secure session active", tone: "text-emerald-600", dot: "bg-emerald-500" };
    }
    if (error) {
      return { label: "Session connection issue", tone: "text-red-600", dot: "bg-red-500" };
    }
    return { label: "Connecting…", tone: "text-slate-500", dot: "bg-slate-300" };
  }, [profile, error]);

  return (
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
            <div className="flex items-center gap-3 rounded-full border border-slate-200 bg-white px-4 py-2 shadow-sm">
              <div className="flex h-10 w-10 items-center justify-center rounded-full bg-blue-600 text-sm font-semibold text-white">
                {initials}
              </div>
              <div className="flex flex-col">
                <span className="text-sm font-semibold text-slate-900">
                  {profile?.name || (loading ? "Loading investor" : "Investor")}
                </span>
                <span className="text-xs text-slate-500">{profile?.email || (error ? "Unavailable" : "")}</span>
              </div>
              <div className={`flex items-center gap-2 text-xs font-medium ${status.tone}`}>
                <span className={`h-2 w-2 rounded-full ${status.dot}`} aria-hidden="true" />
                {status.label}
              </div>
            </div>
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
  );
}
