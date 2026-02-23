import { env } from "~/env";
import { PrismaClient } from "@prisma/client";

function withDevelopmentPoolTuning(databaseUrl: string) {
  if (env.NODE_ENV !== "development") return databaseUrl;

  try {
    const parsedUrl = new URL(databaseUrl);

    if (!parsedUrl.searchParams.has("connection_limit")) {
      parsedUrl.searchParams.set(
        "connection_limit",
        process.env.PRISMA_CONNECTION_LIMIT ?? "5",
      );
    }

    if (!parsedUrl.searchParams.has("pool_timeout")) {
      parsedUrl.searchParams.set(
        "pool_timeout",
        process.env.PRISMA_POOL_TIMEOUT ?? "20",
      );
    }

    return parsedUrl.toString();
  } catch {
    return databaseUrl;
  }
}

const createPrismaClient = () =>
  new PrismaClient({
    datasources: {
      db: {
        url: withDevelopmentPoolTuning(env.DATABASE_URL),
      },
    },
    log:
      env.NODE_ENV === "development" ? ["query", "error", "warn"] : ["error"],
  });

const globalForPrisma = globalThis as unknown as {
  prisma: ReturnType<typeof createPrismaClient> | undefined;
};

export const db = globalForPrisma.prisma ?? createPrismaClient();

if (env.NODE_ENV !== "production") globalForPrisma.prisma = db;
