import type { Metadata } from "next";
import type { ReactNode } from "react";

import { LpShell } from "@/components/lp/LpShell";

export const metadata: Metadata = {
  title: "JBV Investment Platform · Limited Partner",
  description: "Performance insights, holdings, and documents for JBV investors.",
  robots: {
    index: false,
    follow: false,
  },
};

export default function LpLayout({ children }: { children: ReactNode }) {
  return <LpShell>{children}</LpShell>;
}
