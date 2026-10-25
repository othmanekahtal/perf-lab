import type { MonthPoint, RegionFilter, Stats, Status, Transaction } from "./types";

// PERF-BUG #2: full-text filter over every field of every row, rebuilding a
// lowercase haystack string per row on every call (i.e. every keystroke).
export function filterTransactions(rows: Transaction[], query: string, region: RegionFilter): Transaction[] {
  const q = query.trim().toLowerCase();
  const out: Transaction[] = [];
  for (const row of rows) {
    if (region !== "All" && row.region !== region) continue;
    if (q) {
      const haystack = Object.values(row)
        .map((v) => (Array.isArray(v) ? v.join(" ") : String(v)))
        .join(" ")
        .toLowerCase();
      if (!haystack.includes(q)) continue;
    }
    out.push(row);
  }
  return out;
}

// PERF-BUG #2: copies and sorts the whole array, parsing dates inside the comparator.
export function sortTransactions(rows: Transaction[]): Transaction[] {
  return [...rows].sort(
    (a, b) => new Date(b.date).getTime() - new Date(a.date).getTime() || a.customer.localeCompare(b.customer),
  );
}

// PERF-BUG #2: several aggregate passes, with locale date formatting per row.
export function aggregate(rows: Transaction[]): Stats {
  let revenue = 0;
  let refunded = 0;
  let failed = 0;
  const months = new Map<string, MonthPoint>();
  const categories = new Map<string, number>();
  const statuses = new Map<Status, number>();
  const customers = new Map<string, number>();

  for (const row of rows) {
    revenue += row.amount;
    if (row.status === "refunded") refunded++;
    if (row.status === "failed") failed++;

    const d = new Date(row.date);
    const key = row.date.slice(0, 7);
    const label = d.toLocaleDateString("en-US", { month: "short", year: "2-digit" });
    const point = months.get(key) ?? {
      key,
      label,
      revenue: 0,
      orders: 0,
      "North America": 0,
      EMEA: 0,
      LATAM: 0,
      APAC: 0,
    };
    point.revenue += row.amount;
    point.orders += 1;
    point[row.region] += row.amount;
    months.set(key, point);

    categories.set(row.category, (categories.get(row.category) ?? 0) + row.amount);
    statuses.set(row.status, (statuses.get(row.status) ?? 0) + 1);
    customers.set(row.customer, (customers.get(row.customer) ?? 0) + row.amount);
  }

  const orders = rows.length;
  return {
    revenue,
    orders,
    avgOrder: orders ? revenue / orders : 0,
    refundRate: orders ? refunded / orders : 0,
    failedRate: orders ? failed / orders : 0,
    byMonth: [...months.values()].sort((a, b) => a.key.localeCompare(b.key)),
    byCategory: [...categories.entries()]
      .map(([name, value]) => ({ name, revenue: Math.round(value) }))
      .sort((a, b) => b.revenue - a.revenue),
    byStatus: [...statuses.entries()].map(([name, value]) => ({ name, value })),
    topCustomers: [...customers.entries()]
      .map(([name, value]) => ({ name, revenue: value }))
      .sort((a, b) => b.revenue - a.revenue)
      .slice(0, 5),
  };
}

export const usd = (n: number, digits = 0) =>
  new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: digits }).format(n);
