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
| 2 | ~5 MB JSON parsed on the main thread; full filter → sort → aggregate on every render (no debounce, memo or worker) | INP, TBT, long tasks | Same long tasks; INP is the search keystroke in every run, with 5–6.5 s of processing time |
| 3 | 60 × ~1.9 MB / 3000 px images + a 4000 px / ~2 MB hero; plain `<img>`, no dimensions / `loading` / `sizes` / `srcset` / priority / preload | LCP, CLS, bytes | LCP = hero image in every run, ~12.57 s of resource load; ~68 MB of image traffic per run. The images also starve the JS: hydration (proxy: the data fetch starts) only happens at ~14.4 s |
| 4 | Full unsubset Inter (4 × ~110 KB) via raw `@font-face` with no `font-display` | Text render time (FCP / hero text), bandwidth contention with the LCP image | Hero text paints ~1.6 s after FCP (A/B with `swap`: 2.04 s vs 0.46 s); ~446 KB of fonts |
| 5 | Root god-context with a new value object every render; every section consumes it; no memoization; React Compiler off | INP, long tasks | Whole tree (header, sidebar, KPIs, 4 charts, 60 figures, 10k rows) re-renders per keystroke |
| 6 | recharts imported statically everywhere, including in non-chart components via `lib/chart-utils.ts` | JS dashboard, JS /about, TBT | recharts (~93 KB gz chunk) ships on `/about`, which draws no chart |
| 7 | Cookie / promo banner mounts ~1.5 s after hydration at the top, no reserved space | CLS | Largest layout shift in every run: the content wrapper (`div.md:flex`) pushed down at ~15.9 s, exactly 1.5 s after hydration. Making the banner taller raised CLS from 0.160 to 0.411 |

## 3. Results

| Week | Date | Commit | Change | LCP (s) | INP (ms) | CLS | JS dashboard (KB gz) | JS /about (KB gz) | Long tasks (count / total ms / max ms) | TBT (ms) | Notes |
|---|---|---|---|---|---|---|---|---|---|---|---|
| 0 | 2026-10-25 | b2bda4d | Baseline | 12.77 | 6256 | 0.411 | 278.1 | 230.7 | 25 / 29596 / 5320 | 8912 | FCP 0.45 s · hero text 2.04 s · img 67.6 MB · fonts 445.7 KB · 21 tasks > 200 ms |
| 1 | 2026-10-31 | 7580cea | Fix banner CLS | 12.77 | 6008 | 0.001 | 278.1 | 230.8 | 33 / 30644 / 5589 | 9560 | FCP 0.45 s · hero text 2.04 s · img 63.8 MB · fonts 445.7 KB · 21 tasks > 200 ms |
| 2 | 2026-10-31 | 04e4634 | next/image for hero + gallery | 0.44 | 5528 | 0.001 | 283.4 | 230.8 | 34 / 28746 / 5264 | 8326 | FCP 0.43 s · hero text 1.01 s · img 0.1 MB · fonts 445.7 KB · 22 tasks > 200 ms |
| 3 | 2026-10-31 | 593ded5 | virtualized table (tanstack) | 0.45 | 1864 | 0.001 | 293.6 | 230.8 | 11 / 8767 / 2558 | 2581 | FCP 0.44 s · hero text 1.03 s · img 0.1 MB · fonts 445.7 KB · 6 tasks > 200 ms |
| 4a | 2026-10-31 | b18b94a | prepare once + memo + deferred query | 0.44 | 112 | 0.001 | 293.8 | 231.0 | 10 / 1105 / 400 | 484 | FCP 0.43 s · hero text 1.06 s · img 0.1 MB · fonts 445.7 KB · 1 tasks > 200 ms |
