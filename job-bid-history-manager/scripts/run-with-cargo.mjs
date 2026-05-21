/**
 * Prepends ~/.cargo/bin to PATH then runs a command.
 * npm on Windows invokes cmd.exe, which often misses Rust from Git Bash PATH.
 */
import { spawnSync } from "node:child_process";
import path from "node:path";
import os from "node:os";

const cargoBin = path.join(os.homedir(), ".cargo", "bin");
const sep = process.platform === "win32" ? ";" : ":";
const pathKey = process.platform === "win32" ? "Path" : "PATH";

const env = { ...process.env };
const current = env[pathKey] ?? env.PATH ?? "";
if (!current.split(sep).some((p) => p.replace(/\\/g, "/").toLowerCase() === cargoBin.replace(/\\/g, "/").toLowerCase())) {
  env[pathKey] = `${cargoBin}${sep}${current}`;
  env.PATH = env[pathKey];
}

const [command, ...args] = process.argv.slice(2);
if (!command) {
  console.error("Usage: node scripts/run-with-cargo.mjs <command> [args...]");
  process.exit(1);
}

const cargoExe = path.join(cargoBin, process.platform === "win32" ? "cargo.exe" : "cargo");
const check = spawnSync(cargoExe, ["--version"], { env, stdio: "pipe", encoding: "utf8" });
if (check.status !== 0) {
  console.error(`Rust cargo not found at ${cargoBin}`);
  console.error("Install from https://rustup.rs/ then restart the terminal.");
  if (check.stderr) console.error(check.stderr);
  process.exit(1);
}

const result = spawnSync(command, args, {
  env,
  stdio: "inherit",
  shell: process.platform === "win32",
});

process.exit(result.status ?? 1);
