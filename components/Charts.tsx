"use client";

// PERF-BUG #6: the whole chart surface is imported statically (no next/dynamic / React.lazy).
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Legend,
  Line,
  LineChart,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { SERIES_COLORS, STATUS_COLORS } from "@/lib/colors";
import { usd } from "@/lib/compute";
import { useData } from "./AppContext";
import { memo } from "react";

const compact = (n: number) =>
  new Intl.NumberFormat("en-US", {
    notation: "compact",
    maximumFractionDigits: 1,
  }).format(n);

function Card({
  title,
  subtitle,
  children,
}: {
  title: string;
  subtitle: string;
  children: React.ReactNode;
}) {
  return (
    <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
      <h3 className="text-sm font-semibold text-slate-900">{title}</h3>
      <p className="text-xs text-slate-500">{subtitle}</p>
      <div className="mt-3 h-64">{children}</div>
    </div>
  );
}

export const Charts = memo(function Charts() {
  const { stats } = useData();
  return (
    <section className="grid gap-4 lg:grid-cols-2">
      <Card title="Revenue over time" subtitle="Monthly gross volume">
        <ResponsiveContainer width="100%" height="100%">
          <AreaChart data={stats.byMonth}>
            <defs>
              <linearGradient id="rev" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="#6366f1" stopOpacity={0.4} />
                <stop offset="100%" stopColor="#6366f1" stopOpacity={0} />
              </linearGradient>
            </defs>
            <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
            <XAxis dataKey="label" tick={{ fontSize: 11 }} />
            <YAxis tickFormatter={compact} tick={{ fontSize: 11 }} width={48} />
            <Tooltip formatter={(v) => usd(Number(v))} />
            <Area
              type="monotone"
              dataKey="revenue"
              stroke="#6366f1"
              fill="url(#rev)"
              strokeWidth={2}
            />
          </AreaChart>
        </ResponsiveContainer>
      </Card>

      <Card title="Revenue by category" subtitle="All time, filtered">
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={stats.byCategory}>
            <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
            <XAxis
              dataKey="name"
              tick={{ fontSize: 11 }}
              interval={0}
              angle={-30}
              textAnchor="end"
              height={50}
            />
            <YAxis tickFormatter={compact} tick={{ fontSize: 11 }} width={48} />
            <Tooltip formatter={(v) => usd(Number(v))} />
            <Bar dataKey="revenue" radius={[4, 4, 0, 0]}>
              {stats.byCategory.map((c, i) => (
                <Cell
                  key={c.name}
                  fill={SERIES_COLORS[i % SERIES_COLORS.length]}
                />
              ))}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </Card>

      <Card title="Revenue by region" subtitle="Monthly, stacked by region">
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={stats.byMonth}>
            <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
            <XAxis dataKey="label" tick={{ fontSize: 11 }} />
            <YAxis tickFormatter={compact} tick={{ fontSize: 11 }} width={48} />
            <Tooltip formatter={(v) => usd(Number(v))} />
            <Legend wrapperStyle={{ fontSize: 11 }} />
            {(["North America", "EMEA", "LATAM", "APAC"] as const).map(
              (r, i) => (
                <Line
                  key={r}
                  type="monotone"
                  dataKey={r}
                  stroke={SERIES_COLORS[i]}
                  strokeWidth={2}
                  dot={false}
                />
              ),
            )}
          </LineChart>
        </ResponsiveContainer>
      </Card>

      <Card title="Status breakdown" subtitle="Share of transactions">
        <ResponsiveContainer width="100%" height="100%">
          <PieChart>
            <Tooltip />
            <Legend wrapperStyle={{ fontSize: 11 }} />
            <Pie
              data={stats.byStatus}
              dataKey="value"
              nameKey="name"
              innerRadius="45%"
              outerRadius="75%"
              paddingAngle={2}
            >
              {stats.byStatus.map((s) => (
                <Cell key={s.name} fill={STATUS_COLORS[s.name]} />
              ))}
            </Pie>
          </PieChart>
        </ResponsiveContainer>
      </Card>
    </section>
  );
});
