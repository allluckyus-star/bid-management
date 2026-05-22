/**
 * Generate extension icons from repo root logo.png.
 * Run: npm run generate:icons
 */
import { existsSync, mkdirSync } from "fs";
import { dirname, join } from "path";
import { fileURLToPath } from "url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const logoSrc = join(root, "logo.png");
const squarePath = join(root, "build", "logo-square.png");
const extIconsDir = join(root, "apps/extension/icons");
const webPublic = join(root, "apps/web/public");

async function loadSharp() {
  try {
    return (await import("sharp")).default;
  } catch {
    console.error("Install sharp: npm install -D sharp");
    process.exit(1);
  }
}

async function makeSquareLogo(sharp, size = 1024) {
  mkdirSync(join(root, "build"), { recursive: true });
  await sharp(logoSrc)
    .trim({ threshold: 20 })
    .resize(size, size, { fit: "cover", position: "centre" })
    .png()
    .toFile(squarePath);
  console.log(`Square logo: ${squarePath} (${size}×${size})`);
}

async function writePng(sharp, src, dest, size) {
  mkdirSync(dirname(dest), { recursive: true });
  await sharp(src).resize(size, size).png().toFile(dest);
  console.log(`  ${dest} (${size}px)`);
}

async function main() {
  if (!existsSync(logoSrc)) {
    console.error(`Missing ${logoSrc}`);
    process.exit(1);
  }

  const sharp = await loadSharp();
  await makeSquareLogo(sharp, 1024);

  console.log("Extension icons…");
  mkdirSync(extIconsDir, { recursive: true });
  for (const size of [16, 32, 48, 128]) {
    await writePng(sharp, squarePath, join(extIconsDir, `icon${size}.png`), size);
  }

  console.log("Web public icons…");
  mkdirSync(webPublic, { recursive: true });
  await writePng(sharp, squarePath, join(webPublic, "logo.png"), 256);
  await writePng(sharp, squarePath, join(webPublic, "favicon.png"), 32);

  console.log("Done. Reload extension in Chrome after build.");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
