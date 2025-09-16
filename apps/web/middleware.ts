import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { getToken } from "next-auth/jwt";
import { isAdmin } from "@/lib/auth-helpers";

async function ensureAuthenticated(req: NextRequest) {
  const token = await getToken({ req, secret: process.env.NEXTAUTH_SECRET });
  return token;
}

function buildSignInRedirect(req: NextRequest) {
  const signInUrl = new URL("/auth/signin", req.nextUrl.origin);
  signInUrl.searchParams.set("callbackUrl", req.nextUrl.href);
  return NextResponse.redirect(signInUrl);
}

export async function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;

  if (pathname.startsWith("/admin")) {
    const token = await ensureAuthenticated(req);
    if (!token) {
      return buildSignInRedirect(req);
    }
    if (!isAdmin(token.email)) {
      return NextResponse.redirect(new URL("/lp", req.nextUrl.origin));
    }
    return NextResponse.next();
  }

  if (pathname.startsWith("/lp")) {
    const token = await ensureAuthenticated(req);
    if (!token) {
      return buildSignInRedirect(req);
    }
    return NextResponse.next();
  }

  return NextResponse.next();
}

export const config = {
  matcher: ["/lp/:path*", "/admin/:path*"],
};
