"use client";

import uPlot from "uplot";
import "uplot/dist/uPlot.min.css";
import { useEffect, useRef } from "react";
import type { Interval } from "@/lib/stats/ranges";

export interface ChartPoint {
  bucket: string;
  pageviews: number;
  visitors: number;
}

function toSeconds(bucket: string, interval: Interval): number {
  const iso = interval === "hour" ? bucket : `${bucket}T00:00:00Z`;
  return Math.floor(Date.parse(iso) / 1000);
}

export function TimeseriesChart({
  points,
  interval,
}: {
  points: ChartPoint[];
  interval: Interval;
}) {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;

    const styles = getComputedStyle(document.documentElement);
    const token = (name: string) => styles.getPropertyValue(name).trim();

    const xs = points.map((p) => toSeconds(p.bucket, interval));
    const pv = points.map((p) => p.pageviews);
    const vs = points.map((p) => p.visitors);

    const options: uPlot.Options = {
      width: el.clientWidth || 600,
      height: 280,
      cursor: { points: { size: 8 } },
      legend: { show: true },
      scales: {
        x: { time: true },
        y: { range: (_u, _min, max) => [0, max <= 0 ? 1 : max] },
      },
      axes: [
        {
          stroke: token("--color-axis-ink"),
          grid: { stroke: token("--color-grid"), width: 1 },
          ticks: { stroke: token("--color-grid") },
        },
        {
          stroke: token("--color-axis-ink"),
          grid: { stroke: token("--color-grid"), width: 1 },
          ticks: { stroke: token("--color-grid") },
        },
      ],
      series: [
        {},
        {
          label: "Pageviews",
          stroke: token("--color-series-1"),
          width: 2,
          points: { show: false },
        },
        {
          label: "Visitors",
          stroke: token("--color-series-2"),
          width: 2,
          points: { show: false },
        },
      ],
    };

    const plot = new uPlot(options, [xs, pv, vs], el);
    const resize = new ResizeObserver(() => {
      plot.setSize({ width: el.clientWidth, height: 280 });
    });
    resize.observe(el);

    return () => {
      resize.disconnect();
      plot.destroy();
    };
  }, [points, interval]);

  return (
    <div
      ref={ref}
      role="img"
      aria-label="Pageviews and unique visitors over time"
      className="w-full"
    />
  );
}
