import { type DefaultSession } from "next-auth";

declare module "next-auth" {
  interface Session {
    user?: DefaultSession["user"] & {
      role?: "admin" | "lp" | "partner";
    };
  }

  interface User {
    role?: "admin" | "lp" | "partner";
  }
}

declare module "next-auth/jwt" {
  interface JWT {
    role?: "admin" | "lp" | "partner";
  }
}
