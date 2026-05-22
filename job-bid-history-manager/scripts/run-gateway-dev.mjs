/**
 * Run jbhm-gateway against apps/desktop/dist (after npm run build:client in desktop).
 */
import { spawn } from "child_process";
import { existsSync } from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const tauriDir = join(root, "apps/desktop/src-tauri");
const dist = join(root, "apps/desktop/dist");

if (!existsSync(join(dist, "index.html"))) {
  console.error("Missing apps/desktop/dist — run: npm run build:client -w @jbhm/desktop");
  process.exit(1);
}

const env = {
  ...process.env,
  JBHM_WWW: dist,
  JBHM_CLIENT_CONSOLE: process.env.JBHM_CLIENT_CONSOLE ?? "1",
  CARGO_TARGET_DIR: join(tauriDir, "target"),
};

console.log("Starting jbhm-gateway (UI from dist/, opens browser at http://127.0.0.1:4832/)");
const child = spawn(
  "cargo",
  ["run", "--features", "client", "--bin", "jbhm-gateway"],
  { cwd: tauriDir, env, stdio: "inherit", shell: true }
);
child.on("exit", (code) => process.exit(code ?? 1));
