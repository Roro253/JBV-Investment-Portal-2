import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { getToken } from "next-auth/jwt";
import { isAdmin } from "@/lib/is-admin";

const AUTH_SECRET = process.env.NEXTAUTH_SECRET || "development-secret";

const RATE_LIMIT_WINDOW_MS = 15 * 60 * 1000;
const RATE_LIMIT_MAX = 3;

type RateLimitBucket = { count: number; reset: number };

// In production, replace this with a shared store (e.g. Redis/Upstash).
const inMemoryBuckets = new Map<string, RateLimitBucket>();

function rateLimitRequest(ip: string, now: number) {
  const entry = inMemoryBuckets.get(ip);
  if (!entry || now > entry.reset) {
    inMemoryBuckets.set(ip, { count: 1, reset: now + RATE_LIMIT_WINDOW_MS });
    return true;
  }

  if (entry.count >= RATE_LIMIT_MAX) {
    return false;
  }

  entry.count += 1;
  return true;
}

async function ensureAuthenticated(req: NextRequest) {
  const token = await getToken({ req, secret: AUTH_SECRET });
  return token;
}

function buildSignInRedirect(req: NextRequest) {
  const signInUrl = new URL("/auth/signin", req.nextUrl.origin);
  signInUrl.searchParams.set("callbackUrl", req.nextUrl.href);
  return NextResponse.redirect(signInUrl);
}

export async function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;

  if (pathname === "/api/auth/signin/email" && req.method === "POST") {
    const ipHeader = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim();
    const ip = ipHeader || req.ip || "unknown";
    const now = Date.now();
    const allowed = rateLimitRequest(ip, now);
    if (!allowed) {
      return new NextResponse("Too many requests. Try again later.", { status: 429 });
    }
    return NextResponse.next();
  }

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
