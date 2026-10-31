"use client";

import {
  createContext,
  useContext,
  useDeferredValue,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import { usePathname } from "next/navigation";
import {
  aggregate,
  filterTransactions,
  PreparedData,
  prepareTransactions,
} from "@/lib/compute";
import type { RegionFilter, Stats, Transaction } from "@/lib/types";

export interface AppContextValue {
  ready: boolean;
  regionCounts: Record<RegionFilter, number> | null; // in the type;
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
  const [data, setData] = useState<PreparedData | null>(null);

  const [query, setQuery] = useState("");
  const [region, setRegion] = useState<RegionFilter>("All");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [density, setDensity] = useState<"comfortable" | "compact">(
    "comfortable",
  );
  const [notificationsOpen, setNotificationsOpen] = useState(false);

  useEffect(() => {
    if (pathname !== "/" || data) return;
    fetch("/data/transactions.json")
      .then((res) => res.text())
      .then((text) => {
        const raw = JSON.parse(text) as Transaction[];
        setData(prepareTransactions(raw));
      });
  }, [pathname, data]);

  const deferredQuery = useDeferredValue(query);

  const filtered = useMemo(
    () => (data ? filterTransactions(data, deferredQuery, region) : []),
    [data, deferredQuery, region],
  );
  const stats = useMemo(() => aggregate(filtered), [filtered]);

  // PERF-BUG #5: a brand-new value object on every render, so every consumer
  // re-renders even when the slice it reads did not change.
  const value: AppContextValue = {
    ready: data !== null, // in the value
    regionCounts: data?.regionCounts ?? null,
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
