import "@/styles/globals.css";
import React from "react";

export const metadata = {
  title: "JBV Investment Platform",
  description: "Admin Portal",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className="bg-white text-slate-900">{children}</body>
    </html>
  );
}

