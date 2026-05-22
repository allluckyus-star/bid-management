/**
 * Generate app/extension/web icons from repo root logo.png.
 * Run: npm run generate:icons
 */
import { execSync } from "child_process";
import { existsSync, mkdirSync } from "fs";
import { dirname, join } from "path";
import { fileURLToPath } from "url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const logoSrc = join(root, "logo.png");
const squarePath = join(root, "build", "logo-square.png");
const extIconsDir = join(root, "apps/extension/icons");
const desktopPublic = join(root, "apps/desktop/public");
const tauriIconsDir = join(root, "apps/desktop/src-tauri/icons");

async function loadSharp() {
  try {
    return (await import("sharp")).default;
  } catch {
    console.error("Install sharp: npm install -D sharp");
    process.exit(1);
  }
}

/**
 * Trim empty edges, center-crop to square, fill canvas — feather reads larger in toolbar icons.
 */
async function makeSquareLogo(sharp, size = 1024) {
  mkdirSync(join(root, "build"), { recursive: true });
  await sharp(logoSrc)
    .trim({ threshold: 20 })
    .resize(size, size, { fit: "cover", position: "centre" })
    .png()
    .toFile(squarePath);
  console.log(`Square logo (trim + crop + fill): ${squarePath} (${size}×${size})`);
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
  await writePng(sharp, squarePath, join(extIconsDir, "icon16.png"), 16);
  await writePng(sharp, squarePath, join(extIconsDir, "icon32.png"), 32);
  await writePng(sharp, squarePath, join(extIconsDir, "icon48.png"), 48);
  await writePng(sharp, squarePath, join(extIconsDir, "icon128.png"), 128);

  console.log("Desktop web (public/)…");
  mkdirSync(desktopPublic, { recursive: true });
  await writePng(sharp, squarePath, join(desktopPublic, "logo.png"), 256);
  await writePng(sharp, squarePath, join(desktopPublic, "favicon.png"), 32);
  await writePng(sharp, squarePath, join(desktopPublic, "apple-touch-icon.png"), 180);
  await writePng(sharp, squarePath, join(desktopPublic, "icon-192.png"), 192);
  await writePng(sharp, squarePath, join(desktopPublic, "icon-512.png"), 512);

  console.log("Tauri bundle icons…");
  try {
    execSync(`npx tauri icon "${squarePath}" -o "${tauriIconsDir}"`, {
      cwd: join(root, "apps/desktop"),
      stdio: "inherit",
    });
  } catch (err) {
    console.warn("tauri icon CLI failed; writing core PNGs only.");
    mkdirSync(tauriIconsDir, { recursive: true });
    await writePng(sharp, squarePath, join(tauriIconsDir, "icon.png"), 512);
    await writePng(sharp, squarePath, join(tauriIconsDir, "32x32.png"), 32);
    await writePng(sharp, squarePath, join(tauriIconsDir, "128x128.png"), 128);
    await writePng(sharp, squarePath, join(tauriIconsDir, "128x128@2x.png"), 256);
    copyFileSync(join(tauriIconsDir, "icon.png"), join(tauriIconsDir, "128x128@2x.png"));
  }

  console.log("Done. Reload extension in Chrome after build.");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
