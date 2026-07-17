"use client";

import { EmptyState } from "@/components/ui/EmptyState";
import { ErrorState } from "@/components/ui/ErrorState";
import { Skeleton } from "@/components/ui/Skeleton";
import type { Interval, RangeKey } from "@/lib/stats/ranges";
import { TimeseriesChart, type ChartPoint } from "./TimeseriesChart";
import { useResource } from "./useResource";

interface TimeseriesData {
  interval: Interval;
  points: ChartPoint[];
}

export function ChartPanel({
  siteId,
  range,
}: {
  siteId: string;
  range: RangeKey;
}) {
  const { data, loading, error, reload } = useResource<TimeseriesData>(
    `/api/stats/timeseries?site=${siteId}&range=${range}`,
  );

  const empty =
    data?.points.every((p) => p.pageviews === 0 && p.visitors === 0) ?? false;

  return (
    <section
      aria-labelledby="chart-title"
      className="rounded-md border border-border bg-surface p-4"
    >
      <h2 id="chart-title" className="mb-3 text-base font-semibold">
        Pageviews and visitors
      </h2>
      {loading ? (
        <Skeleton className="h-[280px] w-full" />
      ) : error || !data ? (
        <ErrorState onRetry={reload} />
      ) : empty ? (
        <EmptyState title="No pageviews in this range yet" />
      ) : (
        <TimeseriesChart points={data.points} interval={data.interval} />
      )}
    </section>
  );
}
