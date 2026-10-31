---
title: "Week 3: Virtualizing the 10,000-row table"
date: 2026-10-31
project: perf-lab
bug: "PERF-BUG #1"
metric: INP
tags:
  - performance
  - core-web-vitals
  - inp
  - virtualization
  - tanstack-virtual
  - react
  - perf-lab
---

# Week 3: Virtualizing the 10,000-row table

> [!summary]
> The table rendered **all 10,000 rows** into the DOM and created **~30,000 `Intl` formatters on every render**. I virtualized it with **TanStack Virtual** (only ~30 rows exist in the DOM at a time) and created the formatters **once**.
> **INP 5528 → 1864 ms (−66%)**, **TBT 8326 → 2581 ms (−69%)**, long tasks over 200 ms **22 → 6**.

## The problem: two bugs in one

File: `components/TransactionsTable.tsx`

### A. Too many DOM elements

Each row contains:

```
<tr>                         1
  10 × <td>                 10
  customer: 2 × <div>        2
  status: 2 × <span>         2
                          ----
                            15 elements per row
```

**10,000 rows × 15 = ~150,000 elements**, while only ~11 rows are visible on a phone.

On **every keystroke**, React had to compare all of them, and the browser had to recalculate style and layout for a gigantic table.

### B. New `Intl` formatters on every render

```tsx
// inside the row loop: ran 3 × 10,000 = 30,000 times per render
new Intl.DateTimeFormat("en-US", { dateStyle: "medium", timeStyle: "short" }).format(...)
new Intl.NumberFormat("en-US").format(...)
new Intl.NumberFormat("en-US", { style: "currency", currency: row.currency }).format(...)
```

> [!info] Creating vs using a formatter
> **Creating** an `Intl` formatter is expensive: it loads locale data and resolves options. **Using** one (`.format()`) is cheap. Create once, use many times.

## Fix 1: create formatters once

The options never change between rows, except currency, and there are only **5 currencies** in the data. So:

```tsx
// module level: runs once, when the file is loaded
const dateFormatter = new Intl.DateTimeFormat("en-US", { dateStyle: "medium", timeStyle: "short" });
const qtyFormatter = new Intl.NumberFormat("en-US");

// a small cache: at most 5 formatters ever created
const currencyFormatters = new Map<string, Intl.NumberFormat>();
function formatCurrency(amount: number, currency: string) {
  let formatter = currencyFormatters.get(currency);
  if (!formatter) {
    formatter = new Intl.NumberFormat("en-US", { style: "currency", currency });
    currencyFormatters.set(currency, formatter);
  }
  return formatter.format(amount);
}
```

> [!tip] Pattern: memoize by key with a `Map`
> When a value depends on only one small input (here `currency`), cache it in a `Map` keyed by that input. **30,000 creations become 7** (2 fixed + 5 currencies).

> [!warning] Same mistake elsewhere
> `usd()` in `lib/compute.ts` still creates a formatter per call (used by KPIs and charts). Not fixed this week: one bug at a time.

## Fix 2: virtualization

### The idea

Render **only the rows visible on screen**, plus a few extra above and below (**overscan**). Replace everything else with **empty space** of the same height, so the scrollbar still behaves like 10,000 rows. On scroll, recompute which rows are visible.

```
┌─────────────── scroll box (70vh) ───────────────┐
│  [ spacer row: height = paddingTop ]            │ ← rows 0…N above (not rendered)
│  row N   ┐                                      │
│  row N+1 │ overscan + visible rows              │ ← only these exist in the DOM
│  …       │ (~30 rows)                           │
│  row M   ┘                                      │
│  [ spacer row: height = paddingBottom ]         │ ← rows M…9999 below (not rendered)
└─────────────────────────────────────────────────┘
```

### The math behind it (fixed row height)

- **first visible row** = `floor(scrollTop ÷ rowHeight)`
- **visible rows** = `ceil(containerHeight ÷ rowHeight)`
- **space above** = rows hidden above × `rowHeight`
- **space below** = rows hidden below × `rowHeight`

TanStack Virtual does this for me, including rows of **different** heights.

### Step 1: a real scroll container

```tsx
const parentRef = React.useRef<HTMLDivElement>(null);

<div ref={parentRef} className="h-[70vh] overflow-auto">
  <table className="w-full min-w-[1100px] ...">
```

> [!warning] Mistake I made
> I first put `ref={parentRef}` on `<tbody>`. **A `<tbody>` can't scroll.** The virtualizer needs an element with a **fixed height** and **`overflow: auto`**, because it listens to *that* element's `scrollTop`.
> `overflow-auto` (not just `overflow-x-auto`) also keeps sideways scrolling for the 1100 px-wide table on phones.

### Step 2: configure the virtualizer

```tsx
const rows = filtered.slice(0, MAX_ROWS);   // must exist BEFORE useVirtualizer

const rowVirtualizer = useVirtualizer({
  count: rows.length,                                     // real number of rows
  getScrollElement: () => parentRef.current,
  estimateSize: () => (density === "compact" ? 45 : 53),  // first guess, in px
  overscan: 10,
});
```

| Option | Meaning |
|---|---|
| `count` | How many rows exist in total. **Must be `rows.length`**: it changes when you search |
| `getScrollElement` | Which element scrolls |
| `estimateSize` | Row height *guess* before real measurement |
| `overscan` | Extra rows rendered above/below the screen |

> [!warning] Mistake I made
> I first hardcoded `count: 10000`. After searching "garcia" there are only ~600 rows, so the virtualizer would try to render rows that don't exist.

**Where 53 and 45 come from:**

```
Customer cell: name (text-sm, 20px) + email (text-xs, 16px) = 36px
comfortable:   py-2 = 8 + 8 = 16px  → 36 + 16 + 1px border ≈ 53px
compact:       py-1 = 4 + 4 =  8px  → 36 +  8 + 1px border ≈ 45px
```

### Step 3: spacer rows (keeping a real `<table>`)

Virtual rows are often positioned with CSS `transform`, but that doesn't work well inside `<tbody>`. The trick is **two spacer rows**:

```tsx
const virtualRows = rowVirtualizer.getVirtualItems();
const paddingTop = virtualRows.length > 0 ? virtualRows[0].start : 0;
const paddingBottom =
  virtualRows.length > 0 ? rowVirtualizer.getTotalSize() - virtualRows[virtualRows.length - 1].end : 0;
```

- `getVirtualItems()`: rows to render now, each with `index`, `start`, `end` (px)
- `getTotalSize()`: total height of **all** rows (measured or estimated)
- `paddingTop`: where the first rendered row starts
- `paddingBottom`: total height minus where the last rendered row ends

```tsx
{paddingTop > 0 && <tr><td colSpan={10} style={{ height: paddingTop }} /></tr>}
{virtualRows.map((virtualRow) => {
  const row = rows[virtualRow.index];
  return <tr key={row.id} ...>…</tr>;
})}
{paddingBottom > 0 && <tr><td colSpan={10} style={{ height: paddingBottom }} /></tr>}
```

### Step 4: measure real heights

```tsx
<tr
  key={row.id}
  ref={rowVirtualizer.measureElement}   // TanStack measures the real height
  data-index={virtualRow.index}         // …and needs to know which row it is
  data-testid="txn-row"
>
```

`estimateSize` is only a guess. Without measuring, small errors add up over 10,000 rows, and scrolling **drifts or jumps**. `measureElement` uses the real height of each rendered row.

**Density toggle:** rows measured earlier keep their old height, so I re-measure when density changes:

```tsx
React.useEffect(() => {
  rowVirtualizer.measure();
}, [density, rowVirtualizer]);
```

### Step 5: sticky header

```tsx
<thead className="sticky top-0 z-10 bg-slate-50 ...">
```

The header sticks to the top **of the scroll box**. `bg-slate-50` hides the rows scrolling under it, and `z-10` keeps it above them.

## Keeping the harness working

The measurement script depends on:

- `data-testid="txn-row"` on every **real** row (spacer rows have none, on purpose)
- the **first** `txn-row` being clickable when the page loads (the harness clicks `.first()`)
- `key={row.id}` and the `selectedId` highlight still working

`MAX_ROWS = 10_000` was kept on purpose, so this week only changes *how* rows are rendered, not *how many* exist.

## Results

| Metric | Week 2 | **Week 3** | Change |
|---|---|---|---|
| **INP** | 5528 ms | **1864 ms** | **−66%** |
| **TBT** | 8326 ms | **2581 ms** | **−69%** |
| Long tasks (count / total / max) | 34 / 28746 / 5264 ms | **11 / 8767 / 2558 ms** | total −70% |
| Long tasks > 200 ms | 22 | **6** | |
| JS dashboard | 283.4 KB | 293.6 KB | **+10.2 KB** (TanStack Virtual) |
| LCP | 0.44 s | 0.45 s | same (noise) |
| CLS | 0.001 | 0.001 | same |

INP over the 5 runs: Week 2 **5280–6344 ms** vs Week 3 **1744–2112 ms**. The ranges don't overlap at all, so it's **a real result, not noise**.

### What the raw data says (`perf-results/*.json`)

- **INP is still the search keystroke** in almost every run.
- Its **processing time** fell from **~5.3–6.0 s** to **~1.6–2.0 s**.
- At load, the biggest long task fell from **~5 s** to **~2.5 s**: the first render of the table is now cheap.

## Why INP is still "poor" (1864 ms, target ≤ 200 ms)

The table is no longer the bottleneck. On **every keystroke**, these still happen:

1. **PERF-BUG #2:** filter + sort + aggregate run over **all 12,000 rows** synchronously (`lib/compute.ts`): building a lowercase string from every field, parsing dates inside the sort comparator, locale-formatting each date.
2. **PERF-BUG #5:** the god-context gives a **new value object on every render**, so the header, sidebar, KPI cards, **4 recharts charts** and **60 image figures** all re-render, even if their data didn't change.

> [!important] Lesson: bugs stack
> Fixing the biggest cost reveals the next one. A metric only reaches "good" when **all** the costs in its path are fixed.

## Trade-offs of virtualization

| Trade-off | Detail |
|---|---|
| `Cmd+F` / browser search | Can't find rows that aren't in the DOM. The app's own search box is now the only way |
| Accessibility | Screen readers only see the rendered rows. Improve with `aria-rowcount` / `aria-rowindex` |
| Bundle size | +10.2 KB gzipped for TanStack Virtual |
| UX | The table now scrolls inside its own 70vh box instead of with the page (alternative: `useWindowVirtualizer`) |
| Complexity | Row heights, measuring and spacer rows are more code to maintain |

For 10,000 rows this is clearly worth it: −66% INP for +10 KB.

## Key vocabulary

- **Virtualization (windowing):** rendering only the visible part of a long list
- **Overscan:** extra rows rendered beyond the visible area, so fast scrolling doesn't show blank gaps before React catches up
- **Spacer rows:** empty rows with an explicit height standing in for unrendered rows
- **`measureElement`:** lets the virtualizer measure real row heights instead of trusting the estimate
- **Processing duration (INP):** time spent running event handlers and the React render triggered by the interaction

## Self-check questions

1. Why must the scroll container have a **fixed height**?
2. What happens visually if `overscan` is `0` and I scroll very fast?
3. What would go wrong with `estimateSize: () => 35` and **no** `measureElement`?
4. Why does `count` have to be `rows.length` and not `10000`?
5. Why didn't the formatter fix need `useMemo`?
6. Which two bugs are now responsible for the remaining ~1.8 s of INP?

## Related

- [[Week 1 - Fixing CLS]]
- [[Images - preload, sizes and next-image optimization]]
- Raw data: `perf-results/2026-10-31-virtualized-table-tanstack.json`
- Next: [[Week 4 - …]] (suggested: PERF-BUG #5 context or #2 compute, the two remaining INP costs)
