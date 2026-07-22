"use client";

import { EmptyState } from "@/components/ui/EmptyState";
import { ErrorState } from "@/components/ui/ErrorState";
import { Skeleton } from "@/components/ui/Skeleton";
import type { RangeKey } from "@/lib/stats/ranges";
import { CustomEventsList, type CustomEventRow } from "./CustomEventsList";
import { useResource } from "./useResource";

interface EventsData {
  rows: CustomEventRow[];
}

export function CustomEventsPanel({
  siteId,
  range,
}: {
  siteId: string;
  range: RangeKey;
}) {
  const { data, loading, error, reload } = useResource<EventsData>(
    `/api/stats/events?site=${siteId}&range=${range}&limit=10`,
  );

  return (
    <section
      aria-labelledby="custom-events"
      className="rounded-md border border-border bg-surface p-4"
    >
      <h2 id="custom-events" className="mb-3 text-base font-semibold">
        Custom events
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
        <EmptyState title="No custom events in this range" />
      ) : (
        <CustomEventsList rows={data.rows} />
      )}
    </section>
  );
}
