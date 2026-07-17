"use client";

import { useRouter } from "next/navigation";
import { useRef, useState, type KeyboardEvent } from "react";
import type { RangeKey } from "@/lib/stats/ranges";

const OPTIONS: ReadonlyArray<readonly [RangeKey, string]> = [
  ["today", "Today"],
  ["7d", "Last 7 days"],
  ["30d", "Last 30 days"],
  ["90d", "Last 90 days"],
];

export function RangePicker({
  siteId,
  current,
}: {
  siteId: string;
  current: RangeKey;
}) {
  const router = useRouter();
  const buttons = useRef<Array<HTMLButtonElement | null>>([]);
  const [focused, setFocused] = useState(
    Math.max(0, OPTIONS.findIndex(([k]) => k === current)),
  );

  function select(key: RangeKey) {
    router.push(`/dashboard/${siteId}?range=${key}`);
  }

  function onKeyDown(e: KeyboardEvent<HTMLButtonElement>, idx: number) {
    if (e.key === "ArrowRight" || e.key === "ArrowDown") {
      e.preventDefault();
      const next = (idx + 1) % OPTIONS.length;
      setFocused(next);
      buttons.current[next]?.focus();
    } else if (e.key === "ArrowLeft" || e.key === "ArrowUp") {
      e.preventDefault();
      const prev = (idx - 1 + OPTIONS.length) % OPTIONS.length;
      setFocused(prev);
      buttons.current[prev]?.focus();
    } else if (e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      select(OPTIONS[idx]![0]);
    }
  }

  return (
    <div
      role="radiogroup"
      aria-label="Time range"
      className="inline-flex rounded-md border border-border bg-surface p-0.5"
    >
      {OPTIONS.map(([key, label], i) => {
        const selected = key === current;
        return (
          <button
            key={key}
            ref={(el) => {
              buttons.current[i] = el;
            }}
            type="button"
            role="radio"
            aria-checked={selected}
            tabIndex={i === focused ? 0 : -1}
            onClick={() => select(key)}
            onKeyDown={(e) => onKeyDown(e, i)}
            className={`rounded-sm px-3 py-1.5 text-sm transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent ${
              selected
                ? "bg-surface-2 font-semibold text-fg"
                : "text-fg-muted hover:text-fg"
            }`}
          >
            {label}
          </button>
        );
      })}
    </div>
  );
}
