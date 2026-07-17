"use client";

import { useRouter } from "next/navigation";
import type { RangeKey } from "@/lib/stats/ranges";

export interface SiteOption {
  id: string;
  name: string;
  domain: string;
}

export function SitePicker({
  sites,
  current,
  range,
}: {
  sites: SiteOption[];
  current: string;
  range: RangeKey;
}) {
  const router = useRouter();

  if (sites.length <= 1) {
    const only = sites[0];
    return (
      <div className="flex items-baseline gap-2 text-sm">
        <span className="font-medium text-fg">{only?.name}</span>
        <span className="text-fg-muted">{only?.domain}</span>
      </div>
    );
  }

  return (
    <select
      aria-label="Site"
      value={current}
      onChange={(e) => router.push(`/dashboard/${e.target.value}?range=${range}`)}
      className="h-10 rounded-sm border border-border bg-surface px-3 text-sm text-fg focus-visible:border-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"
    >
      {sites.map((s) => (
        <option key={s.id} value={s.id}>
          {s.name} — {s.domain}
        </option>
      ))}
    </select>
  );
}
