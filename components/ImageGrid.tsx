"use client";

import Image from "next/image";
import { useAppContext } from "./AppContext";

const PHOTOS = Array.from({ length: 60 }, (_, i) => ({
  src: `/images/photo-${String(i + 1).padStart(2, "0")}.jpg`,
  title: `Creative #${i + 1}`,
  channel: ["Paid social", "Display", "Email", "Search", "Affiliate"][i % 5],
}));

export function ImageGrid() {
  // PERF-BUG #5: consumes the whole context, so all 60 figures re-render on every keystroke.
  const { density, region } = useAppContext();

  return (
    <section className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
      <div className="flex items-baseline justify-between">
        <h2 className="text-sm font-semibold text-slate-900">
          Campaign creatives
        </h2>
        <p className="text-xs text-slate-500">
          {region === "All" ? "All regions" : region} · 60 assets
        </p>
      </div>
      <div
        className={`mt-3 grid grid-cols-2 md:grid-cols-4 xl:grid-cols-6 ${density === "compact" ? "gap-2" : "gap-4"}`}
      >
        {PHOTOS.map((photo) => (
          <figure
            key={photo.src}
            className="overflow-hidden rounded-lg border border-slate-100"
          >
            <Image
              src={photo.src}
              alt={photo.title}
              className="w-full"
              width={3000}
              height={2000}
              sizes="(min-width: 1280px) 16vw, (min-width: 768px) 25vw, 50vw"
            />
            <figcaption className="px-2 py-1.5 text-xs">
              <span className="font-medium text-slate-800">{photo.title}</span>
              <span className="block text-slate-500">{photo.channel}</span>
            </figcaption>
          </figure>
        ))}
      </div>
    </section>
  );
}
