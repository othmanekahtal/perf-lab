"use client";

// PERF-BUG #6: recharts imported statically (no next/dynamic / React.lazy).
import { Line, LineChart, ResponsiveContainer } from "recharts";
import { usd } from "@/lib/compute";
import { useData } from "./AppContext";
import { memo } from "react";

export const KpiCards = memo(function KpiCards() {
  const { stats } = useData();
  const trend = stats.byMonth.slice(-12);

  const cards = [
    {
      label: "Gross volume",
      value: usd(stats.revenue),
      series: "revenue" as const,
      color: "#6366f1",
    },
    {
      label: "Transactions",
      value: stats.orders.toLocaleString(),
      series: "orders" as const,
      color: "#0ea5e9",
    },
    {
      label: "Avg order value",
      value: usd(stats.avgOrder, 2),
      series: "revenue" as const,
      color: "#10b981",
    },
    {
      label: "Refund rate",
      value: `${(stats.refundRate * 100).toFixed(1)}%`,
      series: "orders" as const,
      color: "#f59e0b",
    },
  ];

  return (
    <section className="grid grid-cols-2 gap-3 lg:grid-cols-4">
      {cards.map((card) => (
        <div
          key={card.label}
          className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm"
        >
          <p className="text-xs font-medium uppercase tracking-wide text-slate-500">
            {card.label}
          </p>
          <p className="mt-1 text-xl font-semibold text-slate-900 md:text-2xl">
            {card.value}
          </p>
          <div className="mt-2 h-10">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={trend}>
                <Line
                  type="monotone"
                  dataKey={card.series}
                  stroke={card.color}
                  strokeWidth={2}
                  dot={false}
                />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </div>
      ))}
    </section>
  );
});
