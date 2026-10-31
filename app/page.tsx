"use client";

import { useData } from "@/components/AppContext";
import { Charts } from "@/components/Charts";
import { Hero } from "@/components/Hero";
import { ImageGrid } from "@/components/ImageGrid";
import { KpiCards } from "@/components/KpiCards";
import { TransactionsTable } from "@/components/TransactionsTable";

function Skeleton({ className }: { className: string }) {
  return (
    <div className={`animate-pulse rounded-xl bg-slate-200/70 ${className}`} />
  );
}

export default function DashboardPage() {
  const { ready } = useData();
  return (
    <>
      <Hero />
      {ready ? <KpiCards /> : <Skeleton className="h-28" />}
      {ready ? <Charts /> : <Skeleton className="h-72" />}
      <ImageGrid />
      {ready ? <TransactionsTable /> : <Skeleton className="h-96" />}
    </>
  );
}
