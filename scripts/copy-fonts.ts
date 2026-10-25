/**
 * Copies full (unsubset, ~110 KB each) Inter woff2 files from the official
 * `inter-ui` package into public/fonts.
 *
 * PERF-BUG #4: we ship the full-coverage font files and load them via raw
 * @font-face with no font-display (see app/globals.css).
 */
import { copyFileSync, existsSync, mkdirSync, statSync } from "node:fs";
import { join } from "node:path";

const SRC = join(process.cwd(), "node_modules", "inter-ui", "web");
const OUT = join(process.cwd(), "public", "fonts");
const FILES: Record<number, string> = {
  400: "Inter-Regular.woff2",
  500: "Inter-Medium.woff2",
  600: "Inter-SemiBold.woff2",
  700: "Inter-Bold.woff2",
};

if (!existsSync(SRC)) throw new Error(`missing ${SRC} — run pnpm install first`);
mkdirSync(OUT, { recursive: true });

for (const [weight, name] of Object.entries(FILES)) {
  const dest = join(OUT, `inter-${weight}.woff2`);
  copyFileSync(join(SRC, name), dest);
  console.log(`${name} → ${dest} (${(statSync(dest).size / 1024).toFixed(0)} KB)`);
}
