// PERF-BUG #6: a shared "chart utils" module that statically pulls in a large
// slice of recharts. It is imported by components that never draw a chart
// (sidebar, table), so recharts ends up in the shared layout bundle and on /about.
import {
  AreaChart,
  BarChart,
  ComposedChart,
  FunnelChart,
  LineChart,
  PieChart,
  RadarChart,
  RadialBarChart,
  Sankey,
  ScatterChart,
  Treemap,
} from "recharts";
import type { Status } from "./types";

export const CHART_REGISTRY = {
  area: { label: "Revenue trend", component: AreaChart },
  bar: { label: "Category mix", component: BarChart },
  line: { label: "Regional split", component: LineChart },
  pie: { label: "Status breakdown", component: PieChart },
  composed: { label: "Orders vs revenue", component: ComposedChart },
  scatter: { label: "Deal size scatter", component: ScatterChart },
  radar: { label: "Channel radar", component: RadarChart },
  radial: { label: "Quota attainment", component: RadialBarChart },
  funnel: { label: "Pipeline funnel", component: FunnelChart },
  treemap: { label: "Account treemap", component: Treemap },
  sankey: { label: "Revenue flow", component: Sankey },
} as const;

export type ChartKind = keyof typeof CHART_REGISTRY;

export const STATUS_COLORS: Record<Status, string> = {
  completed: "#10b981",
  pending: "#f59e0b",
  failed: "#ef4444",
  refunded: "#6366f1",
};

export const SERIES_COLORS = ["#6366f1", "#0ea5e9", "#10b981", "#f59e0b", "#ef4444", "#8b5cf6", "#14b8a6", "#f97316"];
