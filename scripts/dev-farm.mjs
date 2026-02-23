#!/usr/bin/env node
/**
 * Start a 4-instance local dev "farm" for Suno automation:
 * - 1x velite watcher
 * - 4x next dev (A/B/C/D) with per-account env files
 *
 * This is cross-platform (Windows/macOS/Linux).
 */

import { spawn } from "node:child_process";
import { existsSync } from "node:fs";
import { mkdir } from "node:fs/promises";

function resolveCmd(cmd) {
  if (process.platform !== "win32") return cmd;
  if (cmd === "npm") return "npm.cmd";
  if (cmd === "npx") return "npx.cmd";
  return cmd;
}

function prefixStream(stream, prefix) {
  let buf = "";
  stream.on("data", (chunk) => {
    buf += chunk.toString("utf8");
    const parts = buf.split(/\r?\n/);
    buf = parts.pop() ?? "";
    for (const line of parts) {
      if (line.length === 0) {
        process.stdout.write("\n");
      } else {
        process.stdout.write(`[${prefix}] ${line}\n`);
      }
    }
  });
  stream.on("end", () => {
    if (buf.length > 0) process.stdout.write(`[${prefix}] ${buf}\n`);
  });
}

function spawnProc(label, cmd, args, opts = {}) {
  const child = spawn(cmd, args, {
    stdio: ["inherit", "pipe", "pipe"],
    ...opts,
  });

  if (child.stdout) prefixStream(child.stdout, label);
  if (child.stderr) prefixStream(child.stderr, label);

  child.on("exit", (code, signal) => {
    const suffix = signal ? `signal=${signal}` : `code=${code}`;
    process.stdout.write(`[${label}] exited (${suffix})\n`);
  });

  child.on("error", (err) => {
    process.stdout.write(`[${label}] failed to start: ${err instanceof Error ? err.message : String(err)}\n`);
  });

  return child;
}

const envFiles = [
  { label: "A", file: ".env.suno-a", port: 3000 },
  { label: "B", file: ".env.suno-b", port: 3001 },
  { label: "C", file: ".env.suno-c", port: 3002 },
  { label: "D", file: ".env.suno-d", port: 3003 },
];

for (const entry of envFiles) {
  if (!existsSync(entry.file)) {
    console.error(`Missing ${entry.file}. Create it first (see docs/suno-trocar-conta.md).`);
    process.exit(1);
  }
}

// Ensure ./tmp exists for SUNO_AUTH_STATE_TMP_PATH and other temp artifacts (cross-platform).
await mkdir("tmp", { recursive: true }).catch(() => {});

console.log("Starting dev farm:");
for (const entry of envFiles) {
  console.log(`- ${entry.label}: http://localhost:${entry.port}`);
}

const children = [];

// 1) Velite watcher (once)
children.push(
  spawnProc("VELITE", resolveCmd("npm"), ["run", "dev:velite"], {
    env: { ...process.env },
  })
);

// 2) Next dev instances
for (const entry of envFiles) {
  // Use the existing cross-platform helper to load the env file for each instance.
  children.push(
    spawnProc(
      entry.label,
      resolveCmd("node"),
      ["scripts/run-with-env.mjs", "--env", entry.file, "--", "npm", "run", "dev:next"],
      { env: { ...process.env } }
    )
  );
}

let shuttingDown = false;
async function shutdown() {
  if (shuttingDown) return;
  shuttingDown = true;
  process.stdout.write("Shutting down dev farm...\n");

  for (const child of children) {
    try {
      if (!child.killed) child.kill("SIGTERM");
    } catch {
      // ignore
    }
  }

  // Best-effort hard kill after a grace period.
  await new Promise((r) => setTimeout(r, 2500));
  for (const child of children) {
    try {
      if (!child.killed) child.kill("SIGKILL");
    } catch {
      // ignore
    }
  }
}

process.on("SIGINT", () => {
  shutdown().finally(() => process.exit(0));
});
process.on("SIGTERM", () => {
  shutdown().finally(() => process.exit(0));
});

