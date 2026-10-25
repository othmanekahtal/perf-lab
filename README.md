# Perf Lab

A deliberately slow internal analytics dashboard (Next.js App Router, TypeScript, Tailwind, recharts), plus a repeatable measurement harness. Each week, fix **one** problem, measure it, and commit the result. `PERF.md` is the lab notebook.

> The baseline is broken on purpose. Every intentional problem is tagged in code with `PERF-BUG #n`:
>
> ```sh
> grep -rn "PERF-BUG #" app components lib scripts eslint.config.mjs next.config.ts
> ```

## Quick start

```sh
pnpm install
pnpm exec playwright install chromium   # once, for the harness
pnpm generate                           # data (~5 MB JSON), 61 large JPEGs, Inter woff2 files
pnpm build
pnpm start                              # http://localhost:3000
```

`pnpm generate` is deterministic (seeded), so everyone measures the same bytes. Generated assets (`public/data`, `public/images`, `public/fonts`) are git-ignored.

## The 7 bugs

| # | Problem | Where | Expected to hurt |
|---|---------|-------|------------------|
| 1 | 10,000-row table rendered straight into the DOM, no virtualization; new `Intl` formatters per cell | `components/TransactionsTable.tsx` | INP, TBT, long tasks |
| 2 | ~5 MB JSON fetched and `JSON.parse`d on the main thread; full filter → sort → aggregate on every keystroke, no debounce, worker or memo | `components/AppContext.tsx`, `lib/compute.ts`, `scripts/generate-data.ts` | INP, TBT, long tasks |
| 3 | 60 × ~1.9 MB / 3000 px JPEGs + a 4000 px / ~2 MB hero, plain `<img>` with no dimensions, `loading`, `sizes`, `srcset`, priority or preload; no `next/image` (lint rule off) | `components/ImageGrid.tsx`, `components/Hero.tsx`, `scripts/generate-images.ts` | LCP, CLS |
| 4 | Full, unsubset Inter (4 × ~110 KB woff2) via raw `@font-face` with no `font-display`; no `next/font` | `app/globals.css`, `scripts/copy-fonts.ts` | FCP / text rendering, bandwidth contention with the LCP image |
| 5 | One root `AppContext` (query, filtered data, unrelated UI state) with a new value object every render; header, sidebar, KPIs, charts, table and image grid all consume it. No `memo` / `useMemo` / `useCallback` / `useDeferredValue` / `useTransition`; React Compiler explicitly off | `components/AppContext.tsx`, every consumer, `next.config.ts` | INP, long tasks |
| 6 | recharts imported statically everywhere, including the sidebar and table (which draw no chart) via `lib/chart-utils.ts`, so it lands in the shared layout bundle. No `next/dynamic` / `React.lazy` | `lib/chart-utils.ts`, `components/Charts.tsx`, `components/KpiCards.tsx`, `components/Sidebar.tsx`, `components/TransactionsTable.tsx` | JS dashboard, JS /about, TBT |
| 7 | Cookie/promo banner mounts ~1.5 s after hydration at the top of the page with no reserved space | `components/PromoBanner.tsx` | CLS |

`/about` is the control route: it has almost no content, so any JS it ships comes from the shared layout.

## Measuring

```sh
pnpm build
pnpm perf -- --label "Baseline" --week 0            # print the row only
pnpm perf -- --label "Baseline" --week 0 --append   # also append it to PERF.md
```

The harness (`scripts/perf.ts`) refuses to run without a production build and starts its own `next start` on port 3100. It warns if source files are newer than the build. It does 5 runs in Playwright Chromium (4× CPU throttling, DevTools "Fast 4G" network, 412×823 mobile viewport, cache disabled), reports medians, and writes the raw per-run JSON to `perf-results/<date>-<label>.json`. See `PERF.md` → Methodology for the details.

Options:

| Flag | Default | Meaning |
|------|---------|---------|
| `--label "<text>"` | required | Goes in the *Change* column and the results file name |
| `--week <n>` | `–` | *Week* column |
| `--append` | off | Insert the row at the end of the results table in `PERF.md` |
| `--runs <n>` | `5` | Number of measured runs (median reported) |
| `--network fast4g\|none` | `fast4g` | Network emulation; `none` = CPU throttling only |
| `--notes "<text>"` | auto | Overrides the auto notes (FCP, image/font bytes, tasks > 200 ms) |
| `--port <n>` | `3100` | Port for the harness's own `next start` |

Bundle inspection: `ANALYZE=true pnpm build` runs `next analyze`, the Turbopack bundle analyzer (`@next/bundle-analyzer` only supports webpack, and Turbopack is the default bundler in Next 16). Add `-- -o` to write the analysis to disk without starting the UI.

## Weekly workflow

1. Pick one `PERF-BUG #n` and fix only that (`grep -rn "PERF-BUG #n"`). Remove its tags as you fix it.
2. `pnpm build`
3. Commit the fix, so the row records a clean commit hash. Uncommitted source changes show up as `<hash>-dirty`.
4. `pnpm perf -- --label "<what changed>" --week <n> --append`
5. Commit `PERF.md` and `perf-results/`.

Compare the new row with the previous one. If a fix moves a metric you didn't expect, note it in the *Notes* column.

## Layout

```
app/                 layout (provider, banner, header, sidebar), dashboard page, /about
components/          AppContext + every consumer
lib/                 types, compute (filter/sort/aggregate), chart-utils (recharts registry)
scripts/             generate-data, generate-images, copy-fonts, perf
perf-results/        raw JSON per measurement
PERF.md              methodology, known issues, results table
```
