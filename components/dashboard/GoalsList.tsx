export interface GoalRow {
  id: number;
  name: string;
  kind: string;
  match: string;
  completions: number;
  conversionRate: number;
}

const nf = new Intl.NumberFormat("en-US");
const pf = new Intl.NumberFormat("en-US", {
  style: "percent",
  maximumFractionDigits: 1,
});

/** Goals as proportional-bar rows: name + target on the left, completions and
 * conversion rate stacked on the right. Bars are proportional to completions. */
export function GoalsList({ rows }: { rows: GoalRow[] }) {
  const max = Math.max(1, ...rows.map((r) => r.completions));

  return (
    <ul className="flex flex-col">
      {rows.map((row) => (
        <li
          key={row.id}
          className="relative flex items-center justify-between gap-3 overflow-hidden rounded-sm px-2 py-1.5 hover:bg-surface-2"
        >
          <span
            aria-hidden="true"
            className="absolute inset-y-0 left-0 rounded-sm bg-series-1 opacity-[0.12]"
            style={{ width: `${(row.completions / max) * 100}%` }}
          />
          <span className="relative min-w-0 flex-1">
            <span className="block truncate text-sm text-fg" title={row.name}>
              {row.name}
            </span>
            <span
              className="block truncate text-xs text-fg-muted"
              title={row.match}
            >
              {row.match}
            </span>
          </span>
          <span className="relative shrink-0 text-right">
            <span className="block text-sm tabular-nums text-fg">
              {nf.format(row.completions)}
            </span>
            <span className="block text-xs tabular-nums text-fg-muted">
              {pf.format(row.conversionRate)}
            </span>
          </span>
        </li>
      ))}
    </ul>
  );
}
