---
title: "Images: preload, sizes and next/image optimization"
date: 2026-10-31
project: perf-lab
bug: "PERF-BUG #3"
metric: LCP
tags:
  - performance
  - images
  - lcp
  - nextjs
  - next-image
  - perf-lab
---

# Images: `preload`, `sizes` and `next/image` optimization

> [!summary]
> - **`sizes`** tells the browser *how wide the image will be on screen*, so it can **download a small version**. Without it, `next/image` still sends a **3840 px, ~1 MB** file.
> - **`preload`** tells the browser to **start downloading this image immediately**, before it would normally find it. Use it only for the LCP image.
> - **`next/image`** resizes, re-encodes (WebP), caches, lazy-loads, and reserves space for every image.

## 1. Why the original images are bad

```tsx
<img src="/images/hero.jpg" className="w-full" />
```

| Problem | Effect |
|---|---|
| File is 4000 px / ~2 MB, shown ~412 px wide on a phone | ~95% of the bytes are wasted |
| One file for every screen | Phone and 4K monitor download the same thing |
| JPEG only | No modern format (WebP / AVIF) |
| No `width` / `height` | Browser can't reserve space, so layout shifts (CLS) |
| No `loading="lazy"` on the 60 photos | All 60 download at once, competing with the hero |
| No priority | Hero waits in line with the photos, so LCP is slow |

## 2. How `next/image` optimizes

You write:

```tsx
<Image src="/images/hero.jpg" width={4000} height={1600} sizes="100vw" alt="" />
```

Next.js renders an `<img>` with a **`srcset`**, a menu of sizes:

```html
<img
  src="/_next/image?url=%2Fimages%2Fhero.jpg&w=3840&q=75"
  srcset="/_next/image?url=%2Fimages%2Fhero.jpg&w=640&q=75 640w,
          /_next/image?url=%2Fimages%2Fhero.jpg&w=750&q=75 750w,
          ... ,
          /_next/image?url=%2Fimages%2Fhero.jpg&w=3840&q=75 3840w"
  sizes="100vw" width="4000" height="1600" loading="lazy" decoding="async" />
```

When the browser requests one URL, e.g. `w=750`, the Next server:

1. **Checks** that `w` is an allowed width and `q` an allowed quality (default: only `75`)
2. **Resizes** the original with `sharp` (never larger than the original)
3. **Re-encodes** to **WebP** (the default `images.formats`; AVIF must be enabled in `next.config.ts`)
4. **Caches** the result in `.next/cache/images` (default `minimumCacheTTL`: 4 hours)

> [!info] First request is slow, the rest are fast
> The first request for each width has to resize and encode the image. After that it's served from cache. That's why **run 1 of the harness can be slower** after a fresh build, and why we use the median.

What `next/image` also does by default:

- `loading="lazy"`: off-screen images download only when you scroll near them
- `decoding="async"`: decoding doesn't block the main thread
- **`width` + `height` → aspect ratio**: the browser reserves the right space before the image arrives (no CLS)

> [!warning] `width` and `height` are NOT the display size
> They are the **real dimensions of the file**, used for the aspect ratio. The **display size** comes from CSS (`className="h-auto w-full"`).

## 3. `sizes`: the key to small downloads

### The problem `sizes` solves

The browser wants to choose an image from `srcset` **as early as possible**, while the HTML is still loading, before CSS and layout. At that moment it **doesn't know how wide the image will be**. `sizes` tells it.

> [!quote] `sizes` = "at this screen width, the image will be this wide"

### What happens WITHOUT `sizes`

Next.js has to guess, and uses the `width` prop with **density descriptors** (`1x`, `2x`). From the Next 16 source (`getWidths`):

- candidates = the smallest allowed size ≥ `width` and ≥ `width × 2`
- our hero has `width={4000}`, so there's no allowed size ≥ 4000, and Next falls back to the largest: **3840**

```html
srcset="/_next/image?url=...hero.jpg&w=3840&q=75 1x"
```

**Even on a phone, the browser downloads the 3840 px version.** Measured with sharp, the same encoder Next uses:

| Version | Dimensions | Size |
|---|---|---|
| Original hero JPEG | 4000 × 1600 | 2,097 KB |
| `next/image` **without** `sizes` (w=3840 WebP) | 3840 × 1536 | **1,002 KB** |
| `next/image` **with** `sizes` on our phone (w=750 WebP) | 750 × 300 | **9 KB** |
| Original photo JPEG | 3000 × 2000 | 1,895 KB |
| Photo **without** `sizes` | 3000 × 2000 | **1,108 KB** |
| Photo **with** `sizes` on our phone (w=384 WebP) | 384 × 256 | **6 KB** |

> [!note] Our test images are synthetic (gradients + noise) and shrink unusually well. Real photos at the same widths are typically tens of KB, still a huge saving.

### What happens WITH `sizes`

Next switches to **width descriptors** (`640w`, `750w`, …) and lets the browser choose.

**Which widths go in the `srcset`?** Next 16's allowed sizes (defaults):

```
imageSizes:  32, 48, 64, 96, 128, 256, 384
deviceSizes: 640, 750, 828, 1080, 1200, 1920, 2048, 3840
```

If `sizes` contains `vw` values, Next keeps only sizes ≥ `640 × smallest vw%`:

| `sizes` | smallest vw | minimum width | widths in `srcset` |
|---|---|---|---|
| Hero: `(min-width: 768px) calc(100vw - 288px), 100vw` | 100% | 640 | 640 → 3840 |
| Grid: `(min-width: 1280px) 16vw, (min-width: 768px) 25vw, 50vw` | 16% | 102.4 | 128 → 3840 |

> [!info] Detail
> The `100vw` inside `calc(...)` isn't detected (Next's regex needs a space or the start of the string before the number). Only the final `100vw` is.

## 4. How the browser picks a size: the calculation

> [!important] Formula
> **needed pixels = slot width (CSS px) × device pixel ratio (DPR)**
> The browser picks the **smallest candidate ≥ needed pixels** (browsers may pick a bigger one they already have cached).

**Step by step:**

1. Read `sizes` **left to right** and take the **first media condition that matches** (the last item, with no condition, is the default)
2. That gives the **slot width** in CSS px
3. Multiply by the **DPR** (screen density: 1 on old monitors, 2 on Retina, ~1.75–3 on phones)
4. Pick from `srcset`

### Example A: the harness phone (412 × 823, DPR 1.75)

**Hero**, `sizes="(min-width: 768px) calc(100vw - 288px), 100vw"`:
1. Is the viewport ≥ 768 px? No (412), so use `100vw`
2. Slot = 412 px
3. 412 × 1.75 = **721 px needed**
4. Smallest candidate ≥ 721 is **750w**, so it downloads ~9 KB

**Grid photo**, `sizes="(min-width: 1280px) 16vw, (min-width: 768px) 25vw, 50vw"`:
1. ≥ 1280? No. ≥ 768? No. So use `50vw`
2. Slot = 50% × 412 = 206 px
3. 206 × 1.75 = **360.5 px needed**
4. Smallest candidate ≥ 360.5 is **384w**, so it downloads ~6 KB

### Example B: a laptop (1440 px wide, Retina DPR 2)

**Hero:**
1. ≥ 768? Yes, so use `calc(100vw - 288px)`
2. Slot = 1440 − 288 = 1152 px
3. 1152 × 2 = **2304 px needed**
4. Candidates: …2048, **3840**. 2048 is too small, so it picks **3840w** (the list jumps from 2048 to 3840)

**Grid photo:**
1. ≥ 1280? Yes, so use `16vw`
2. Slot = 16% × 1440 = 230 px
3. 230 × 2 = **461 px needed**
4. Smallest candidate ≥ 461 is **640w**

### Where `288px` comes from

It's our real layout on desktop (`md` and up):

```
sidebar  md:w-60  = 240 px
main     md:p-6   =  24 px left + 24 px right = 48 px
                    -----------------------------
                    240 + 48 = 288 px not available to the hero
```

So the hero is `100vw − 288px` wide on desktop. On mobile the sidebar is a horizontal strip on top, so the hero is ~full width.

### Where the grid `sizes` comes from

From the Tailwind classes on the grid:

| Screen | Class | Columns | Each image ≈ |
|---|---|---|---|
| < 768 px | `grid-cols-2` | 2 | 50vw |
| ≥ 768 px | `md:grid-cols-4` | 4 | 25vw |
| ≥ 1280 px | `xl:grid-cols-6` | 6 | ~16vw |

> [!tip] `sizes` only needs to be approximately right
> - **A bit too big** (we ignore padding and gaps): a slightly larger file. Fine.
> - **Too small**: the browser picks a file that's too small, and the image looks **blurry**. Bad.
> - **Missing**: the 3840 px fallback. Very bad.
> When in doubt, round up.

### How to check what the browser picked

DevTools → **Elements** → select the `<img>` → hover the `src` → it shows **"Intrinsic size"** (the file) vs **"Rendered size"** (on screen). Or look in the **Network** tab for the `w=` value in the `/_next/image` URL.

## 5. `preload`: start the most important image early

### The problem `preload` solves

Normally the browser finds an image when it **reaches the `<img>` tag** while parsing, or only after JavaScript renders it. Images also start at **low priority**. Chrome raises in-viewport images to high only *after layout*, when it knows they're visible.

For the **LCP image** (the biggest thing on screen), every millisecond of delay counts directly toward LCP.

### What `preload` does (Next 16 source)

```tsx
<Image src="/images/hero.jpg" preload ... />
```

1. **Adds a preload hint in the `<head>`** (through React's `ReactDOM.preload`):
   ```html
   <link rel="preload" as="image"
         imagesrcset="...640w, ...750w, ..." imagesizes="...">
   ```
   The browser starts downloading **as soon as it reads the `<head>`**, before it reaches the `<img>` and before any JavaScript runs. Because it carries `imagesrcset` + `imagesizes`, it preloads **the right size**, not the biggest.
2. **Turns off lazy loading** for this image (`loading` isn't set to `lazy`).

> [!warning] `preload` does NOT set `fetchpriority="high"` by itself
> In the Next 16 source, `fetchPriority` is only passed through if *you* set it. To also make the hero win against other requests, add:
> ```tsx
> <Image ... preload fetchPriority="high" />
> ```
> - `preload` = **discover early**
> - `fetchPriority="high"` = **go first in the queue**
> They complement each other.

> [!info] `priority` is deprecated in Next 16
> The old `priority` prop is replaced by `preload`. Using both throws an error.

### When to use it, and when not

✅ **Only** for the image that is the **LCP element** and visible without scrolling, usually one per page (the hero).

❌ Not for the gallery photos. If you preload everything, nothing is prioritized: they all compete again, and you lose lazy loading.

### Honest expectation for our app

Our hero is already in the **server HTML**, so the browser finds it early anyway. Most of the LCP gain will come from:
1. **Smaller file**: 2 MB → ~9 KB on the phone (`sizes`)
2. **Less competition**: 59 photos lazy-loaded instead of all at once (also gives bandwidth back to the JS, so hydration happens earlier)

`preload` and `fetchPriority` add a smaller gain on top. **To learn what each part is worth, measure them separately** (e.g. run the harness without `--append` with and without `fetchPriority`).

## 6. Final code for Week 2

**Hero** (`components/Hero.tsx`):

```tsx
import Image from "next/image";

<Image
  src="/images/hero.jpg"
  alt="Q3 campaign hero"
  width={4000}
  height={1600}
  preload
  fetchPriority="high"
  sizes="(min-width: 768px) calc(100vw - 288px), 100vw"
  className="h-auto w-full"
/>
```

**Grid** (`components/ImageGrid.tsx`):

```tsx
import Image from "next/image";

<Image
  src={photo.src}
  alt={photo.title}
  width={3000}
  height={2000}
  sizes="(min-width: 1280px) 16vw, (min-width: 768px) 25vw, 50vw"
  className="h-auto w-full"
/>
```

Optional extra (another experiment): enable AVIF, usually smaller than WebP but slower to encode:

```ts
// next.config.ts
images: { formats: ["image/avif", "image/webp"] },
```

## 7. Cheat sheet

| Attribute | Answers the question | Needed for |
|---|---|---|
| `width` / `height` | "What shape is the file?" | No CLS; fallback srcset |
| `sizes` | "How wide will it be on screen?" | Downloading the right size |
| `preload` | "Start this one now" | LCP image only |
| `fetchPriority="high"` | "This one goes first" | LCP image only |
| `loading="lazy"` (default) | "Wait until it's near the screen" | Everything below the fold |

**Formula:** `needed px = slot width × DPR`, then the smallest `srcset` candidate ≥ needed.

## Related

- [[Week 1 - Fixing CLS]]
- Bug: `PERF-BUG #3` in `components/Hero.tsx`, `components/ImageGrid.tsx`
- Next.js docs: Image component, `sizes`, `preload`
