import { randomBytes, scryptSync, timingSafeEqual } from "crypto";

const HASH_PREFIX = "scrypt";
const KEY_LENGTH = 64;

export function createPasswordHash(password: string): string {
  const salt = randomBytes(16).toString("hex");
  const derived = scryptSync(password, salt, KEY_LENGTH).toString("hex");
  return `${HASH_PREFIX}:${salt}:${derived}`;
}

export function verifyPassword(password: string, storedHash: string | null | undefined): boolean {
  if (!storedHash) return false;

  const [prefix, salt, hash] = storedHash.split(":");
  if (prefix !== HASH_PREFIX || !salt || !hash) {
    return false;
  }

  const derivedBuffer = scryptSync(password, salt, KEY_LENGTH);
  const hashBuffer = Buffer.from(hash, "hex");

  if (derivedBuffer.length !== hashBuffer.length) {
    return false;
  }

  return timingSafeEqual(derivedBuffer, hashBuffer);
}
