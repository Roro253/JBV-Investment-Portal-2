import { randomUUID } from "node:crypto";
import type {
  Adapter,
  AdapterAccount,
  AdapterSession,
  AdapterUser,
  VerificationToken,
} from "next-auth/adapters";

function normalizeEmail(value: string | null | undefined): string | null {
  if (typeof value !== "string") {
    return null;
  }
  const trimmed = value.trim();
  if (!trimmed) {
    return null;
  }
  return trimmed.toLowerCase();
}

type StoredUser = Omit<AdapterUser, "email"> & { id: string; email: string | null };
type StoredSession = AdapterSession;
type StoredAccount = AdapterAccount;

type AuthStore = {
  users: Map<string, StoredUser>;
  usersByEmail: Map<string, string>;
  accounts: Map<string, StoredAccount>;
  sessions: Map<string, StoredSession>;
  verificationTokens: Map<string, VerificationToken>;
};

declare global {
  // eslint-disable-next-line no-var
  var __JBV_AUTH_STORE__: AuthStore | undefined;
}

function getStore(): AuthStore {
  if (!globalThis.__JBV_AUTH_STORE__) {
    globalThis.__JBV_AUTH_STORE__ = {
      users: new Map(),
      usersByEmail: new Map(),
      accounts: new Map(),
      sessions: new Map(),
      verificationTokens: new Map(),
    };
  }
  return globalThis.__JBV_AUTH_STORE__;
}

function cloneUser(user: StoredUser): AdapterUser {
  return {
    ...user,
    email: user.email ?? "",
  };
}

function cloneSession(session: StoredSession): AdapterSession {
  return { ...session };
}

function cloneVerificationToken(token: VerificationToken): VerificationToken {
  return {
    identifier: token.identifier,
    token: token.token,
    expires: new Date(token.expires),
  };
}

function cleanupExpiredVerificationTokens(store: AuthStore) {
  const now = Date.now();
  for (const [key, token] of store.verificationTokens.entries()) {
    const expires = token.expires instanceof Date ? token.expires.getTime() : new Date(token.expires).getTime();
    if (Number.isFinite(expires) && expires <= now) {
      store.verificationTokens.delete(key);
    }
  }
}

function buildAccountKey(provider: string, providerAccountId: string) {
  return `${provider}:${providerAccountId}`;
}

function buildVerificationTokenKey(identifier: string, token: string) {
  return `${identifier}:${token}`;
}

export function createInMemoryAuthAdapter(): Adapter {
  const store = getStore();

  return {
    async createUser(user: Omit<AdapterUser, "id">) {
      const normalizedEmail = normalizeEmail(user.email);
      if (normalizedEmail) {
        const existingId = store.usersByEmail.get(normalizedEmail);
        if (existingId) {
          const existingUser = store.users.get(existingId);
          if (existingUser) {
            return cloneUser(existingUser);
          }
        }
      }

      const id = randomUUID();
      const stored: StoredUser = {
        id,
        name: user.name ?? null,
        email: normalizedEmail,
        image: user.image ?? null,
        emailVerified: user.emailVerified ?? null,
      };

      store.users.set(id, stored);
      if (normalizedEmail) {
        store.usersByEmail.set(normalizedEmail, id);
      }

      return cloneUser(stored);
    },

    async getUser(id: string) {
      const user = store.users.get(id);
      return user ? cloneUser(user) : null;
    },

    async getUserByEmail(email: string) {
      const normalizedEmail = normalizeEmail(email);
      if (!normalizedEmail) {
        return null;
      }
      const id = store.usersByEmail.get(normalizedEmail);
      if (!id) {
        return null;
      }
      const user = store.users.get(id);
      return user ? cloneUser(user) : null;
    },

    async getUserByAccount({ provider, providerAccountId }: Pick<AdapterAccount, "provider" | "providerAccountId">) {
      const account = store.accounts.get(buildAccountKey(provider, providerAccountId));
      if (!account) {
        return null;
      }
      const user = store.users.get(account.userId);
      return user ? cloneUser(user) : null;
    },

    async updateUser(user: Partial<AdapterUser> & Pick<AdapterUser, "id">) {
      const existing = store.users.get(user.id);
      if (!existing) {
        const normalizedNewEmail = normalizeEmail(user.email ?? undefined);
        const created: StoredUser = {
          id: user.id,
          name: user.name ?? null,
          email: normalizedNewEmail,
          image: user.image ?? null,
          emailVerified: user.emailVerified ?? null,
        };
        store.users.set(user.id, created);
        if (normalizedNewEmail) {
          store.usersByEmail.set(normalizedNewEmail, user.id);
        }
        return cloneUser(created);
      }

      const normalizedEmail = normalizeEmail(user.email ?? existing.email);
      if (existing.email && existing.email !== normalizedEmail) {
        store.usersByEmail.delete(existing.email);
      }

      const updated: StoredUser = {
        id: existing.id,
        name: user.name ?? existing.name ?? null,
        email: normalizedEmail,
        image: user.image ?? existing.image ?? null,
        emailVerified: user.emailVerified ?? existing.emailVerified ?? null,
      };

      store.users.set(updated.id, updated);
      if (normalizedEmail) {
        store.usersByEmail.set(normalizedEmail, updated.id);
      }

      return cloneUser(updated);
    },

    async deleteUser(id: string) {
      const existing = store.users.get(id);
      if (!existing) {
        return null;
      }

      store.users.delete(id);
      if (existing.email) {
        store.usersByEmail.delete(existing.email);
      }

      for (const [key, account] of store.accounts.entries()) {
        if (account.userId === id) {
          store.accounts.delete(key);
        }
      }

      for (const [key, session] of store.sessions.entries()) {
        if (session.userId === id) {
          store.sessions.delete(key);
        }
      }

      return cloneUser(existing);
    },

    async linkAccount(account: AdapterAccount) {
      const key = buildAccountKey(account.provider, account.providerAccountId);
      const stored: StoredAccount = { ...account };
      store.accounts.set(key, stored);
      return { ...stored };
    },

    async unlinkAccount({ provider, providerAccountId }: Pick<AdapterAccount, "provider" | "providerAccountId">) {
      const key = buildAccountKey(provider, providerAccountId);
      store.accounts.delete(key);
    },

    async createSession(session: AdapterSession) {
      const stored: StoredSession = { ...session };
      store.sessions.set(session.sessionToken, stored);
      return { ...stored };
    },

    async getSessionAndUser(sessionToken: string) {
      const session = store.sessions.get(sessionToken);
      if (!session) {
        return null;
      }
      const user = store.users.get(session.userId);
      if (!user) {
        return null;
      }
      return {
        session: cloneSession(session),
        user: cloneUser(user),
      };
    },

    async updateSession(session: Partial<AdapterSession> & Pick<AdapterSession, "sessionToken">) {
      const existing = store.sessions.get(session.sessionToken);
      if (!existing) {
        if (!session.userId || !session.expires) {
          return null;
        }
        const stored: StoredSession = {
          sessionToken: session.sessionToken,
          userId: session.userId,
          expires: session.expires,
        };
        store.sessions.set(session.sessionToken, stored);
        return cloneSession(stored);
      }

      const updated: StoredSession = {
        sessionToken: session.sessionToken,
        userId: session.userId ?? existing.userId,
        expires: session.expires ?? existing.expires,
      };
      store.sessions.set(session.sessionToken, updated);
      return cloneSession(updated);
    },

    async deleteSession(sessionToken: string) {
      store.sessions.delete(sessionToken);
    },

    async createVerificationToken(verificationToken: VerificationToken) {
      cleanupExpiredVerificationTokens(store);
      for (const [key, existing] of store.verificationTokens.entries()) {
        if (existing.identifier === verificationToken.identifier) {
          store.verificationTokens.delete(key);
        }
      }
      const key = buildVerificationTokenKey(verificationToken.identifier, verificationToken.token);
      const stored: VerificationToken = {
        identifier: verificationToken.identifier,
        token: verificationToken.token,
        expires: new Date(verificationToken.expires),
      };
      store.verificationTokens.set(key, stored);
      return cloneVerificationToken(stored);
    },

    async useVerificationToken({ identifier, token }: { identifier: string; token: string }) {
      cleanupExpiredVerificationTokens(store);
      const key = buildVerificationTokenKey(identifier, token);
      const stored = store.verificationTokens.get(key);
      if (!stored) {
        return null;
      }
      store.verificationTokens.delete(key);
      if (stored.expires.getTime() <= Date.now()) {
        return null;
      }
      return cloneVerificationToken(stored);
    },
  } satisfies Adapter;
}

export default createInMemoryAuthAdapter;
