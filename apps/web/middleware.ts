import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { getToken } from "next-auth/jwt";
import { isAdmin } from "@/lib/is-admin";

const AUTH_SECRET = process.env.NEXTAUTH_SECRET || "development-secret";
const RATE_LIMIT_WINDOW_MS = 15 * 60 * 1000;
const RATE_LIMIT_MAX = 3;

type RateLimitBucket = {
  count: number;
  resetAt: number;
};

const globalRateLimit = globalThis as unknown as {
  __jbvRateLimit?: Map<string, RateLimitBucket>;
};

const rateLimitBuckets =
  globalRateLimit.__jbvRateLimit ?? new Map<string, RateLimitBucket>();

if (process.env.NODE_ENV !== "production") {
  globalRateLimit.__jbvRateLimit = rateLimitBuckets;
}

async function ensureAuthenticated(req: NextRequest) {
  const token = await getToken({ req, secret: AUTH_SECRET });
  return token;
}

function getClientIp(req: NextRequest): string {
  const forwarded = req.headers.get("x-forwarded-for");
  if (forwarded) {
    const [first] = forwarded.split(",");
    if (first) return first.trim();
  }
  return req.ip || "unknown";
}

function applyRateLimit(req: NextRequest): NextResponse | null {
  const ip = getClientIp(req);
  const now = Date.now();
  const bucket = rateLimitBuckets.get(ip);

  if (!bucket || now > bucket.resetAt) {
    rateLimitBuckets.set(ip, { count: 1, resetAt: now + RATE_LIMIT_WINDOW_MS });
    return null;
  }

  if (bucket.count >= RATE_LIMIT_MAX) {
    const retryAfter = Math.max(1, Math.ceil((bucket.resetAt - now) / 1000));
    return new NextResponse("Too many requests. Try again later.", {
      status: 429,
      headers: { "Retry-After": retryAfter.toString() },
    });
  }

  bucket.count += 1;
  return null;
}

function buildSignInRedirect(req: NextRequest) {
  const signInUrl = new URL("/auth/signin", req.nextUrl.origin);
  signInUrl.searchParams.set("callbackUrl", req.nextUrl.href);
  return NextResponse.redirect(signInUrl);
}

export async function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;

  if (pathname === "/api/auth/signin/email" && req.method === "POST") {
    const limited = applyRateLimit(req);
    if (limited) {
      return limited;
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
