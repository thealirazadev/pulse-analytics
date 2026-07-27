"use client";

import { EmptyState } from "@/components/ui/EmptyState";
import { ErrorState } from "@/components/ui/ErrorState";
import { Skeleton } from "@/components/ui/Skeleton";
import type { RangeKey } from "@/lib/stats/ranges";
import { GoalsList, type GoalRow } from "./GoalsList";
import { useResource } from "./useResource";

interface GoalsData {
  rows: GoalRow[];
  visitors: number;
}

export function GoalsPanel({
  siteId,
  range,
}: {
  siteId: string;
  range: RangeKey;
}) {
  const { data, loading, error, reload } = useResource<GoalsData>(
    `/api/stats/goals?site=${siteId}&range=${range}`,
  );

  return (
    <section
      aria-labelledby="goals"
      className="rounded-md border border-border bg-surface p-4"
    >
      <div className="mb-3 flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
        <h2 id="goals" className="text-base font-semibold">
          Goals
        </h2>
        <span className="text-xs text-fg-muted">
          completions and conversion rate (visitors: unique per day, summed)
        </span>
      </div>
      {loading ? (
        <div className="flex flex-col gap-2">
          {Array.from({ length: 4 }).map((_, i) => (
            <Skeleton key={i} className="h-9 w-full" />
          ))}
        </div>
      ) : error || !data ? (
        <ErrorState onRetry={reload} />
      ) : data.rows.length === 0 ? (
        <EmptyState
          title="No goals defined"
          hint="Register a goal for this site via the /api/goals endpoint."
        />
      ) : (
        <GoalsList rows={data.rows} />
      )}
    </section>
  );
}
