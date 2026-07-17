"use client";

import { EmptyState } from "@/components/ui/EmptyState";
import { ErrorState } from "@/components/ui/ErrorState";
import { Skeleton } from "@/components/ui/Skeleton";
import type { Dimension, RangeKey } from "@/lib/stats/ranges";
import { BreakdownList, type BreakdownRow } from "./BreakdownList";
import { useResource } from "./useResource";

interface BreakdownData {
  rows: BreakdownRow[];
}

export function BreakdownPanel({
  siteId,
  range,
  dimension,
  title,
}: {
  siteId: string;
  range: RangeKey;
  dimension: Dimension;
  title: string;
}) {
  const { data, loading, error, reload } = useResource<BreakdownData>(
    `/api/stats/breakdown?site=${siteId}&range=${range}&dimension=${dimension}&limit=10`,
  );
  const headingId = `breakdown-${dimension}`;

  return (
    <section
      aria-labelledby={headingId}
      className="rounded-md border border-border bg-surface p-4"
    >
      <h2 id={headingId} className="mb-3 text-base font-semibold">
        {title}
      </h2>
      {loading ? (
        <div className="flex flex-col gap-2">
          {Array.from({ length: 5 }).map((_, i) => (
            <Skeleton key={i} className="h-7 w-full" />
          ))}
        </div>
      ) : error || !data ? (
        <ErrorState onRetry={reload} />
      ) : data.rows.length === 0 ? (
        <EmptyState title="Nothing recorded in this range" />
      ) : (
        <BreakdownList rows={data.rows} />
      )}
    </section>
  );
}
