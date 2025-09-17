import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { getToken } from "next-auth/jwt";
import { isAdmin } from "@/lib/auth-helpers";

const AUTH_SECRET = process.env.NEXTAUTH_SECRET || "development-secret";

async function ensureAuthenticated(req: NextRequest) {
  return getToken({ req, secret: AUTH_SECRET });
}

function buildSignInRedirect(req: NextRequest, target: "lp" | "admin") {
  const signInUrl = new URL("/auth/signin", req.nextUrl.origin);
  signInUrl.searchParams.set("callbackUrl", req.nextUrl.href);
  signInUrl.searchParams.set("target", target);
  return NextResponse.redirect(signInUrl);
}

export async function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;

  if (pathname.startsWith("/admin")) {
    const token = await ensureAuthenticated(req);
    if (!token) {
      return buildSignInRedirect(req, "admin");
    }
    if (!isAdmin(token.email)) {
      return NextResponse.redirect(new URL("/lp", req.nextUrl.origin));
    }
    return NextResponse.next();
  }

  if (pathname.startsWith("/lp")) {
    const token = await ensureAuthenticated(req);
    if (!token) {
      return buildSignInRedirect(req, "lp");
    }
    return NextResponse.next();
  }

  return NextResponse.next();
}

export const config = {
  matcher: ["/lp/:path*", "/admin/:path*"],
};
