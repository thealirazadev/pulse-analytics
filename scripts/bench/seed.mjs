/**
 * Seed synthetic data for the benchmarks (scripts/bench/README notes in the
 * project README). Uses the postgres.js driver directly — no app imports — and
 * generates rows server-side with generate_series so seeding a large volume is
 * fast and does not stream millions of rows over the wire.
 *
 * Usage:
 *   node --env-file=.env scripts/bench/seed.mjs --events 500000 --hours 24
 *   node --env-file=.env scripts/bench/seed.mjs --sites 200          # ingest sites
 *
 * DATABASE_URL selects the target database (point it at a disposable bench DB).
 */
import postgres from "postgres";

function arg(name, fallback) {
  const i = process.argv.indexOf(`--${name}`);
  return i !== -1 && process.argv[i + 1] ? process.argv[i + 1] : fallback;
}

const url = process.env.DATABASE_URL;
if (!url) {
  console.error("DATABASE_URL is required (use --env-file=.env).");
  process.exit(1);
}

const events = Number(arg("events", "0"));
const hours = Number(arg("hours", "24"));
const sites = Number(arg("sites", "0"));
const siteId = arg("site", "pk_bench_roll");

const sql = postgres(url, { connection: { TimeZone: "UTC" }, onnotice: () => {} });

async function ensureIngestSites(n) {
  // A pool of verified sites so the per-site rate limiter is never the ingest
  // bottleneck: requests are spread across all of them during the HTTP bench.
  await sql`
    INSERT INTO site (public_id, domain, name, verified_at)
    SELECT 'pk_bench' || lpad(g::text, 3, '0'),
           'bench' || g || '.example',
           'Bench ' || g,
           now()
    FROM generate_series(0, ${n - 1}) AS g
    ON CONFLICT (public_id) DO NOTHING
  `;
  console.log(`ensured ${n} ingest sites (pk_bench000..pk_bench${String(n - 1).padStart(3, "0")})`);
}

async function seedEvents(publicId, count, spreadHours) {
  const rows = await sql`
    INSERT INTO site (public_id, domain, name, verified_at)
    VALUES (${publicId}, ${publicId + ".example"}, 'Rollup Bench', now())
    ON CONFLICT (public_id) DO UPDATE SET name = EXCLUDED.name
    RETURNING id
  `;
  const id = rows[0].id;

  const t0 = Date.now();
  // Realistic-ish cardinality: ~8 paths, a few referrers/countries/devices, and
  // roughly 40% distinct visitors within the window.
  //
  // ts ascends with the series so rows land on disk in time order, exactly as
  // append-only ingestion produces them. Seeding random timestamps would
  // destroy that physical correlation and make time-range scans look far worse
  // than they are in production.
  await sql`
    INSERT INTO event_raw (site_id, ts, path, referrer_host, country, device, visitor_hash)
    SELECT ${id},
           now() - (${spreadHours} * interval '1 hour')
                 + (g::float8 / ${count}) * (${spreadHours} * interval '1 hour'),
           '/p' || (floor(random() * 8))::int,
           (ARRAY[NULL, 'google.com', 'x.com', 'news.ycombinator.com'])[1 + floor(random() * 4)::int],
           (ARRAY['US','GB','DE','FR','IN','BR'])[1 + floor(random() * 6)::int],
           (ARRAY['desktop','mobile','tablet'])[1 + floor(random() * 3)::int],
           md5((floor(random() * ${Math.max(1, Math.floor(count * 0.4))}))::text)
    FROM generate_series(1, ${count}) AS g
  `;
  const secs = (Date.now() - t0) / 1000;
  console.log(
    `seeded ${count} events for ${publicId} across ${spreadHours}h in ${secs.toFixed(1)}s`,
  );
}

try {
  if (sites > 0) await ensureIngestSites(sites);
  if (events > 0) await seedEvents(siteId, events, hours);
  if (sites === 0 && events === 0) {
    console.log("nothing to do; pass --sites N and/or --events N");
  }
} finally {
  await sql.end({ timeout: 5 });
}
