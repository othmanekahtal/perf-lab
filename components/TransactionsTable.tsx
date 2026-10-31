"use client";

import { STATUS_COLORS } from "@/lib/colors";
import { useData, useSelection, useUI } from "./AppContext";
import React, { memo } from "react";
import { useVirtualizer } from "@tanstack/react-virtual";

const MAX_ROWS = 10_000;
const dateFormatter = new Intl.DateTimeFormat("en-US", {
  dateStyle: "medium",
  timeStyle: "short",
});
const qtyFormatter = new Intl.NumberFormat("en-US");

const currencyFormatters = new Map<string, Intl.NumberFormat>();

function formatCurrency(amount: number, currency: string) {
  let formatter = currencyFormatters.get(currency);
  if (!formatter) {
    formatter = new Intl.NumberFormat("en-US", { style: "currency", currency });
    currencyFormatters.set(currency, formatter);
  }
  return formatter.format(amount);
}

export const TransactionsTable = memo(function TransactionsTable() {
  const { filtered } = useData();
  const { selectedId, setSelectedId } = useSelection();
  const { density } = useUI();
  const rows = filtered.slice(0, MAX_ROWS);
  const pad = density === "compact" ? "px-3 py-1" : "px-3 py-2";
  const parentRef = React.useRef<HTMLDivElement>(null);
  // eslint-disable-next-line react-hooks/incompatible-library
  const rowVirtualizer = useVirtualizer({
    count: rows.length,
    getScrollElement: () => parentRef.current,
    estimateSize: () => (density === "compact" ? 45 : 53),
    overscan: 10,
  });

  React.useEffect(() => {
    rowVirtualizer.measure();
  }, [density, rowVirtualizer]);

  const virtualRows = rowVirtualizer.getVirtualItems();
  const paddingTop = virtualRows.length > 0 ? virtualRows[0].start : 0;
  const paddingBottom =
    virtualRows.length > 0
      ? rowVirtualizer.getTotalSize() - virtualRows[virtualRows.length - 1].end
      : 0;
  return (
    <section className="rounded-xl border border-slate-200 bg-white shadow-sm">
      <div className="flex items-baseline justify-between gap-2 border-b border-slate-200 px-4 py-3">
        <h2 className="text-sm font-semibold text-slate-900">Transactions</h2>
        <p className="text-xs text-slate-500">
          Showing {rows.length.toLocaleString()} of{" "}
          {filtered.length.toLocaleString()}
        </p>
      </div>
      <div ref={parentRef} className="h-[70vh] overflow-auto">
        <table className="w-full min-w-[1100px] text-left text-sm">
          <thead className="sticky top-0 z-10 bg-slate-50 text-xs uppercase tracking-wide text-slate-500">
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
            {paddingTop > 0 && (
              <tr>
                <td colSpan={10} style={{ height: paddingTop }} />
              </tr>
            )}

            {virtualRows.map((virtualRow) => {
              const row = rows[virtualRow.index];
              return (
                <tr
                  key={row.id}
                  ref={rowVirtualizer.measureElement}
                  data-index={virtualRow.index} // tells the virtualizer which row this is
                  data-testid="txn-row"
                  onClick={() => setSelectedId(row.id)}
                  className={`cursor-pointer ${selectedId === row.id ? "bg-indigo-50" : "hover:bg-slate-50"}`}
                >
                  <td className={`${pad} font-mono text-xs text-slate-500`}>
                    {row.id}
                  </td>
                  <td className={`${pad} whitespace-nowrap text-slate-600`}>
                    {dateFormatter.format(new Date(row.date))}
                  </td>
                  <td className={pad}>
                    <div className="font-medium text-slate-900">
                      {row.customer}
                    </div>
                    <div className="text-xs text-slate-500">{row.email}</div>
                  </td>
                  <td className={`${pad} text-slate-700`}>{row.company}</td>
                  <td className={`${pad} text-slate-700`}>{row.category}</td>
                  <td className={`${pad} whitespace-nowrap text-slate-700`}>
                    {row.region} · {row.country}
                  </td>
                  <td className={`${pad} uppercase text-slate-500`}>
                    {row.method}
                  </td>
                  <td className={pad}>
                    <span
                      className="inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium capitalize"
                      style={{
                        backgroundColor: `${STATUS_COLORS[row.status]}1a`,
                        color: STATUS_COLORS[row.status],
                      }}
                    >
                      <span
                        className="h-1.5 w-1.5 rounded-full"
                        style={{ backgroundColor: STATUS_COLORS[row.status] }}
                      />
                      {row.status}
                    </span>
                  </td>
                  <td
                    className={`${pad} text-right tabular-nums text-slate-700`}
                  >
                    {qtyFormatter.format(row.quantity)}
                  </td>
                  <td
                    className={`${pad} text-right font-medium tabular-nums text-slate-900`}
                  >
                    {formatCurrency(row.amount, row.currency)}
                  </td>
                </tr>
              );
            })}

            {paddingBottom > 0 && (
              <tr>
                <td colSpan={10} style={{ height: paddingBottom }} />
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </section>
  );
});
