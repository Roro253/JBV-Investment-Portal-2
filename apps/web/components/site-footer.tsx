import Link from "next/link";

export function SiteFooter() {
  const year = new Date().getFullYear();

  return (
    <footer className="border-t border-slate-200 bg-white">
      <div className="mx-auto flex w-full max-w-7xl flex-col items-center justify-between gap-4 px-6 py-6 text-center text-xs text-slate-500 md:flex-row md:text-left">
        <p className="text-sm text-slate-600">&copy; {year} JBV Investment Capital. All rights reserved.</p>
        <nav className="flex items-center gap-6 text-sm font-semibold">
          <Link className="text-blue-600 hover:text-blue-700 hover:underline" href="/privacy-policy">
            Privacy Policy
          </Link>
          <Link className="text-blue-600 hover:text-blue-700 hover:underline" href="/terms-of-use">
            Terms of Use
          </Link>
        </nav>
      </div>
    </footer>
  );
}
