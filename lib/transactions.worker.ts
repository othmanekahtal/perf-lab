import { aggregate, filterTransactions, prepareTransactions, type PreparedData } from "./compute";
import type { RegionFilter, Stats, Transaction } from "./types";

export interface WorkerRequest {
  id: number;
  query: string;
  region: RegionFilter;
}

export interface WorkerResponse {
  id: number;
  filtered: Transaction[];
  stats: Stats;
  regionCounts: Record<RegionFilter, number>;
}

let data: Promise<PreparedData> | null = null;

// Load once: the fetch and the 5 MB parse now happen on the worker thread.
function load() {
  data ??= fetch("/data/transactions.json")
    .then((res) => res.json() as Promise<Transaction[]>)
    .then(prepareTransactions);
  return data;
}

self.onmessage = async (e: MessageEvent<WorkerRequest>) => {
  const { id, query, region } = e.data;
  const prepared = await load();
  const filtered = filterTransactions(prepared, query, region);
  const response: WorkerResponse = { id, filtered, stats: aggregate(filtered), regionCounts: prepared.regionCounts };
  self.postMessage(response);
};
