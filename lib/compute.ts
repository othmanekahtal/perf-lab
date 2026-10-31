import type {
  MonthPoint,
  RegionFilter,
  Stats,
  Status,
  Transaction,
} from "./types";

export interface PreparedData {
  rows: Transaction[]; // sorted newest first, once
  search: string[]; // search[i] = lowercase text of rows[i]
  regionCounts: Record<RegionFilter, number>; // for the sidebar, computed once
}

export function prepareTransactions(raw: Transaction[]): PreparedData {
  const rows = raw
    .map((row) => ({ row, time: Date.parse(row.date) })) // parse each date ONCE
    .sort(
      (a, b) => b.time - a.time || a.row.customer.localeCompare(b.row.customer),
    )
    .map((x) => x.row);

  const search = rows.map((row) =>
    Object.values(row)
      .map((v) => (Array.isArray(v) ? v.join(" ") : String(v)))
      .join(" ")
      .toLowerCase(),
  );

  const regionCounts: Record<RegionFilter, number> = {
    All: rows.length,
    "North America": 0,
    EMEA: 0,
    LATAM: 0,
    APAC: 0,
  };
  for (const row of rows) regionCounts[row.region]++;

  return { rows, search, regionCounts };
}

export function filterTransactions(
  { rows, search }: PreparedData,
  query: string,
  region: RegionFilter,
): Transaction[] {
  const q = query.trim().toLowerCase();
  if (!q && region === "All") return rows;
  const out: Transaction[] = [];
  for (let i = 0; i < rows.length; i++) {
    if (region !== "All" && rows[i].region !== region) continue;
    if (q && !search[i].includes(q)) continue;
    out.push(rows[i]);
  }
  return out;
}

const monthLabels = new Map<string, string>();
function monthLabel(key: string) {
  let label = monthLabels.get(key);
  if (!label) {
    label = new Date(`${key}-01T00:00:00Z`).toLocaleDateString("en-US", {
      month: "short",
      year: "2-digit",
      timeZone: "UTC",
    });
    monthLabels.set(key, label);
  }
  return label;
}

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

    const key = row.date.slice(0, 7);
    const label = monthLabel(key);
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

    categories.set(
      row.category,
      (categories.get(row.category) ?? 0) + row.amount,
    );
    statuses.set(row.status, (statuses.get(row.status) ?? 0) + 1);
    customers.set(
      row.customer,
      (customers.get(row.customer) ?? 0) + row.amount,
    );
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
  new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: digits,
  }).format(n);
