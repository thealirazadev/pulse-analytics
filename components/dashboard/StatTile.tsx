interface StatTileProps {
  label: string;
  /** Preformatted value, or null to show the "no data" em dash. */
  value: string | null;
  caption?: string;
}

export function StatTile({ label, value, caption }: StatTileProps) {
  return (
    <div className="rounded-md border border-border bg-surface p-5">
      <p className="text-sm font-medium text-fg-muted">{label}</p>
      <p className="mt-1 text-[36px] font-bold leading-tight text-fg">
        {value ?? "—"}
      </p>
      <p className="mt-1 min-h-4 text-xs text-fg-faint">
        {value === null ? "no data in this range" : (caption ?? "")}
      </p>
    </div>
  );
}
