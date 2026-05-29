/**
 * Zip apps/extension for "Load unpacked" install (Chrome Web Store alternative).
 * Output: apps/web/public/downloads/job-bid-capture-extension.zip
 *
 * Groq keys are embedded when available from (in order):
 * 1. apps/extension/groq-keys.local.js (local dev)
 * 2. Netlify/CI env: GROQ_KEYS (comma-separated gsk_… keys)
 * Otherwise the zip ships groq-keys.local.example.js — add keys after unzip.
 */
import archiver from "archiver";
import fs from "fs";
import os from "os";
import path from "path";
import { fileURLToPath } from "url";
import { createWriteStream } from "fs";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const extensionDir = path.join(repoRoot, "apps", "extension");
const outDir = path.join(repoRoot, "apps", "web", "public", "downloads");
const zipName = "job-bid-capture-extension.zip";
const zipPath = path.join(outDir, zipName);
const folderName = "job-bid-capture-extension";

const SKIP = new Set(["README.md"]);

function readManifestVersion(dir) {
  const raw = fs.readFileSync(path.join(dir, "manifest.json"), "utf8");
  const manifest = JSON.parse(raw);
  return manifest.version ?? "0.0.0";
}

/** Extract gsk_… keys from groq-keys.local.js source. */
function parseGroqKeysFromSource(content) {
  return [...String(content).matchAll(/"(gsk_[^"]+)"/g)]
    .map((m) => m[1].trim())
    .filter(Boolean);
}

function isGroqKey(value) {
  return typeof value === "string" && value.trim().startsWith("gsk_");
}

/** Read Groq keys from Netlify/CI — prefer GROQ_KEYS (comma-separated, any count). */
function loadGroqKeysFromEnv() {
  if (process.env.GROQ_KEYS) {
    const keys = process.env.GROQ_KEYS.split(",")
      .map((k) => k.trim())
      .filter(isGroqKey);
    if (keys.length) return keys;
  }

  if (process.env.GROQ_KEYS_JSON) {
    try {
      const parsed = JSON.parse(process.env.GROQ_KEYS_JSON);
      if (Array.isArray(parsed)) {
        const keys = parsed.map((k) => String(k).trim()).filter(isGroqKey);
        if (keys.length) return keys;
      }
    } catch {
      /* invalid JSON */
    }
  }

  const numbered = [];
  for (let i = 1; i <= 99; i++) {
    const key = process.env[`GROQ_KEY_${i}`]?.trim();
    if (!key) break;
    if (isGroqKey(key)) numbered.push(key);
  }
  return numbered;
}

function loadGroqKeysForPack() {
  const localPath = path.join(extensionDir, "groq-keys.local.js");
  if (fs.existsSync(localPath)) {
    const keys = parseGroqKeysFromSource(fs.readFileSync(localPath, "utf8"));
    if (keys.length) return { keys, source: "groq-keys.local.js" };
  }

  const envKeys = loadGroqKeysFromEnv();
  if (envKeys.length) return { keys: envKeys, source: "environment variables" };

  return { keys: [], source: null };
}

function copyExtensionToStaging(stagingRoot) {
  fs.mkdirSync(stagingRoot, { recursive: true });
  for (const name of fs.readdirSync(extensionDir)) {
    if (SKIP.has(name)) continue;
    const src = path.join(extensionDir, name);
    const dest = path.join(stagingRoot, name);
    fs.cpSync(src, dest, { recursive: true });
  }
}

function writePackedGroqKeys(stagingRoot, keys) {
  const groqKeysPath = path.join(stagingRoot, "groq-keys.js");
  const template = fs.readFileSync(groqKeysPath, "utf8");
  const poolJson = JSON.stringify(keys, null, 2);
  const updated = template.replace(/var GROQ_KEY_POOL = \[\];/, `var GROQ_KEY_POOL = ${poolJson};`);
  fs.writeFileSync(groqKeysPath, updated);

  const localContent = [
    "/** Groq keys embedded at pack time — gitignored in source repo. */",
    `GROQ_KEY_POOL = ${poolJson};`,
    "",
  ].join("\n");
  fs.writeFileSync(path.join(stagingRoot, "groq-keys.local.js"), localContent);
}

function writeGroqKeysPlaceholder(stagingRoot) {
  const examplePath = path.join(extensionDir, "groq-keys.local.example.js");
  const dest = path.join(stagingRoot, "groq-keys.local.js");
  if (fs.existsSync(examplePath)) {
    fs.copyFileSync(examplePath, dest);
  } else {
    fs.writeFileSync(dest, 'GROQ_KEY_POOL = [\n  "gsk_your_key_here",\n];\n');
  }
}

function removeDirSafe(dir) {
  if (fs.existsSync(dir)) fs.rmSync(dir, { recursive: true, force: true });
}

async function zipDirectory(sourceDir, destZipPath, zipRootName) {
  await new Promise((resolve, reject) => {
    const output = createWriteStream(destZipPath);
    const archive = archiver("zip", { zlib: { level: 9 } });

    output.on("close", resolve);
    archive.on("error", reject);
    output.on("error", reject);

    archive.pipe(output);
    archive.directory(sourceDir, zipRootName);
    archive.finalize();
  });
}

async function pack() {
  if (!fs.existsSync(extensionDir)) {
    console.error("Extension folder not found:", extensionDir);
    process.exit(1);
  }

  const { keys, source } = loadGroqKeysForPack();
  const stagingParent = fs.mkdtempSync(path.join(os.tmpdir(), "jbhm-ext-pack-"));
  const stagingRoot = path.join(stagingParent, folderName);

  try {
    copyExtensionToStaging(stagingRoot);

    if (keys.length) {
      writePackedGroqKeys(stagingRoot, keys);
      console.log(`Groq: embedded ${keys.length} key(s) from ${source} into zip.`);
    } else {
      writeGroqKeysPlaceholder(stagingRoot);
      console.warn(
        "Groq: no keys found (groq-keys.local.js or GROQ_KEYS env) — zip includes placeholder.",
      );
      console.warn(
        "      Set GROQ_KEYS in Netlify (comma-separated gsk_… keys), or add groq-keys.local.js locally.",
      );
    }

    fs.mkdirSync(outDir, { recursive: true });
    await zipDirectory(stagingRoot, zipPath, folderName);

    const version = readManifestVersion(stagingRoot);
    const meta = {
      version,
      filename: zipName,
      folderName,
      builtAt: new Date().toISOString(),
      groqKeysIncluded: keys.length > 0,
      groqKeyCount: keys.length,
    };
    fs.writeFileSync(path.join(outDir, "extension-meta.json"), JSON.stringify(meta, null, 2));

    console.log(`Packed ${zipName} (v${version}) → ${zipPath}`);
  } finally {
    removeDirSafe(stagingParent);
  }
}

pack().catch((err) => {
  console.error(err);
  process.exit(1);
});
