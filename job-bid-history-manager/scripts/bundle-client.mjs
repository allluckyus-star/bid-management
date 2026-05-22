/**
 * Client build: Vite UI + jbhm-gateway.exe + www/ (+ optional NSIS installer).
 * No Tauri / WebView2 — Chrome is the UI (Astrill-safe).
 */
import { execSync, spawnSync } from "child_process";
import {
  copyFileSync,
  cpSync,
  existsSync,
  mkdirSync,
  rmSync,
  statSync,
} from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const desktop = join(root, "apps/desktop");
const tauriDir = join(desktop, "src-tauri");
const bundleDir = join(desktop, "client-bundle");
const ext = process.platform === "win32" ? ".exe" : "";

function run(cmd, opts = {}) {
  console.log(`> ${cmd}`);
  execSync(cmd, { stdio: "inherit", cwd: opts.cwd ?? root, env: process.env, ...opts });
}

function hasMakensis() {
  const r = spawnSync("makensis", ["/VERSION"], { encoding: "utf8", shell: true });
  return r.status === 0;
}

/** Windows: release locks on client-bundle\\jbhm-gateway.exe */
function stopRunningGateway() {
  if (process.platform !== "win32") return;
  spawnSync("taskkill", ["/IM", "jbhm-gateway.exe", "/F"], {
    stdio: "ignore",
    shell: true,
  });
}

function stageClientBundle(exeSrc, distDir) {
  mkdirSync(bundleDir, { recursive: true });

  const wwwDir = join(bundleDir, "www");
  if (existsSync(wwwDir)) {
    try {
      rmSync(wwwDir, { recursive: true, force: true });
    } catch (err) {
      console.warn(`Could not clear www/ (${err.code ?? err.message}); merging copy.`);
    }
  }
  cpSync(distDir, wwwDir, { recursive: true });

  stopRunningGateway();
  const destExe = join(bundleDir, `jbhm-gateway${ext}`);
  try {
    copyFileSync(exeSrc, destExe);
  } catch (err) {
    if (err?.code === "EPERM" || err?.code === "EBUSY") {
      const alt = join(bundleDir, `jbhm-gateway.new${ext}`);
      copyFileSync(exeSrc, alt);
      console.warn("");
      console.warn(
        `Could not overwrite ${destExe} — file is in use (close jbhm-gateway.exe / Chrome using the app).`,
      );
      console.warn(`New build saved as: ${alt}`);
      console.warn("Stop the running gateway, delete the old exe, rename .new to jbhm-gateway.exe");
      console.warn("");
      return;
    }
    throw err;
  }
}

console.log("0/5 — icons from logo.png");
run("npm run generate:icons");

console.log("1/5 — build shared package");
run("npm run build -w @jbhm/shared");

console.log("2/5 — build client frontend");
run("npm run build:client", { cwd: desktop });

console.log("3/5 — build jbhm-gateway (release)");
run(
  "cargo build --release --features client --bin jbhm-gateway",
  {
    cwd: tauriDir,
    env: { ...process.env, CARGO_TARGET_DIR: join(tauriDir, "target") },
  }
);

const exeSrc = join(tauriDir, `target/release/jbhm-gateway${ext}`);
if (!existsSync(exeSrc)) {
  console.error(`Missing gateway binary: ${exeSrc}`);
  process.exit(1);
}

console.log("4/5 — stage client-bundle/");
stageClientBundle(exeSrc, join(desktop, "dist"));

if (!existsSync(join(bundleDir, "www/index.html"))) {
  console.error("www/index.html missing — Vite client build failed?");
  process.exit(1);
}

const installerScript = join(desktop, "installer/client.nsi");
if (process.platform === "win32" && existsSync(installerScript) && hasMakensis()) {
  console.log("Building NSIS installer...");
  run(`makensis /INPUTCHARSET UTF8 "${installerScript}"`, { cwd: desktop });
  const setup = join(
    bundleDir,
    "Job Bid History Manager (Client)_0.1.0_x64-setup.exe"
  );
  if (existsSync(setup)) {
    console.log(`Installer: ${setup} (${(statSync(setup).size / 1e6).toFixed(1)} MB)`);
  }
} else if (process.platform === "win32") {
  console.warn(
    "makensis not found — skipped installer. Teammates can zip client-bundle/ or install makensis."
  );
}

console.log(`\nClient ready:\n  ${join(bundleDir, `jbhm-gateway${ext}`)}\n  ${join(bundleDir, "www/")}`);
