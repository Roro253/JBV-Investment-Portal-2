import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { getToken } from "next-auth/jwt";

import { env } from "@/lib/env";
import { isAdmin } from "@/lib/is-admin";

const WINDOW_MS = 15 * 60 * 1000;
const LIMIT = 3;

const buckets = new Map<string, { count: number; reset: number }>();

async function ensureAuthenticated(req: NextRequest) {
  return getToken({ req, secret: env.NEXTAUTH_SECRET });
}

function buildSignInRedirect(req: NextRequest) {
  const signInUrl = new URL("/auth/signin", req.nextUrl.origin);
  signInUrl.searchParams.set("callbackUrl", req.nextUrl.href);
  return NextResponse.redirect(signInUrl);
}

function rateLimitEmailSignIn(req: NextRequest) {
  if (!(req.method === "POST" && req.nextUrl.pathname === "/api/auth/signin/email")) {
    return null;
  }

  const ip =
    req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
    req.ip ||
    "unknown";

  const now = Date.now();
  const entry = buckets.get(ip);

  if (!entry || now > entry.reset) {
    buckets.set(ip, { count: 1, reset: now + WINDOW_MS });
    return NextResponse.next();
  }

  if (entry.count >= LIMIT) {
    return new NextResponse("Too many requests. Try again later.", { status: 429 });
  }

  entry.count += 1;
  return NextResponse.next();
}

export async function middleware(req: NextRequest) {
  const rateLimitResponse = rateLimitEmailSignIn(req);
  if (rateLimitResponse) {
    return rateLimitResponse;
  }

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
  matcher: ["/lp/:path*", "/admin/:path*", "/api/auth/signin/email"],
};
