"use client";

// PERF-BUG #6: imports the recharts-backed chart utils just for badge colors.
import { STATUS_COLORS } from "@/lib/chart-utils";
import { useAppContext } from "./AppContext";

const MAX_ROWS = 10_000;

export function TransactionsTable() {
  // PERF-BUG #5: consumes the whole context, so all rows re-render on every keystroke.
  const { filtered, selectedId, setSelectedId, density } = useAppContext();

  // PERF-BUG #1: up to 10,000 rows rendered straight into the DOM. No
  // virtualization, no pagination, and fresh Intl formatters for every cell.
  const rows = filtered.slice(0, MAX_ROWS);
  const pad = density === "compact" ? "px-3 py-1" : "px-3 py-2";

  return (
    <section className="rounded-xl border border-slate-200 bg-white shadow-sm">
      <div className="flex items-baseline justify-between gap-2 border-b border-slate-200 px-4 py-3">
        <h2 className="text-sm font-semibold text-slate-900">Transactions</h2>
        <p className="text-xs text-slate-500">
          Showing {rows.length.toLocaleString()} of {filtered.length.toLocaleString()}
        </p>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full min-w-[1100px] text-left text-sm">
          <thead className="bg-slate-50 text-xs uppercase tracking-wide text-slate-500">
            <tr>
              <th className={pad}>ID</th>
              <th className={pad}>Date</th>
              <th className={pad}>Customer</th>
              <th className={pad}>Company</th>
              <th className={pad}>Category</th>
              <th className={pad}>Region</th>
              <th className={pad}>Method</th>
              <th className={pad}>Status</th>
              <th className={`${pad} text-right`}>Qty</th>
              <th className={`${pad} text-right`}>Amount</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {rows.map((row) => (
              <tr
                key={row.id}
                data-testid="txn-row"
                onClick={() => setSelectedId(row.id)}
                className={`cursor-pointer ${selectedId === row.id ? "bg-indigo-50" : "hover:bg-slate-50"}`}
              >
                <td className={`${pad} font-mono text-xs text-slate-500`}>{row.id}</td>
                <td className={`${pad} whitespace-nowrap text-slate-600`}>
                  {new Intl.DateTimeFormat("en-US", { dateStyle: "medium", timeStyle: "short" }).format(new Date(row.date))}
                </td>
                <td className={pad}>
                  <div className="font-medium text-slate-900">{row.customer}</div>
                  <div className="text-xs text-slate-500">{row.email}</div>
                </td>
                <td className={`${pad} text-slate-700`}>{row.company}</td>
                <td className={`${pad} text-slate-700`}>{row.category}</td>
                <td className={`${pad} whitespace-nowrap text-slate-700`}>
                  {row.region} · {row.country}
                </td>
                <td className={`${pad} uppercase text-slate-500`}>{row.method}</td>
                <td className={pad}>
                  <span
                    className="inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium capitalize"
                    style={{ backgroundColor: `${STATUS_COLORS[row.status]}1a`, color: STATUS_COLORS[row.status] }}
                  >
                    <span className="h-1.5 w-1.5 rounded-full" style={{ backgroundColor: STATUS_COLORS[row.status] }} />
                    {row.status}
                  </span>
                </td>
                <td className={`${pad} text-right tabular-nums text-slate-700`}>
                  {new Intl.NumberFormat("en-US").format(row.quantity)}
                </td>
                <td className={`${pad} text-right font-medium tabular-nums text-slate-900`}>
                  {new Intl.NumberFormat("en-US", { style: "currency", currency: row.currency }).format(row.amount)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}
