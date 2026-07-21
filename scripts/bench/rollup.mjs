/**
 * Rollup-aggregation benchmark: time one full POST /api/jobs/rollup over a
 * pre-seeded event volume. It resets the watermark back `--hours` so the run
 * recomputes every bucket covering the seeded window in a single invocation,
 * then reports the elapsed aggregation time and the run summary.
 *
 * Run `seed.mjs --events <N> --hours <H>` first. Needs DATABASE_URL (to reset
 * the watermark) and CRON_SECRET (to authorize the job).
 *
 * Usage:
 *   node --env-file=.env scripts/bench/rollup.mjs --url http://localhost:3999 --hours 24
 */
import postgres from "postgres";

function arg(name, fallback) {
  const i = process.argv.indexOf(`--${name}`);
  return i !== -1 && process.argv[i + 1] ? process.argv[i + 1] : fallback;
}

const base = arg("url", "http://localhost:3999");
const hours = Number(arg("hours", "24"));
const url = process.env.DATABASE_URL;
const secret = process.env.CRON_SECRET;
if (!url || !secret) {
  console.error(
    "DATABASE_URL and CRON_SECRET are required (use --env-file=.env).",
  );
  process.exit(1);
}

const sql = postgres(url, {
  connection: { TimeZone: "UTC" },
  onnotice: () => {},
});

try {
  const [{ count: eventCount }] =
    await sql`SELECT count(*)::int AS count FROM event_raw`;
  // Rewind the watermark so the next run reprocesses the whole seeded window.
  const from = new Date(Date.now() - hours * 3_600_000).toISOString();
  await sql`
    INSERT INTO rollup_watermark (id, finalized_through) VALUES (1, ${from}::timestamptz)
    ON CONFLICT (id) DO UPDATE SET finalized_through = ${from}::timestamptz
  `;

  const t0 = Date.now();
  const res = await fetch(`${base}/api/jobs/rollup`, {
    method: "POST",
    headers: { authorization: `Bearer ${secret}` },
  });
  const secs = (Date.now() - t0) / 1000;
  const summary = await res.json();

  console.log(
    `\nrollup: aggregated ${eventCount} raw events (window ${hours}h)`,
  );
  console.log(`elapsed: ${secs.toFixed(2)}s (http ${res.status})`);
  console.log("summary:", summary);
} finally {
  await sql.end({ timeout: 5 });
}
