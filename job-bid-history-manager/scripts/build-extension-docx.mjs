/**
 * Bundle shared DOCX export (docx npm + resume styles) for the Chrome extension service worker.
 * Output: apps/extension/vendor/docx-render.bundle.js
 */
import * as esbuild from "esbuild";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const entry = path.join(repoRoot, "scripts", "extension-docx-entry.ts");
const outfile = path.join(repoRoot, "apps", "extension", "vendor", "docx-render.bundle.js");
const webRoot = path.join(repoRoot, "apps", "web");

async function build() {
  fs.mkdirSync(path.dirname(outfile), { recursive: true });

  const bufferShim = path.join(repoRoot, "scripts", "buffer-shim.js");

  await esbuild.build({
    entryPoints: [entry],
    bundle: true,
    outfile,
    format: "iife",
    globalName: "JBHM_DOCX_RENDER",
    platform: "browser",
    target: ["chrome109"],
    sourcemap: false,
    minify: false,
    logLevel: "info",
    inject: [bufferShim],
    alias: {
      "@": webRoot,
    },
    define: {
      "process.env.NODE_ENV": '"production"',
    },
    banner: {
      js: "/* JBHM local DOCX render — built from apps/web/lib/resumes */",
    },
  });

  const stat = fs.statSync(outfile);
  console.log(`Built ${path.relative(repoRoot, outfile)} (${(stat.size / 1024).toFixed(0)} KB)`);
}

build().catch((err) => {
  console.error(err);
  process.exit(1);
});
