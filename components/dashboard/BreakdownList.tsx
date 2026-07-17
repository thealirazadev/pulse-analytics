export interface BreakdownRow {
  key: string;
  pageviews: number;
  visitors: number;
}

const nf = new Intl.NumberFormat("en-US");

export function BreakdownList({ rows }: { rows: BreakdownRow[] }) {
  const max = Math.max(1, ...rows.map((r) => r.pageviews));

  return (
    <ul className="flex flex-col">
      {rows.map((row) => (
        <li
          key={row.key}
          className="relative flex items-center justify-between gap-3 overflow-hidden rounded-sm px-2 py-1.5 hover:bg-surface-2"
        >
          <span
            aria-hidden="true"
            className="absolute inset-y-0 left-0 rounded-sm bg-series-1 opacity-[0.12]"
            style={{ width: `${(row.pageviews / max) * 100}%` }}
          />
          <span
            className="relative truncate text-sm text-fg"
            title={row.key}
          >
            {row.key}
          </span>
          <span className="relative text-sm tabular-nums text-fg-muted">
            {nf.format(row.pageviews)}
          </span>
        </li>
      ))}
    </ul>
  );
}
