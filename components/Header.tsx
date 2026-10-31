"use client";

import Link from "next/link";
import { useData, useQuery, useUI } from "./AppContext";
import { useState } from "react";

export function Header() {
  const { query, setQuery } = useQuery();
  const { ready, filtered } = useData();
  const { density, setDensity } =
    useUI();
    const [notificationsOpen, setNotificationsOpen] = useState(false);

  return (
    <header className="sticky top-0 z-20 border-b border-slate-200 bg-white/95 backdrop-blur">
      <div className="flex flex-wrap items-center gap-3 px-4 py-3 md:px-6">
        <Link
          href="/"
          className="flex items-center gap-2 font-semibold text-slate-900"
        >
          <span className="grid h-8 w-8 place-items-center rounded-lg bg-indigo-600 text-white">
            PL
          </span>
          <span>Perf Lab</span>
          <span className="hidden rounded bg-slate-100 px-1.5 py-0.5 text-xs font-medium text-slate-500 sm:inline">
            Analytics
          </span>
        </Link>

        <div className="order-last w-full sm:order-none sm:w-auto sm:flex-1">
          <label className="relative block">
            <span className="sr-only">Search transactions</span>
            <input
              data-testid="search"
              type="search"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search customers, companies, IDs…"
              className="w-full rounded-lg border border-slate-300 bg-slate-50 px-3 py-2 text-sm outline-none focus:border-indigo-500 focus:bg-white focus:ring-2 focus:ring-indigo-200"
            />
          </label>
          <p className="mt-1 text-xs text-slate-500">
            {ready
              ? `${filtered.length.toLocaleString()} matching transactions`
              : "Loading transactions…"}
          </p>
        </div>

        <div className="ml-auto flex items-center gap-2">
          <button
            onClick={() =>
              setDensity(density === "compact" ? "comfortable" : "compact")
            }
            className="rounded-md border border-slate-200 px-2.5 py-1.5 text-xs font-medium text-slate-600 hover:bg-slate-50"
          >
            {density === "compact" ? "Comfortable" : "Compact"}
          </button>
          <button
            onClick={() => setNotificationsOpen(!notificationsOpen)}
            className="relative rounded-md border border-slate-200 px-2.5 py-1.5 text-xs font-medium text-slate-600 hover:bg-slate-50"
          >
            Alerts
            <span className="absolute -right-1 -top-1 grid h-4 w-4 place-items-center rounded-full bg-rose-500 text-[10px] text-white">
              3
            </span>
          </button>
          <span className="grid h-8 w-8 place-items-center rounded-full bg-slate-200 text-xs font-semibold text-slate-700">
            OK
          </span>
        </div>
      </div>
    </header>
  );
}
