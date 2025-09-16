import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { getToken } from "next-auth/jwt";

const PUBLIC_FILE = /\.(.*)$/;

function createSignInRedirect(req: NextRequest) {
  const signInUrl = new URL("/auth/signin", req.url);
  const callbackPath = `${req.nextUrl.pathname}${req.nextUrl.search}`;
  if (callbackPath && callbackPath !== "/auth/signin") {
    signInUrl.searchParams.set("callbackUrl", callbackPath);
  }
  return NextResponse.redirect(signInUrl);
}

export async function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;

  if (
    pathname === "/" ||
    pathname.startsWith("/auth") ||
    pathname.startsWith("/api/auth") ||
    PUBLIC_FILE.test(pathname)
  ) {
    return NextResponse.next();
  }

  const token = await getToken({ req, secret: process.env.NEXTAUTH_SECRET });
  const isAuthenticated = Boolean(token?.email);
  const role = token?.role as string | undefined;

  if (pathname.startsWith("/admin")) {
    if (!isAuthenticated) {
      return createSignInRedirect(req);
    }
    if (role !== "admin") {
      return NextResponse.redirect(new URL("/lp", req.url));
    }
    return NextResponse.next();
  }

  if (pathname.startsWith("/lp")) {
    if (!isAuthenticated) {
      return createSignInRedirect(req);
    }
    return NextResponse.next();
  }

  return NextResponse.next();
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico|robots.txt|sitemap.xml).*)"],
};
