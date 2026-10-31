"use client";

import {
  createContext,
  useContext,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { usePathname } from "next/navigation";
import { aggregate } from "@/lib/compute";
import type { RegionFilter, Stats, Transaction } from "@/lib/types";
import type { WorkerRequest, WorkerResponse } from "@/lib/transactions.worker";
const EMPTY_STATS = aggregate([]); 

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
  const workerRef = useRef<Worker | null>(null);
  const requestId = useRef(0);
  const [result, setResult] = useState<WorkerResponse | null>(null);

  const pathname = usePathname();

  const [query, setQuery] = useState("");
  const [region, setRegion] = useState<RegionFilter>("All");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [density, setDensity] = useState<"comfortable" | "compact">(
    "comfortable",
  );
  const [notificationsOpen, setNotificationsOpen] = useState(false);

  useEffect(() => {
    if (pathname !== "/") return;
    const worker = new Worker(
      new URL("../lib/transactions.worker.ts", import.meta.url),
      { type: "module" },
    );
    worker.onmessage = (e: MessageEvent<WorkerResponse>) => {
      // Ignore answers to old requests (user kept typing).
      if (e.data.id === requestId.current) setResult(e.data);
    };
    workerRef.current = worker;
    return () => {
      worker.terminate();
      workerRef.current = null;
    };
  }, [pathname]);

  useEffect(() => {
    const worker = workerRef.current;
    if (!worker) return;
    requestId.current += 1;
    const request: WorkerRequest = { id: requestId.current, query, region };
    worker.postMessage(request);
  }, [query, region, pathname]);

  // PERF-BUG #5: a brand-new value object on every render, so every consumer
  // re-renders even when the slice it reads did not change.
  const value: AppContextValue = {
    ready: result !== null,
    regionCounts: result?.regionCounts ?? null,
    filtered: result?.filtered ?? [],
    stats: result?.stats ?? EMPTY_STATS,
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
