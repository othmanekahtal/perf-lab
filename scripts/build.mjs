// `pnpm build` → `next build`; `ANALYZE=true pnpm build` → `next analyze` (Turbopack bundle analyzer).
// Extra args are forwarded, e.g. `ANALYZE=true pnpm build -- -o`.
import { spawnSync } from "node:child_process";

const analyze = process.env.ANALYZE === "true";
const args = [analyze ? "analyze" : "build", ...process.argv.slice(2).filter((a) => a !== "--")];
const result = spawnSync("next", args, { stdio: "inherit", shell: process.platform === "win32" });
process.exit(result.status ?? 1);
