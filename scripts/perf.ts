/**
 * Perf Lab measurement harness.
 *
 *   pnpm perf -- --label "Baseline" [--week 0] [--append] [--runs 5] [--notes "..."]
 *
 * Always measures a production build: it refuses to run without `.next/BUILD_ID`
 * and starts its own `next start` on a dedicated port.
 */
import { execSync, spawn, type ChildProcess } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, readdirSync, statSync, writeFileSync } from "node:fs";
import { createServer } from "node:net";
import os from "node:os";
import { join } from "node:path";
import { chromium, type Browser, type BrowserContext, type CDPSession, type Page } from "playwright";

// ---------------------------------------------------------------------------
// Configuration
// ---------------------------------------------------------------------------

const ROOT = process.cwd();
const CPU_THROTTLE = 4;
const VIEWPORT = { width: 412, height: 823 };
const DEVICE_SCALE_FACTOR = 1.75;
const USER_AGENT =
  "Mozilla/5.0 (Linux; Android 14; Pixel 7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0.0.0 Mobile Safari/537.36";
const SEARCH_QUERY = "garcia"; // 6 characters, typed one key at a time
const KEY_DELAY_MS = 150;
const SETTLE_AFTER_LOAD_MS = 3000;
const NAV_TIMEOUT_MS = 180_000;
// Chrome DevTools "Fast 4G" preset (values include DevTools' own 0.9 / 2.75 adjustment factors).
const NETWORK_PROFILES = {
  fast4g: { offline: false, latency: 165, downloadThroughput: (9_000_000 / 8) * 0.9, uploadThroughput: (1_500_000 / 8) * 0.9 },
  none: null,
} as const;
type NetworkProfile = keyof typeof NETWORK_PROFILES;

// ---------------------------------------------------------------------------
// CLI
// ---------------------------------------------------------------------------

interface Args {
  label: string;
  week: string;
  notes: string;
  append: boolean;
  runs: number;
  port: number;
  network: NetworkProfile;
}

function parseArgs(argv: string[]): Args {
  const args = argv.filter((a) => a !== "--");
  const get = (name: string) => {
    const i = args.indexOf(`--${name}`);
    return i >= 0 ? args[i + 1] : undefined;
  };
  const label = get("label");
  if (!label) {
    console.error('Usage: pnpm perf -- --label "<description>" [--week <n>] [--append] [--runs 5] [--notes "..."]');
    process.exit(1);
  }
  return {
    label,
    week: get("week") ?? "–",
    notes: get("notes") ?? "",
    append: args.includes("--append"),
    runs: Number(get("runs") ?? 5),
    port: Number(get("port") ?? 3100),
    network: parseNetwork(get("network") ?? "fast4g"),
  };
}

function parseNetwork(value: string): NetworkProfile {
  if (value in NETWORK_PROFILES) return value as NetworkProfile;
  console.error(`Unknown --network "${value}". Use one of: ${Object.keys(NETWORK_PROFILES).join(", ")}`);
  process.exit(1);
}

// ---------------------------------------------------------------------------
// Production server
// ---------------------------------------------------------------------------

function assertProductionBuild() {
  const buildId = join(ROOT, ".next", "BUILD_ID");
  if (!existsSync(buildId)) {
    console.error("No production build found (.next/BUILD_ID). Run `pnpm build` first. Dev mode is never measured.");
    process.exit(1);
  }
  const builtAt = statSync(buildId).mtimeMs;
  const stale: string[] = [];
  const walk = (dir: string) => {
    for (const name of readdirSync(dir)) {
      const p = join(dir, name);
      const s = statSync(p);
      if (s.isDirectory()) walk(p);
      else if (s.mtimeMs > builtAt) stale.push(p.replace(ROOT + "/", ""));
    }
  };
  for (const dir of ["app", "components", "lib"]) if (existsSync(join(ROOT, dir))) walk(join(ROOT, dir));
  for (const f of ["next.config.ts", "package.json"]) if (statSync(join(ROOT, f)).mtimeMs > builtAt) stale.push(f);
  if (stale.length) {
    console.warn(`⚠ Build is older than ${stale.length} source file(s) (e.g. ${stale.slice(0, 3).join(", ")}). Run \`pnpm build\` first.`);
  }
}

function assertPortFree(port: number): Promise<void> {
  return new Promise((resolve, reject) => {
    const srv = createServer();
    srv.once("error", () => reject(new Error(`Port ${port} is in use; pass --port <n>`)));
    srv.listen(port, () => srv.close(() => resolve()));
  });
}

async function startServer(port: number): Promise<ChildProcess> {
  await assertPortFree(port);
  const child = spawn(join(ROOT, "node_modules", ".bin", "next"), ["start", "-p", String(port)], {
    cwd: ROOT,
    detached: true,
    stdio: "ignore",
    env: { ...process.env, NODE_ENV: "production", NEXT_TELEMETRY_DISABLED: "1" },
  });
  const deadline = Date.now() + 30_000;
  while (Date.now() < deadline) {
    try {
      const res = await fetch(`http://localhost:${port}/about`);
      if (res.ok) return child;
    } catch {
      // not up yet
    }
    await new Promise((r) => setTimeout(r, 250));
  }
  stopServer(child);
  throw new Error("next start did not become ready within 30 s");
}

function stopServer(child: ChildProcess) {
  try {
    if (child.pid) process.kill(-child.pid, "SIGTERM");
  } catch {
    // already gone
  }
}

// ---------------------------------------------------------------------------
// Browser instrumentation
// ---------------------------------------------------------------------------

const webVitalsSource = readFileSync(join(ROOT, "node_modules", "web-vitals", "dist", "web-vitals.attribution.iife.js"), "utf8");

// Runs before any page script in every document.
const INIT_SCRIPT = `
window.__perf = { lcp: null, cls: null, inp: null, fcp: null, ttfb: null, longtasks: [], heroTitle: null };
try {
  new PerformanceObserver(function (list) {
    for (const e of list.getEntries()) window.__perf.longtasks.push({ start: e.startTime, duration: e.duration });
  }).observe({ type: "longtask", buffered: true });
} catch (e) {}
try {
  // Element Timing on the hero <h1>: like LCP, text only counts once it is visibly
  // painted, i.e. after the web font leaves its block period.
  new PerformanceObserver(function (list) {
    for (const e of list.getEntries()) if (e.identifier === "hero-title" && window.__perf.heroTitle === null) window.__perf.heroTitle = e.renderTime || e.loadTime;
  }).observe({ type: "element", buffered: true });
} catch (e) {}
${webVitalsSource}
(function () {
  var opts = { reportAllChanges: true };
  webVitals.onLCP(function (m) {
    var a = m.attribution;
    window.__perf.lcp = { value: m.value, target: a.target || null, url: a.url || null, timeToFirstByte: a.timeToFirstByte,
      resourceLoadDelay: a.resourceLoadDelay, resourceLoadDuration: a.resourceLoadDuration, elementRenderDelay: a.elementRenderDelay };
  }, opts);
  webVitals.onCLS(function (m) {
    var a = m.attribution;
    window.__perf.cls = { value: m.value, largestShiftTarget: a.largestShiftTarget || null, largestShiftTime: a.largestShiftTime || null,
      largestShiftValue: a.largestShiftValue || null };
  }, opts);
  webVitals.onINP(function (m) {
    var a = m.attribution;
    window.__perf.inp = { value: m.value, interactionTarget: a.interactionTarget || null, interactionType: a.interactionType || null,
      inputDelay: a.inputDelay, processingDuration: a.processingDuration, presentationDelay: a.presentationDelay };
  }, opts);
  webVitals.onFCP(function (m) { window.__perf.fcp = m.value; }, opts);
  webVitals.onTTFB(function (m) { window.__perf.ttfb = m.value; }, opts);
})();
`;

interface Collected {
  lcp: { value: number; target: string | null; url: string | null; timeToFirstByte: number; resourceLoadDelay: number; resourceLoadDuration: number; elementRenderDelay: number } | null;
  cls: { value: number; largestShiftTarget: string | null; largestShiftTime: number | null; largestShiftValue: number | null } | null;
  inp: { value: number; interactionTarget: string | null; interactionType: string | null; inputDelay: number; processingDuration: number; presentationDelay: number } | null;
  fcp: number | null;
  ttfb: number | null;
  longtasks: { start: number; duration: number }[];
  heroTitle: number | null;
}

declare global {
  interface Window {
    __perf: Collected;
  }
}

interface RequestLog {
  url: string;
  type: string;
  initiator: string;
  startMs: number;
  bytes: number;
}

interface ByteCounter {
  requests: RequestLog[];
  js: number;
  image: number;
  font: number;
  fetch: number;
  jsFiles: number;
  encodings: Set<string>;
  snapshot(): { js: number; image: number; font: number; fetch: number; jsFiles: number };
}

async function instrument(
  context: BrowserContext,
  network: NetworkProfile,
): Promise<{ page: Page; cdp: CDPSession; bytes: ByteCounter }> {
  const page = await context.newPage();
  const cdp = await context.newCDPSession(page);
  await cdp.send("Network.enable");
  await cdp.send("Network.setCacheDisabled", { cacheDisabled: true });
  await cdp.send("Emulation.setCPUThrottlingRate", { rate: CPU_THROTTLE });
  const conditions = NETWORK_PROFILES[network];
  if (conditions) await cdp.send("Network.emulateNetworkConditions", conditions);
  // Block Next.js router prefetches (RSC `?_rsc=` requests). They speculatively pull in
  // *other* routes' chunks and would pollute per-route JS numbers. The harness never
  // navigates client-side, so no real navigation depends on them.
  await cdp.send("Fetch.enable", { patterns: [{ urlPattern: "*_rsc=*", requestStage: "Request" }] });
  cdp.on("Fetch.requestPaused", (e) => {
    cdp.send("Fetch.failRequest", { requestId: e.requestId, errorReason: "BlockedByClient" }).catch(() => {});
  });

  const types = new Map<string, string>();
  const log = new Map<string, RequestLog>();
  let t0: number | null = null;
  const bytes: ByteCounter = {
    requests: [],
    js: 0,
    image: 0,
    font: 0,
    fetch: 0,
    jsFiles: 0,
    encodings: new Set(),
    snapshot() {
      return { js: this.js, image: this.image, font: this.font, fetch: this.fetch, jsFiles: this.jsFiles };
    },
  };
  cdp.on("Network.requestWillBeSent", (e) => {
    t0 ??= e.timestamp;
    const entry = {
      url: e.request.url.replace(/^https?:\/\/[^/]+/, ""),
      type: e.type ?? "Other",
      initiator: e.initiator.type,
      startMs: Math.round((e.timestamp - t0) * 1000),
      bytes: 0,
    };
    log.set(e.requestId, entry);
    bytes.requests.push(entry);
  });
  cdp.on("Network.responseReceived", (e) => {
    types.set(e.requestId, e.type);
    if (e.type === "Script") {
      const enc = Object.entries(e.response.headers).find(([k]) => k.toLowerCase() === "content-encoding")?.[1];
      bytes.encodings.add(String(enc ?? "identity"));
    }
  });
  cdp.on("Network.loadingFinished", (e) => {
    // encodedDataLength = bytes on the wire (compressed body + headers), like DevTools "Transferred".
    const entry = log.get(e.requestId);
    if (entry) entry.bytes = e.encodedDataLength;
    switch (types.get(e.requestId)) {
      case "Script":
        bytes.js += e.encodedDataLength;
        bytes.jsFiles += 1;
        break;
      case "Image":
        bytes.image += e.encodedDataLength;
        break;
      case "Font":
        bytes.font += e.encodedDataLength;
        break;
      case "Fetch":
      case "XHR":
        bytes.fetch += e.encodedDataLength;
        break;
    }
  });
  await page.addInitScript(INIT_SCRIPT);
  return { page, cdp, bytes };
}

async function newMobileContext(browser: Browser) {
  return browser.newContext({
    viewport: VIEWPORT,
    deviceScaleFactor: DEVICE_SCALE_FACTOR,
    isMobile: true,
    hasTouch: false,
    userAgent: USER_AGENT,
  });
}

// ---------------------------------------------------------------------------
// One run
// ---------------------------------------------------------------------------

interface RunResult {
  run: number;
  lcpMs: number | null;
  cls: number | null;
  inpMs: number | null;
  fcpMs: number | null;
  ttfbMs: number | null;
  heroTitleMs: number | null;
  tbtMs: number;
  longTasks: { count: number; totalMs: number; maxMs: number; over200: number };
  longTasksLoad: { count: number; totalMs: number; maxMs: number };
  longTasksInteraction: { count: number; totalMs: number; maxMs: number };
  jsDashboardBytes: number;
  jsDashboardBytesTotal: number;
  jsAboutBytes: number;
  jsDashboardFiles: number;
  imageBytes: number;
  fontBytes: number;
  dataBytes: number;
  interactionStartMs: number;
  attribution: { lcp: Collected["lcp"]; cls: Collected["cls"]; inp: Collected["inp"] };
  longTaskEntries: { start: number; duration: number }[];
}

const summarize = (tasks: { duration: number }[]) => ({
  count: tasks.length,
  totalMs: Math.round(tasks.reduce((s, t) => s + t.duration, 0)),
  maxMs: Math.round(tasks.reduce((m, t) => Math.max(m, t.duration), 0)),
});

async function measureDashboard(browser: Browser, base: string, run: number, network: NetworkProfile) {
  const context = await newMobileContext(browser);
  const { page, bytes } = await instrument(context, network);

  // Not waiting for `load`: with throttling, 60 × ~1.9 MB images keep it from firing for minutes.
  await page.goto(`${base}/`, { waitUntil: "domcontentloaded", timeout: NAV_TIMEOUT_MS });
  await page.waitForSelector('[data-testid="txn-row"]', { timeout: NAV_TIMEOUT_MS });
  await page.waitForSelector('[data-testid="promo-banner"]', { timeout: 30_000 });
  await page.waitForTimeout(SETTLE_AFTER_LOAD_MS);
  const loadBytes = bytes.snapshot();
  const interactionStartMs = await page.evaluate(() => performance.now());

  // Scripted interaction: focus search, type 6 chars one by one, click a row, click a sidebar item.
  await page.click('[data-testid="search"]');
  for (const ch of SEARCH_QUERY) {
    await page.keyboard.press(ch);
    await page.waitForTimeout(KEY_DELAY_MS);
  }
  await page.waitForTimeout(1000);
  await page.locator('[data-testid="txn-row"]').first().click();
  await page.waitForTimeout(1000);
  await page.click('[data-testid="nav-EMEA"]');
  await page.waitForTimeout(2000);

  const collected = await page.evaluate(() => window.__perf);
  await context.close();

  const fcp = collected.fcp ?? 0;
  const loadTasks = collected.longtasks.filter((t) => t.start < interactionStartMs);
  const interactionTasks = collected.longtasks.filter((t) => t.start >= interactionStartMs);
  // TBT (load phase): Σ(duration − 50) for long tasks between FCP and the start of scripted interaction.
  const tbtMs = Math.round(
    loadTasks.filter((t) => t.start >= fcp).reduce((s, t) => s + Math.max(0, t.duration - 50), 0),
  );

  return {
    run,
    lcpMs: collected.lcp?.value ?? null,
    cls: collected.cls?.value ?? null,
    inpMs: collected.inp?.value ?? null,
    fcpMs: collected.fcp,
    ttfbMs: collected.ttfb,
    heroTitleMs: collected.heroTitle === null ? null : Math.round(collected.heroTitle),
    tbtMs,
    longTasks: { ...summarize(collected.longtasks), over200: collected.longtasks.filter((t) => t.duration > 200).length },
    longTasksLoad: summarize(loadTasks),
    longTasksInteraction: summarize(interactionTasks),
    jsDashboardBytes: loadBytes.js,
    jsDashboardBytesTotal: bytes.js,
    jsDashboardFiles: loadBytes.jsFiles,
    imageBytes: bytes.image,
    fontBytes: bytes.font,
    dataBytes: bytes.fetch,
    interactionStartMs: Math.round(interactionStartMs),
    attribution: { lcp: collected.lcp, cls: collected.cls, inp: collected.inp },
    longTaskEntries: collected.longtasks.map((t) => ({ start: Math.round(t.start), duration: Math.round(t.duration) })),
    encodings: [...bytes.encodings],
    requests: bytes.requests.filter((r) => r.type !== "Image"),
  };
}

async function measureAbout(browser: Browser, base: string, network: NetworkProfile) {
  const context = await newMobileContext(browser);
  const { page, bytes } = await instrument(context, network);
  await page.goto(`${base}/about`, { waitUntil: "networkidle", timeout: NAV_TIMEOUT_MS });
  await page.waitForTimeout(500);
  await context.close();
  return { js: bytes.js, requests: bytes.requests };
}

// ---------------------------------------------------------------------------
// Reporting
// ---------------------------------------------------------------------------

function median(values: (number | null)[]): number | null {
  const v = values.filter((x): x is number => x !== null && Number.isFinite(x)).sort((a, b) => a - b);
  if (!v.length) return null;
  const mid = Math.floor(v.length / 2);
  return v.length % 2 ? v[mid] : (v[mid - 1] + v[mid]) / 2;
}

const fmt = (n: number | null, digits: number) => (n === null ? "n/a" : n.toFixed(digits));
const kb = (bytes: number | null) => (bytes === null ? "n/a" : (bytes / 1024).toFixed(1));

function sh(cmd: string): string {
  try {
    return execSync(cmd, { cwd: ROOT, stdio: ["ignore", "pipe", "ignore"] }).toString().trim();
  } catch {
    return "";
  }
}

function commitRef(): string {
  const hash = sh("git rev-parse --short HEAD") || "uncommitted";
  const dirty = sh("git status --porcelain -- . ':!PERF.md' ':!perf-results'");
  return dirty ? `${hash}-dirty` : hash;
}

function localDate(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function appendToPerfMd(row: string) {
  const file = join(ROOT, "PERF.md");
  if (!existsSync(file)) throw new Error("PERF.md not found");
  const lines = readFileSync(file, "utf8").split("\n");
  const start = lines.findIndex((l) => /^##\s+.*Results/i.test(l));
  let insertAt = lines.length;
  if (start >= 0) {
    let last = -1;
    for (let i = start + 1; i < lines.length && !/^##\s/.test(lines[i]); i++) if (lines[i].startsWith("|")) last = i;
    if (last >= 0) insertAt = last + 1;
  }
  lines.splice(insertAt, 0, row);
  writeFileSync(file, lines.join("\n"));
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

async function main() {
  const args = parseArgs(process.argv.slice(2));
  assertProductionBuild();

  const base = `http://localhost:${args.port}`;
  console.log(`▶ starting production server on ${base} (CPU ${CPU_THROTTLE}×, network: ${args.network}, ${args.runs} runs)`);
  const server = await startServer(args.port);
  const browser = await chromium.launch({ headless: true });
  const runs: (RunResult & { encodings: string[]; requests: RequestLog[]; aboutRequests: RequestLog[] })[] = [];

  try {
    // Warm-up: first hit after `next start` pays one-off server costs; not recorded.
    await measureAbout(browser, base, args.network);
    for (let i = 1; i <= args.runs; i++) {
      const dash = await measureDashboard(browser, base, i, args.network);
      const about = await measureAbout(browser, base, args.network);
      const result = { ...dash, jsAboutBytes: about.js, aboutRequests: about.requests };
      runs.push(result);
      console.log(
        `  run ${i}/${args.runs}: LCP ${fmt(result.lcpMs, 0)} ms · INP ${fmt(result.inpMs, 0)} ms · CLS ${fmt(result.cls, 3)} · ` +
          `FCP ${fmt(result.fcpMs, 0)} ms · hero text ${fmt(result.heroTitleMs, 0)} ms · TBT ${result.tbtMs} ms · long tasks ${result.longTasks.count}/${result.longTasks.totalMs}/${result.longTasks.maxMs} ms · ` +
          `JS ${kb(result.jsDashboardBytes)} / ${kb(result.jsAboutBytes)} KB`,
      );
    }
  } finally {
    const chromeVersion = browser.version();
    await browser.close();
    stopServer(server);
    if (!runs.length) process.exit(1);

    const med = {
      lcpMs: median(runs.map((r) => r.lcpMs)),
      inpMs: median(runs.map((r) => r.inpMs)),
      cls: median(runs.map((r) => r.cls)),
      fcpMs: median(runs.map((r) => r.fcpMs)),
      heroTitleMs: median(runs.map((r) => r.heroTitleMs)),
      tbtMs: median(runs.map((r) => r.tbtMs)),
      longTaskCount: median(runs.map((r) => r.longTasks.count)),
      longTaskTotalMs: median(runs.map((r) => r.longTasks.totalMs)),
      longTaskMaxMs: median(runs.map((r) => r.longTasks.maxMs)),
      longTasksOver200: median(runs.map((r) => r.longTasks.over200)),
      jsDashboardBytes: median(runs.map((r) => r.jsDashboardBytes)),
      jsAboutBytes: median(runs.map((r) => r.jsAboutBytes)),
      imageBytes: median(runs.map((r) => r.imageBytes)),
      fontBytes: median(runs.map((r) => r.fontBytes)),
      dataBytes: median(runs.map((r) => r.dataBytes)),
    };

    const date = localDate();
    const commit = commitRef();
    const notes =
      args.notes ||
      `FCP ${fmt(med.fcpMs === null ? null : med.fcpMs / 1000, 2)} s · hero text ${fmt(med.heroTitleMs === null ? null : med.heroTitleMs / 1000, 2)} s · img ${fmt(med.imageBytes === null ? null : med.imageBytes / 1024 ** 2, 1)} MB · ` +
        `fonts ${kb(med.fontBytes)} KB · ${fmt(med.longTasksOver200, 0)} tasks > 200 ms`;
    const row =
      `| ${args.week} | ${date} | ${commit} | ${args.label} | ${fmt(med.lcpMs === null ? null : med.lcpMs / 1000, 2)} | ` +
      `${fmt(med.inpMs, 0)} | ${fmt(med.cls, 3)} | ${kb(med.jsDashboardBytes)} | ${kb(med.jsAboutBytes)} | ` +
      `${fmt(med.longTaskCount, 0)} / ${fmt(med.longTaskTotalMs, 0)} / ${fmt(med.longTaskMaxMs, 0)} | ${fmt(med.tbtMs, 0)} | ${notes} |`;

    const meta = {
      label: args.label,
      week: args.week,
      date,
      commit,
      machine: `${os.cpus()[0]?.model ?? "unknown"} · ${os.cpus().length} cores · ${Math.round(os.totalmem() / 1024 ** 3)} GB`,
      os: `${sh("sw_vers -productName")} ${sh("sw_vers -productVersion")}`.trim() || `${os.type()} ${os.release()}`,
      node: process.version,
      chromium: chromeVersion,
      next: JSON.parse(readFileSync(join(ROOT, "node_modules", "next", "package.json"), "utf8")).version,
      settings: {
        cpuThrottle: CPU_THROTTLE,
        viewport: VIEWPORT,
        deviceScaleFactor: DEVICE_SCALE_FACTOR,
        cacheDisabled: true,
        network: args.network,
        networkConditions: NETWORK_PROFILES[args.network],
        searchQuery: SEARCH_QUERY,
        keyDelayMs: KEY_DELAY_MS,
        runs: runs.length,
      },
    };

    mkdirSync(join(ROOT, "perf-results"), { recursive: true });
    const slug = args.label.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || "run";
    let out = join(ROOT, "perf-results", `${date}-${slug}.json`);
    if (existsSync(out)) out = out.replace(/\.json$/, `-${new Date().toTimeString().slice(0, 8).replace(/:/g, "")}.json`);
    writeFileSync(out, JSON.stringify({ meta, median: med, row, runs }, null, 2));

    console.log(`\nRaw results → ${out.replace(ROOT + "/", "")}\n`);
    console.log("| Week | Date | Commit | Change | LCP (s) | INP (ms) | CLS | JS dashboard (KB gz) | JS /about (KB gz) | Long tasks (count / total ms / max ms) | TBT (ms) | Notes |");
    console.log("|---|---|---|---|---|---|---|---|---|---|---|---|");
    console.log(row);

    if (args.append) {
      appendToPerfMd(row);
      console.log("\n✓ appended to PERF.md");
    }
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
