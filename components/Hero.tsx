"use client";

import { useAppContext } from "./AppContext";

export function Hero() {
  const { ready, filtered } = useAppContext();

  return (
    <section className="overflow-hidden rounded-xl border border-slate-200 bg-slate-900 text-white shadow-sm">
      {/* PERF-BUG #3: 4000px / ~2 MB hero in a plain <img>: no dimensions, no priority, no preload. */}
      <img src="/images/hero.jpg" alt="Q3 campaign hero" className="w-full" />
      <div className="p-4 md:p-6">
        <p className="text-xs font-medium uppercase tracking-wide text-indigo-300">Q3 2026 · Revenue review</p>
        <h1 elementtiming="hero-title" className="mt-1 text-xl font-semibold md:text-2xl">Global transactions dashboard</h1>
        <p className="mt-1 text-sm text-slate-300">
          {ready ? `${filtered.length.toLocaleString()} transactions across 4 regions and 8 product lines.` : "Crunching the latest numbers…"}
        </p>
      </div>
    </section>
  );
}
