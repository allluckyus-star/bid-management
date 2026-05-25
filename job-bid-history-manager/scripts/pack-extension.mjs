/**
 * Zip apps/extension for "Load unpacked" install (Chrome Web Store alternative).
 * Output: apps/web/public/downloads/job-bid-capture-extension.zip
 */
import archiver from "archiver";
import fs from "fs";
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

function readManifestVersion() {
  const raw = fs.readFileSync(path.join(extensionDir, "manifest.json"), "utf8");
  const manifest = JSON.parse(raw);
  return manifest.version ?? "0.0.0";
}

async function pack() {
  if (!fs.existsSync(extensionDir)) {
    console.error("Extension folder not found:", extensionDir);
    process.exit(1);
  }

  fs.mkdirSync(outDir, { recursive: true });

  await new Promise((resolve, reject) => {
    const output = createWriteStream(zipPath);
    const archive = archiver("zip", { zlib: { level: 9 } });

    output.on("close", resolve);
    archive.on("error", reject);
    output.on("error", reject);

    archive.pipe(output);
    archive.directory(extensionDir, folderName, (entry) => {
      const name = entry.name.replace(/\\/g, "/");
      const base = path.posix.basename(name);
      if (SKIP.has(base)) return false;
      return entry;
    });
    archive.finalize();
  });

  const version = readManifestVersion();
  const meta = {
    version,
    filename: zipName,
    folderName,
    builtAt: new Date().toISOString(),
  };
  fs.writeFileSync(
    path.join(outDir, "extension-meta.json"),
    JSON.stringify(meta, null, 2),
  );

  console.log(`Packed ${zipName} (v${version}) → ${zipPath}`);
}

pack().catch((err) => {
  console.error(err);
  process.exit(1);
});
