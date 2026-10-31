"use client";

import {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { usePathname } from "next/navigation";
import { aggregate } from "@/lib/compute";
import type { RegionFilter, Stats, Transaction } from "@/lib/types";
import type { WorkerRequest, WorkerResponse } from "@/lib/transactions.worker";

const EMPTY_STATS = aggregate([]);

function createSafeContext<T>(name: string) {
  const Context = createContext<T | null>(null);
  function useSafeContext(): T {
    const value = useContext(Context);
    if (value === null)
      throw new Error(`${name} must be used inside <AppProvider>`);
    return value;
  }
  return [Context, useSafeContext] as const;
}

interface DataValue {
  ready: boolean;
  filtered: Transaction[];
  stats: Stats;
  regionCounts: Record<RegionFilter, number> | null;
}
interface QueryValue {
  query: string;
  setQuery: (q: string) => void;
}
interface RegionValue {
  region: RegionFilter;
  setRegion: (r: RegionFilter) => void;
}
interface SelectionValue {
  selectedId: string | null;
  setSelectedId: (id: string | null) => void;
}
interface UIValue {
  density: "comfortable" | "compact";
  setDensity: (d: "comfortable" | "compact") => void;
}

const [DataContext, useData] = createSafeContext<DataValue>("useData");
const [QueryContext, useQuery] = createSafeContext<QueryValue>("useQuery");
const [RegionContext, useRegion] = createSafeContext<RegionValue>("useRegion");
const [SelectionContext, useSelection] =
  createSafeContext<SelectionValue>("useSelection");
const [UIContext, useUI] = createSafeContext<UIValue>("useUI");

export { useData, useQuery, useRegion, useSelection, useUI };

const EMPTY_ROWS: Transaction[] = [];

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

  const data = useMemo<DataValue>(
    () => ({
      ready: result !== null,
      filtered: result?.filtered ?? EMPTY_ROWS,
      stats: result?.stats ?? EMPTY_STATS,
      regionCounts: result?.regionCounts ?? null,
    }),
    [result],
  );
  const queryValue = useMemo(() => ({ query, setQuery }), [query]);
  const regionValue = useMemo(() => ({ region, setRegion }), [region]);
  const selection = useMemo(
    () => ({ selectedId, setSelectedId }),
    [selectedId],
  );
  const ui = useMemo(
    () => ({ density, setDensity}),
    [density],
  );

  return (
    <DataContext value={data}>
      <QueryContext value={queryValue}>
        <RegionContext value={regionValue}>
          <SelectionContext value={selection}>
            <UIContext value={ui}>{children}</UIContext>
          </SelectionContext>
        </RegionContext>
      </QueryContext>
    </DataContext>
  );
}
