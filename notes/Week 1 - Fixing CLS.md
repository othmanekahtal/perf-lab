---
title: "Week 1: Fixing CLS (late banner)"
date: 2026-10-31
project: perf-lab
bug: "PERF-BUG #7"
metric: CLS
tags:
  - performance
  - core-web-vitals
  - cls
  - nextjs
  - perf-lab
---

# Week 1: Fixing CLS (late banner)

> [!summary]
> A promo/cookie banner appeared ~1.5 s after the page became interactive, **at the top of the page**, and pushed everything down. Making it a `fixed` overlay at the **bottom** removed the shift. **CLS went from 0.411 to 0.001.**

## What is CLS?

**Cumulative Layout Shift** measures how much visible content **moves unexpectedly** while the page is open.

- Each shift scores **impact fraction × distance fraction**:
  - *impact fraction*: how much of the viewport the moving content covers
  - *distance fraction*: how far it moved, relative to the viewport height
- Shifts close together (less than 1 s apart, within a 5 s window) are grouped; **CLS is the worst group**.
- Shifts within 500 ms of a user click or keypress **don't count**, because the user expects things to change then.

| Rating | CLS |
|---|---|
| ✅ Good | ≤ 0.1 |
| ⚠️ Needs improvement | 0.1 – 0.25 |
| ❌ Poor | > 0.25 |

## The problem

File: `components/PromoBanner.tsx`

- The banner is hidden at first, then appears through `setTimeout(..., 1500)` after hydration.
- It was rendered **at the top of the page in normal flow**, with **no reserved space**.
- When it appeared, the header, sidebar and dashboard were all pushed down by the banner's height.
- On the mobile viewport (412 × 823) almost the whole screen moved, by a large part of its height, which gave **CLS 0.411 (poor)**.

> [!info] How I knew it was the banner
> The harness saves the largest shift in `perf-results/*.json` (`attribution.cls`):
> - `largestShiftTarget` was `div.md:flex`, the main content wrapper, so *something above it* grew.
> - `largestShiftTime` was **~15.9 s**, exactly **1.5 s after hydration** (~14.4 s). That's the banner's timer.

## The fix

Take the banner **out of the normal flow**, so its appearance can't push anything:

```tsx
<div
  data-testid="promo-banner"
  className="fixed inset-x-0 bottom-0 z-50 bg-indigo-600 px-4 py-5 text-sm text-white md:px-6"
>
```

- `fixed`: positioned relative to the screen, not part of the page layout
- `inset-x-0 bottom-0`: full width, stuck to the bottom
- `z-50`: drawn above the content

> [!tip] Other valid fixes
> 1. **Reserve the space** from the first render (e.g. a wrapper with a fixed `min-height`), so the banner fills an existing gap.
> 2. **Render it on the server** in the initial HTML, so it's there before the first paint.
> 3. **Show it only after a user action** (shifts within 500 ms of an input don't count).
>
> General rule: **never insert content above existing content without reserving its space.**

## Results

| | Week 0 (baseline) | Week 1 (fix) |
|---|---|---|
| **CLS** | 0.411 ❌ | **0.001 ✅** |
| LCP | 12.77 s | 12.77 s |
| INP | 6256 ms | 6008 ms |
| TBT | 8912 ms | 9560 ms |

- **CLS** is the metric this bug targets, and it went from *poor* to *good*.
- **INP / TBT** changed within normal run-to-run noise (baseline INP ranged 5.9–7.0 s across 5 runs). Not a real change.
- **Surprise:** I expected some CLS to remain from the hero image (it has no width/height). Almost nothing remained, so **the banner was nearly all of the CLS.**

## Cache and the "304 Not Modified" trap

> [!warning] Images looked "optimized" in DevTools. They weren't.
> In the Network tab every image showed **304 Not Modified** and **0.2 kB**.

- **304** means the browser **already had the file in its cache**. It only asked "has it changed?" and the server said "no".
- Only that short answer (~0.2 kB of headers) was transferred. The real file (1.9 MB) was loaded **from disk**.
- A first-time visitor downloads the full file. **The cache hides the real cost.**

**How to see the real cost:**
1. DevTools → **Network** tab
2. Tick ☑️ **Disable cache** (it only applies while DevTools is open)
3. Reload, and you'll see **200** responses with the real sizes (~1.9 MB per photo)

> [!tip] How to recognise optimized images
> Not optimized: `photo-01.jpg`, type `jpeg`, ~1.9 MB
> Optimized by `next/image`: `image?url=%2Fimages%2Fphoto-01.jpg&w=828&q=75`, type `webp`/`avif`, tens of kB

## The correct way to debug performance

### 1. Always use a production build

```sh
pnpm build
pnpm start      # NOT pnpm dev
```

`pnpm dev` adds hot-reload code, skips minification and compiles on demand, so its numbers are meaningless.
You can tell you're in dev mode if the Network tab shows files like `[turbopack]_browser_dev_hmr-client...`.

### 2. Simulate a real phone, not your laptop

- **Network** tab: ☑️ *Disable cache* + throttling **Fast 4G**
- **Performance** tab: ⚙️ → **CPU: 4× slowdown**
- Optional: device toolbar (`Cmd+Shift+M`) for a mobile viewport

### 3. Use the right tool for each question

| Question | Tool |
|---|---|
| *What* is slow? | Lighthouse (DevTools → Lighthouse → Mobile) |
| *Why* is the page frozen? | Performance tab: record, look for long tasks (red corners) |
| *Which* files are heavy? | Network tab (cache disabled), sort by Size |
| *What* is in my JS bundle? | `ANALYZE=true pnpm build` |
| *Did my fix work?* (official) | `pnpm perf -- --label "..."` |

> [!important] DevTools is for understanding. The harness is for proof.
> DevTools and Lighthouse settings differ from the harness, so their numbers won't match PERF.md. Only compare **harness numbers with harness numbers**.

### 4. Follow the scientific method

1. **Measure** before changing anything (baseline)
2. **Form a hypothesis**: "the banner causes the CLS"
3. **Change ONE thing**
4. **Measure again** with the same settings
5. **Compare** the targeted metric, and check that the others didn't get clearly worse
6. **Write it down**, including surprises

### 5. Respect noise

The same code gives different numbers on each run. Use the **median of several runs** (the harness does 5), and ignore changes smaller than the normal spread.

### 6. Read the attribution, don't guess

`perf-results/*.json` tells you **which element** caused LCP, the largest CLS shift, and the slowest interaction (INP), with timings. Start there before changing code.

## Related

- Bug list and workflow: `README.md`
- Results table: `PERF.md`
- Raw data: `perf-results/2026-10-31-fix-banner-cls.json`
- Next: [[Week 2 - Fixing LCP (images)]]
