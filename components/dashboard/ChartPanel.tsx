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
        <>
          <TimeseriesChart points={data.points} interval={data.interval} />
          <details className="mt-3 text-sm">
            <summary className="cursor-pointer text-fg-muted hover:text-fg focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent">
              View data as a table
            </summary>
            <div className="mt-2 max-h-64 overflow-auto">
              <table className="w-full text-left tabular-nums">
                <caption className="sr-only">
                  Pageviews and unique visitors per {data.interval}
                </caption>
                <thead>
                  <tr className="text-fg-muted">
                    <th scope="col" className="py-1 pr-4 font-medium">
                      {data.interval === "hour" ? "Hour" : "Day"}
                    </th>
                    <th scope="col" className="py-1 pr-4 font-medium">
                      Pageviews
                    </th>
                    <th scope="col" className="py-1 font-medium">
                      Visitors
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {data.points.map((p) => (
                    <tr key={p.bucket} className="text-fg">
                      <td className="py-1 pr-4">{p.bucket}</td>
                      <td className="py-1 pr-4">{p.pageviews}</td>
                      <td className="py-1">{p.visitors}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </details>
        </>
      )}
    </section>
  );
}
