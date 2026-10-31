/**
 * Copies Inter's latin variable subset (~97 KB, every weight in one file) from the
 * official `inter-ui` package into app/fonts, where next/font/local loads it.
 */

import { copyFileSync, existsSync, mkdirSync, statSync } from "node:fs";
import { join } from "node:path";

const SRC = join(process.cwd(), "node_modules", "inter-ui", "variable-latin", "InterVariable-subset.woff2");
const OUT_DIR = join(process.cwd(), "app", "fonts");
const DEST = join(OUT_DIR, "InterVariable-latin.woff2");

if (!existsSync(SRC)) throw new Error(`missing ${SRC}: run pnpm install first`);
mkdirSync(OUT_DIR, { recursive: true });
copyFileSync(SRC, DEST);
console.log(`InterVariable-subset.woff2 → ${DEST} (${(statSync(DEST).size / 1024).toFixed(0)} KB)`);
