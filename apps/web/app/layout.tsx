import "@/styles/globals.css";
import React from "react";
import { SiteFooter } from "@/components/site-footer";

export const metadata = {
  title: "JBV Investment Platform",
  description: "Admin Portal",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className="bg-white text-slate-900">
        <div className="flex min-h-screen flex-col">
          <div className="flex-1">{children}</div>
          <SiteFooter />
        </div>
      </body>
    </html>
  );
}

