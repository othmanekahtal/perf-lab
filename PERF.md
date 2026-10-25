# PERF.md: Perf Lab notebook

## 1. Methodology

| | |
|---|---|
| Machine | Apple M1 Pro, 10 cores, 32 GB RAM |
| OS | macOS 27.0.1 |
| Node | v24.21.0 |
| Browser | Playwright 1.64.1, Chromium Headless Shell 156.0.8078.4 |
| Next.js | 16.4.3 (App Router, Turbopack, React 19.3.0, React Compiler **off**) |
| Server | Production build only: the harness starts its own `next start -p 3100` (gzip on, HTTP/1.1, localhost) |
| CPU | 4× slowdown via CDP `Emulation.setCPUThrottlingRate` |
| Network | DevTools "Fast 4G" via CDP `Network.emulateNetworkConditions`: 9 Mbps down / 1.5 Mbps up / 165 ms latency (DevTools-adjusted values) |
| Viewport | 412 × 823, DPR 1.75, `isMobile`, Android Chrome UA |
| Cache | Disabled (`Network.setCacheDisabled`), fresh browser context per page load |
| Runs | 5 measured runs after 1 unrecorded warm-up load; **median** of each metric |

**Reproduce**

```sh
pnpm install && pnpm exec playwright install chromium
pnpm generate && pnpm build
pnpm perf -- --label "<change>" --week <n> [--append]
```

**What each run does**

1. Loads `/` in a fresh context and waits for the first table row, then for the promo banner, then 3 s to settle. It doesn't wait for `load`, because 60 large images keep that from firing for minutes under throttling.
2. Scripted interaction (for INP): clicks the search box, types `garcia` one key at a time (150 ms between keys), clicks the first table row, then clicks the **EMEA** sidebar item.
3. Loads `/about` in a fresh context with the same settings, waiting for network idle (JS bytes only).

**Metric definitions**

- **LCP / CLS / INP**: `web-vitals` 6.2.3 attribution build, injected before any page script, with `reportAllChanges`. The last reported value is used. Attribution (LCP element, largest shift, INP target and phases) is in the raw JSON.
- **Long tasks**: `PerformanceObserver({ type: "longtask", buffered: true })` registered before any page script. Covers the whole session (load + interaction): count / total duration / longest.
- **TBT**: Σ(duration − 50 ms) over long tasks that start between FCP and the start of the scripted interaction (load phase only).
- **JS dashboard / JS /about**: sum of CDP `encodedDataLength` (bytes on the wire: gzip body + headers, like DevTools "Transferred") for every `Script` response. For the dashboard this counts until the interaction starts; for `/about`, until network idle. Next.js router **prefetches are blocked** (`*_rsc=*`), because otherwise each route also downloads the other route's chunks and the `/about` control becomes meaningless.
- **Notes (auto)**: FCP; **hero text**, the Element Timing render time of the hero `<h1>` (`elementtiming="hero-title"`), which, like LCP, only counts text once it's visibly painted, so it captures the font block period; image and font bytes transferred during the run; number of long tasks > 200 ms.

**Deviation from the original spec:** network throttling was added (`--network none` restores CPU-only). On unthrottled localhost, a 2 MB hero arrives in ~30 ms and paints at first paint (measured: LCP 0.28 s), so the image and font bugs (#3, #4) physically can't show up in the numbers. "Fast 4G" is the DevTools preset that pairs with a mid-range phone.

Raw per-run JSON (all runs, medians, request log, long-task list, attribution) is in `perf-results/<date>-<label>.json`.

## 2. Known issues

| # | Bug | Expected to hurt | How it shows up in the baseline |
|---|-----|------------------|--------------------------------|
| 1 | 10,000-row table, no virtualization, new `Intl` formatters per cell | INP, TBT, long tasks | Multi-second long tasks on data arrival and on every keystroke / click |
| 2 | ~5 MB JSON parsed on the main thread; full filter → sort → aggregate on every render (no debounce, memo or worker) | INP, TBT, long tasks | Same long tasks; INP processing time in seconds |
| 3 | 60 × ~1.9 MB / 3000 px images + a 4000 px / ~2 MB hero; plain `<img>`, no dimensions / `loading` / `sizes` / `srcset` / priority / preload | LCP, CLS, bytes | LCP = hero image after ~12.6 s of resource load; dimensionless images shift layout; tens of MB of image traffic |
| 4 | Full unsubset Inter (4 × ~110 KB) via raw `@font-face` with no `font-display` | Text render time (FCP / hero text), bandwidth contention with the LCP image | Hero text paints ~1.6 s after FCP (A/B with `swap`: 2.04 s vs 0.46 s); ~446 KB of fonts |
| 5 | Root god-context with a new value object every render; every section consumes it; no memoization; React Compiler off | INP, long tasks | Whole tree (header, sidebar, KPIs, 4 charts, 60 figures, 10k rows) re-renders per keystroke |
| 6 | recharts imported statically everywhere, including in non-chart components via `lib/chart-utils.ts` | JS dashboard, JS /about, TBT | recharts (~93 KB gz chunk) ships on `/about`, which draws no chart |
| 7 | Cookie / promo banner mounts ~1.5 s after hydration at the top, no reserved space | CLS | Largest layout shift; it pushes the whole viewport down |

## 3. Results

| Week | Date | Commit | Change | LCP (s) | INP (ms) | CLS | JS dashboard (KB gz) | JS /about (KB gz) | Long tasks (count / total ms / max ms) | TBT (ms) | Notes |
|---|---|---|---|---|---|---|---|---|---|---|---|
