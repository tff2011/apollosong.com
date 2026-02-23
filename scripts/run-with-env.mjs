#!/usr/bin/env node
/**
 * Cross-platform helper to run a command with variables loaded from a .env-like file.
 *
 * Usage:
 *   node scripts/run-with-env.mjs --env .env.suno-a -- npm run dev:next
 */

import { spawn } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";

function stripOuterQuotes(value) {
  if (value.length < 2) return value;
  const first = value[0];
  const last = value[value.length - 1];
  if ((first === "\"" && last === "\"") || (first === "'" && last === "'")) {
    return value.slice(1, -1);
  }
  return value;
}

function parseEnvFile(filePath) {
  const abs = path.resolve(process.cwd(), filePath);
  if (!existsSync(abs)) {
    throw new Error(`Env file not found: ${filePath}`);
  }

  const content = readFileSync(abs, "utf8");
  const env = {};

  for (const rawLine of content.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith("#")) continue;

    const idx = line.indexOf("=");
    if (idx === -1) continue;

    const key = line.slice(0, idx).trim();
    let value = line.slice(idx + 1).trim();
    value = stripOuterQuotes(value);

    if (key) env[key] = value;
  }

  return env;
}

function resolveCmd(cmd) {
  if (process.platform !== "win32") return cmd;
  if (cmd === "npm") return "npm.cmd";
  if (cmd === "npx") return "npx.cmd";
  return cmd;
}

function usage() {
  console.error("Usage: node scripts/run-with-env.mjs --env <file> -- <command> [args...]");
}

const args = process.argv.slice(2);
const sep = args.indexOf("--");
if (sep === -1) {
  usage();
  process.exit(2);
}

let envFile = null;
for (let i = 0; i < sep; i++) {
  if (args[i] === "--env") {
    envFile = args[i + 1] ?? null;
  }
}

if (!envFile) {
  usage();
  process.exit(2);
}

const cmdArgs = args.slice(sep + 1);
const cmd = cmdArgs.shift();
if (!cmd) {
  usage();
  process.exit(2);
}

let fileEnv = {};
try {
  fileEnv = parseEnvFile(envFile);
} catch (err) {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
}

const child = spawn(resolveCmd(cmd), cmdArgs, {
  stdio: "inherit",
  env: {
    ...process.env,
    ...fileEnv,
  },
});

child.on("exit", (code, signal) => {
  if (typeof code === "number") process.exit(code);
  if (signal) process.exit(1);
  process.exit(0);
});

child.on("error", (err) => {
  console.error(err);
  process.exit(1);
});

