import IORedis from "ioredis";

function getRedisUrl(): string {
    const url = process.env.REDIS_URL;
    if (!url) {
        throw new Error("REDIS_URL environment variable is required");
    }
    return url;
}

const REDIS_URL = getRedisUrl();

type RedisGlobal = typeof globalThis & {
    __apolloRedis?: IORedis;
};

const globalForRedis = globalThis as RedisGlobal;

export const redisConnection =
    globalForRedis.__apolloRedis ??
    new IORedis(REDIS_URL, {
        maxRetriesPerRequest: null,
    });

if (process.env.NODE_ENV !== "production") {
    globalForRedis.__apolloRedis = redisConnection;
}

export function createRedisConnection() {
    return new IORedis(REDIS_URL, {
        maxRetriesPerRequest: null,
    });
}
