"use client";

import { useData } from "@/components/AppContext";
import { Hero } from "@/components/Hero";
import { ImageGrid } from "@/components/ImageGrid";
import { Skeleton } from "@/components/Skeleton";
import { TransactionsTable } from "@/components/TransactionsTable";
import dynamic from "next/dynamic";
import { useEffect } from "react";

const Charts = dynamic(() => import("@/components/Charts").then((m) => m.Charts), {
  ssr: false,
  loading: () => <Skeleton className="h-72" />,
});

const KpiCards = dynamic(() => import("@/components/KpiCards").then((m) => m.KpiCards), {
  ssr: false,
  loading: () => <Skeleton className="h-28" />,
});

export default function DashboardPage() {
  const { ready } = useData();

    useEffect(() => {
    void import("@/components/Charts");
    void import("@/components/KpiCards");
  }, [])
  
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
