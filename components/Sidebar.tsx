"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
// PERF-BUG #6: the sidebar never draws a chart, but it imports the recharts-backed
// registry statically, so recharts ships in the layout bundle on every route.
import { CHART_REGISTRY } from "@/lib/chart-utils";
import type { RegionFilter } from "@/lib/types";
import { useData, useRegion } from "./AppContext";

const REGIONS: RegionFilter[] = [
  "All",
  "North America",
  "EMEA",
  "LATAM",
  "APAC",
];

export function Sidebar() {
  const { region, setRegion } = useRegion();
  const { regionCounts } = useData();
  const pathname = usePathname();

  return (
    <aside className="border-b border-slate-200 bg-white md:sticky md:top-[73px] md:h-[calc(100vh-73px)] md:w-60 md:shrink-0 md:overflow-y-auto md:border-b-0 md:border-r">
      <nav className="flex gap-1 overflow-x-auto px-3 py-2 md:flex-col md:px-3 md:py-4">
        <p className="hidden px-2 pb-1 text-xs font-semibold uppercase tracking-wide text-slate-400 md:block">
          Pages
        </p>
        <Link
          href="/"
          className={`shrink-0 rounded-md px-3 py-1.5 text-sm ${pathname === "/" ? "bg-indigo-50 font-medium text-indigo-700" : "text-slate-600 hover:bg-slate-50"}`}
        >
          Dashboard
        </Link>
        <Link
          href="/about"
          className={`shrink-0 rounded-md px-3 py-1.5 text-sm ${pathname === "/about" ? "bg-indigo-50 font-medium text-indigo-700" : "text-slate-600 hover:bg-slate-50"}`}
        >
          About
        </Link>

        <p className="hidden px-2 pb-1 pt-4 text-xs font-semibold uppercase tracking-wide text-slate-400 md:block">
          Regions
        </p>
        {REGIONS.map((r) => {
          const count = regionCounts ? regionCounts[r] : null;
          return (
            <button
              key={r}
              data-testid={`nav-${r}`}
              onClick={() => setRegion(r)}
              className={`flex shrink-0 items-center justify-between gap-2 rounded-md px-3 py-1.5 text-left text-sm ${
                region === r
                  ? "bg-indigo-50 font-medium text-indigo-700"
                  : "text-slate-600 hover:bg-slate-50"
              }`}
            >
              <span>{r === "All" ? "All regions" : r}</span>
              {count !== null && (
                <span className="text-xs text-slate-400">
                  {count.toLocaleString()}
                </span>
              )}
            </button>
          );
        })}

        <div className="hidden md:block">
          <p className="px-2 pb-1 pt-4 text-xs font-semibold uppercase tracking-wide text-slate-400">
            Saved views
          </p>
          <ul className="space-y-0.5">
            {Object.entries(CHART_REGISTRY).map(
              ([kind, { label, component }]) => (
                <li
                  key={kind}
                  title={String(
                    (component as { displayName?: string }).displayName ?? kind,
                  )}
                  className="rounded-md px-3 py-1.5 text-sm text-slate-600 hover:bg-slate-50"
                >
                  {label}
                </li>
              ),
            )}
          </ul>
        </div>
      </nav>
    </aside>
  );
}
