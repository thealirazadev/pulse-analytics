"use client";

import { ErrorState } from "@/components/ui/ErrorState";
import { Skeleton } from "@/components/ui/Skeleton";
import type { RangeKey } from "@/lib/stats/ranges";
import { StatTile } from "./StatTile";
import { useResource } from "./useResource";

interface SummaryData {
  pageviews: number;
  visitors: number;
}

const nf = new Intl.NumberFormat("en-US");

export function StatTilesPanel({
  siteId,
  range,
}: {
  siteId: string;
  range: RangeKey;
}) {
  const { data, loading, error, reload } = useResource<SummaryData>(
    `/api/stats/summary?site=${siteId}&range=${range}`,
  );

  if (loading) {
    return (
      <div className="grid grid-cols-2 gap-4">
        <Skeleton className="h-[108px]" />
        <Skeleton className="h-[108px]" />
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className="rounded-md border border-border bg-surface">
        <ErrorState onRetry={reload} />
      </div>
    );
  }

  const empty = data.pageviews === 0 && data.visitors === 0;
  const multiDay = range !== "today";

  return (
    <div className="grid grid-cols-2 gap-4">
      <StatTile
        label="Pageviews"
        value={empty ? null : nf.format(data.pageviews)}
      />
      <StatTile
        label="Unique visitors"
        value={empty ? null : nf.format(data.visitors)}
        caption={multiDay ? "unique visitors per day, summed" : undefined}
      />
    </div>
  );
}
