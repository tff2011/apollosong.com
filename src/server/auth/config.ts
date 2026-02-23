import { PrismaAdapter } from "@auth/prisma-adapter";
import { type NextAuthConfig, type DefaultSession } from "next-auth";
import Credentials from "next-auth/providers/credentials";
import DiscordProvider from "next-auth/providers/discord";
import { env } from "~/env";
import {
  type AdminPermission,
  type AdminRole,
  ADMIN_PERMISSIONS,
} from "~/lib/admin/permissions";
import { db } from "~/server/db";
import { normalizeAdminUsername } from "~/server/auth/admin-access";
import { createPasswordHash, verifyPassword } from "~/server/auth/password";

declare module "next-auth" {
  interface Session extends DefaultSession {
    user: {
      id: string;
      adminRole: AdminRole;
      adminPermissions: AdminPermission[];
      adminUsername: string | null;
    } & DefaultSession["user"];
  }

  interface User {
    adminRole?: AdminRole;
    adminPermissions?: AdminPermission[];
    adminUsername?: string | null;
  }
}

const adminAuthUserSelect = {
  id: true,
  name: true,
  email: true,
  adminRole: true,
  adminPermissions: true,
  adminUsername: true,
  adminPasswordHash: true,
  adminEnabled: true,
} as const;

const permissionSet = new Set<string>(ADMIN_PERMISSIONS);
const SUPER_ADMIN_DEFAULT_NAME = "Thiago Felizola";

function toClientPermissions(values: string[]): AdminPermission[] {
  return values.filter((value): value is AdminPermission => permissionSet.has(value));
}

async function findAdminByUsernameOrEmail(rawUsername: string) {
  const normalized = normalizeAdminUsername(rawUsername);

  return db.user.findFirst({
    where: {
      adminEnabled: true,
      OR: [
        { adminUsername: normalized },
        { email: normalized },
      ],
    },
    select: adminAuthUserSelect,
  });
}

async function ensureBootstrapSuperAdmin(rawUsername: string, password: string) {
  const normalized = normalizeAdminUsername(rawUsername);
  const envAdminEmail = env.ADMIN_EMAIL ? normalizeAdminUsername(env.ADMIN_EMAIL) : null;
  const isBootstrapUsername = normalized === "admin" || (envAdminEmail ? normalized === envAdminEmail : false);

  if (!isBootstrapUsername || password !== env.ADMIN_PASSWORD) {
    return null;
  }

  const bootstrapEmail = envAdminEmail ?? "admin@apollosong.com";
  const existing = await db.user.findFirst({
    where: {
      OR: [{ email: bootstrapEmail }, { adminUsername: "admin" }],
    },
    select: adminAuthUserSelect,
  });

  if (existing) {
    const existingName = existing.name?.trim();
    const resolvedName =
      !existingName || existingName === "Administrador Geral" || existingName === "Admin"
        ? SUPER_ADMIN_DEFAULT_NAME
        : existing.name;

    const updated = await db.user.update({
      where: { id: existing.id },
      data: {
        email: existing.email ?? bootstrapEmail,
        name: resolvedName,
        adminEnabled: true,
        adminRole: "SUPER_ADMIN",
        adminUsername: existing.adminUsername ?? "admin",
        adminPasswordHash: existing.adminPasswordHash ?? createPasswordHash(password),
      },
      select: adminAuthUserSelect,
    });

    return updated;
  }

  return db.user.create({
    data: {
      name: SUPER_ADMIN_DEFAULT_NAME,
      email: bootstrapEmail,
      adminEnabled: true,
      adminRole: "SUPER_ADMIN",
      adminUsername: "admin",
      adminPermissions: [],
      adminPasswordHash: createPasswordHash(password),
    },
    select: adminAuthUserSelect,
  });
}

function toAuthUser(user: {
  id: string;
  name: string | null;
  email: string | null;
  adminRole: string;
  adminPermissions: string[];
  adminUsername: string | null;
}) {
  const fallbackName =
    user.adminRole === "SUPER_ADMIN"
      ? SUPER_ADMIN_DEFAULT_NAME
      : (user.adminUsername ?? "Admin");

  return {
    id: user.id,
    name: user.name ?? fallbackName,
    email: user.email ?? undefined,
    adminRole: user.adminRole as AdminRole,
    adminPermissions: toClientPermissions(user.adminPermissions),
    adminUsername: user.adminUsername,
  };
}

/**
 * Options for NextAuth.js used to configure adapters, providers, callbacks, etc.
 *
 * @see https://next-auth.js.org/configuration/options
 */
export const authConfig = {
  providers: [
    Credentials({
      name: "Admin Login",
      credentials: {
        username: { label: "Username", type: "text" },
        password: { label: "Password", type: "password" },
      },
      async authorize(credentials) {
        const username = credentials?.username as string | undefined;
        const password = credentials?.password as string | undefined;

        if (!username || !password) {
          return null;
        }

        const adminUser = await findAdminByUsernameOrEmail(username);
        if (adminUser?.adminPasswordHash && verifyPassword(password, adminUser.adminPasswordHash)) {
          return toAuthUser(adminUser);
        }

        const bootstrapUser = await ensureBootstrapSuperAdmin(username, password);
        if (bootstrapUser) {
          return toAuthUser(bootstrapUser);
        }

        return null;
      },
    }),
    ...(process.env.AUTH_DISCORD_ID ? [DiscordProvider] : []),
  ],
  adapter: PrismaAdapter(db),
  session: { strategy: "jwt" },
  callbacks: {
    session: async ({ session, token }) => {
      const userId = token.sub;

      if (!userId) {
        return session;
      }

      const currentAdmin = await db.user.findUnique({
        where: { id: userId },
        select: {
          adminRole: true,
          adminPermissions: true,
          adminUsername: true,
        },
      });

      return {
        ...session,
        user: {
          ...session.user,
          id: userId,
          adminRole: (currentAdmin?.adminRole ?? "STAFF") as AdminRole,
          adminPermissions: toClientPermissions(
            (currentAdmin?.adminPermissions as unknown as string[]) ?? []
          ),
          adminUsername: currentAdmin?.adminUsername ?? null,
        },
      };
    },
  },
} satisfies NextAuthConfig;
