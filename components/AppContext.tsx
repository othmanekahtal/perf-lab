"use client";

import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import { usePathname } from "next/navigation";
import { aggregate, filterTransactions, sortTransactions } from "@/lib/compute";
import type { RegionFilter, Stats, Transaction } from "@/lib/types";

export interface AppContextValue {
  ready: boolean;
  transactions: Transaction[] | null;
  filtered: Transaction[];
  stats: Stats;
  query: string;
  setQuery: (q: string) => void;
  region: RegionFilter;
  setRegion: (r: RegionFilter) => void;
  selectedId: string | null;
  setSelectedId: (id: string | null) => void;
  // Unrelated UI state that still lives in the same context.
  density: "comfortable" | "compact";
  setDensity: (d: "comfortable" | "compact") => void;
  notificationsOpen: boolean;
  setNotificationsOpen: (open: boolean) => void;
}

// PERF-BUG #5: one god-context at the root layout. Every consumer (header,
// sidebar, KPI cards, charts, table, image grid) re-renders on every keystroke.
const AppContext = createContext<AppContextValue | null>(null);

export function AppProvider({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const [transactions, setTransactions] = useState<Transaction[] | null>(null);
  const [query, setQuery] = useState("");
  const [region, setRegion] = useState<RegionFilter>("All");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [density, setDensity] = useState<"comfortable" | "compact">("comfortable");
  const [notificationsOpen, setNotificationsOpen] = useState(false);

  useEffect(() => {
    if (pathname !== "/" || transactions) return;
    fetch("/data/transactions.json")
      .then((res) => res.text())
      .then((text) => {
        // PERF-BUG #2: ~5 MB JSON.parse on the main thread (no worker, no streaming).
        const rows = JSON.parse(text) as Transaction[];
        setTransactions(rows);
      });
  }, [pathname, transactions]);

  // PERF-BUG #2: synchronous filter → sort → aggregate over the full array on
  // EVERY render of the provider (every keystroke, every click). No debounce,
  // no memoization, no worker.
  const filtered = sortTransactions(filterTransactions(transactions ?? [], query, region));
  const stats = aggregate(filtered);

  // PERF-BUG #5: a brand-new value object on every render, so every consumer
  // re-renders even when the slice it reads did not change.
  const value: AppContextValue = {
    ready: transactions !== null,
    transactions,
    filtered,
    stats,
    query,
    setQuery,
    region,
    setRegion,
    selectedId,
    setSelectedId,
    density,
    setDensity,
    notificationsOpen,
    setNotificationsOpen,
  };

  return <AppContext.Provider value={value}>{children}</AppContext.Provider>;
}

export function useAppContext(): AppContextValue {
  const ctx = useContext(AppContext);
  if (!ctx) throw new Error("useAppContext must be used inside <AppProvider>");
  return ctx;
}
