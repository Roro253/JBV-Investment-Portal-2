"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const NAV_ITEMS = [
  { href: "/lp", label: "Overview" },
  { href: "/lp/investments", label: "Investments" },
  { href: "/lp/docs", label: "Documents" },
  { href: "/lp/help", label: "Help" },
];

export default function NavTabs() {
  const pathname = usePathname();

  return (
    <nav className="flex flex-wrap items-center gap-2 text-sm font-medium text-slate-600">
      {NAV_ITEMS.map((item) => {
        const isActive =
          pathname === item.href ||
          (item.href !== "/lp" && pathname.startsWith(`${item.href}/`));
        return (
          <Link
            key={item.href}
            href={item.href}
            className={`rounded-full px-4 py-2 transition ${
              isActive
                ? "bg-blue-600 text-white shadow"
                : "hover:bg-blue-50 hover:text-blue-700"
            }`}
          >
            {item.label}
          </Link>
        );
      })}
    </nav>
  );
}
