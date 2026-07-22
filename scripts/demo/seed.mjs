/**
 * Seed a demo database with realistic, obviously-synthetic analytics data so
 * the dashboard screenshots in the README look alive. Uses the postgres.js
 * driver directly (no app imports), exactly like scripts/bench/seed.mjs.
 *
 * It inserts raw pageview events across the last 30 UTC days for three
 * example.com-style sites, then aggregates them into the rollup tables using
 * the same UTC-pinned SQL semantics as lib/rollup/sql.ts (date_trunc(..,'UTC'),
 * the '' / 'ZZ' sentinels, INSERT ... ON CONFLICT DO UPDATE). Aggregating the
 * full history here is the demo equivalent of the production system's retained
 * rollups: raw events are pruned after 72h but the rollups persist, which is
 * why a real deployment can show weeks of history. The watermark is left at
 * now-72h so a subsequent real POST /api/jobs/rollup recomputes the recent days
 * from the raw that is still on hand.
 *
 * All data is synthetic: example.com/.example domains, no real personal data.
 *
 * Usage:
 *   node --env-file=.env scripts/demo/seed.mjs
 *   node --env-file=.env scripts/demo/seed.mjs --days 30
 */
import { createHash } from "node:crypto";
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

const DAYS = Number(arg("days", "30"));
const HOUR_MS = 3_600_000;
const DAY_MS = 86_400_000;

const sql = postgres(url, {
  connection: { TimeZone: "UTC" },
  onnotice: () => {},
});

/** Weighted pick: entries are [value, weight]. */
function weighted(entries) {
  const total = entries.reduce((s, e) => s + e[1], 0);
  let r = Math.random() * total;
  for (const [value, weight] of entries) {
    r -= weight;
    if (r <= 0) return value;
  }
  return entries[entries.length - 1][0];
}

// Traffic is heaviest late morning through evening, quiet overnight (UTC).
const HOUR_WEIGHTS = [
  3, 2, 2, 2, 3, 5, 8, 14, 22, 30, 36, 40, 42, 41, 38, 36, 35, 34, 33, 30, 24,
  16, 9, 5,
];

const REFERRERS = [
  [null, 40], // direct
  ["google.com", 22],
  ["x.com", 8],
  ["news.ycombinator.com", 7],
  ["github.com", 7],
  ["reddit.com", 6],
  ["bing.com", 4],
  ["duckduckgo.com", 3],
  ["linkedin.com", 3],
];

const COUNTRIES = [
  ["US", 34],
  ["GB", 12],
  ["DE", 10],
  ["IN", 9],
  ["FR", 7],
  ["CA", 6],
  ["BR", 5],
  ["AU", 5],
  ["NL", 4],
  ["JP", 4],
  ["SE", 2],
  ["ES", 2],
];

const DEVICES = [
  ["desktop", 56],
  ["mobile", 37],
  ["tablet", 7],
];

const SITES = [
  {
    publicId: "pk_a1b2c3d4",
    domain: "northwind.example.com",
    name: "Northwind Store",
    dailyBase: 820,
    weekendFactor: 0.72,
    paths: [
      ["/", 28],
      ["/products", 16],
      ["/products/aeron-chair", 10],
      ["/products/standing-desk", 8],
      ["/products/desk-lamp", 6],
      ["/pricing", 7],
      ["/cart", 8],
      ["/checkout", 5],
      ["/about", 6],
      ["/contact", 3],
      ["/blog/spring-sale", 3],
    ],
  },
  {
    publicId: "pk_e5f6a7b8",
    domain: "blog.acme.example",
    name: "Acme Engineering Blog",
    dailyBase: 430,
    weekendFactor: 1.08,
    paths: [
      ["/", 20],
      ["/posts/scaling-postgres-to-1m-writes", 16],
      ["/posts/cookieless-analytics", 13],
      ["/posts/observability-101", 11],
      ["/posts/rust-vs-go-for-services", 10],
      ["/tags/engineering", 8],
      ["/archive", 6],
      ["/about", 6],
      ["/newsletter", 10],
    ],
  },
  {
    publicId: "pk_c9d0e1f2",
    domain: "docs.contoso.example",
    name: "Contoso Docs",
    dailyBase: 250,
    weekendFactor: 0.65,
    paths: [
      ["/", 18],
      ["/docs/getting-started", 18],
      ["/docs/api-reference", 16],
      ["/docs/cli", 12],
      ["/docs/webhooks", 10],
      ["/docs/faq", 10],
      ["/guides/quickstart", 10],
      ["/changelog", 6],
    ],
  },
];

/** Stable 128-bit hex string standing in for a daily salted visitor hash. */
function visitorHash(siteId, dayIndex, visitorIndex) {
  return createHash("sha256")
    .update(`${siteId}:${dayIndex}:${visitorIndex}`)
    .digest("hex")
    .slice(0, 32);
}

async function ensureSites() {
  const ids = new Map();
  for (const s of SITES) {
    const rows = await sql`
      INSERT INTO site (public_id, domain, name, verified_at)
      VALUES (${s.publicId}, ${s.domain}, ${s.name}, now())
      ON CONFLICT (public_id) DO UPDATE
        SET domain = EXCLUDED.domain, name = EXCLUDED.name, verified_at = now()
      RETURNING id
    `;
    ids.set(s.publicId, rows[0].id);
  }
  return ids;
}

function buildEvents(site, siteId, now) {
  const events = [];
  const todayUtc = Math.floor(now / DAY_MS) * DAY_MS;

  for (let d = DAYS - 1; d >= 0; d--) {
    const dayStart = todayUtc - d * DAY_MS;
    const dow = new Date(dayStart).getUTCDay();
    const weekend = dow === 0 || dow === 6 ? site.weekendFactor : 1;
    // Mild upward trend toward the present so the chart reads as growth.
    const trend = 1 + (DAYS - 1 - d) * 0.006;
    const noise = 0.85 + Math.random() * 0.3;
    let pv = Math.round(site.dailyBase * weekend * trend * noise);

    // Today is only partial — scale by the fraction of the day elapsed.
    if (d === 0) {
      const elapsed = (now - dayStart) / DAY_MS;
      pv = Math.round(pv * Math.max(0.05, elapsed));
    }

    const poolSize = Math.max(1, Math.round(pv * 0.45));

    for (let i = 0; i < pv; i++) {
      const hour = Number(weighted(HOUR_WEIGHTS.map((w, h) => [h, w])));
      let ts = dayStart + hour * HOUR_MS + Math.floor(Math.random() * HOUR_MS);
      if (ts > now) ts = now - Math.floor(Math.random() * HOUR_MS);
      events.push([
        siteId,
        new Date(ts).toISOString(),
        weighted(site.paths),
        weighted(REFERRERS),
        weighted(COUNTRIES),
        weighted(DEVICES),
        visitorHash(siteId, d, Math.floor(Math.random() * poolSize)),
      ]);
    }
  }
  return events;
}

async function insertEvents(events) {
  const CHUNK = 2000;
  for (let i = 0; i < events.length; i += CHUNK) {
    const chunk = events.slice(i, i + CHUNK);
    await sql`
      INSERT INTO event_raw ${sql(
        chunk.map((e) => ({
          site_id: e[0],
          ts: e[1],
          path: e[2],
          referrer_host: e[3],
          country: e[4],
          device: e[5],
          visitor_hash: e[6],
        })),
      )}
    `;
  }
}

/**
 * Aggregate every raw event into the rollup tables. Same UTC-pinned SQL and
 * sentinels as lib/rollup/sql.ts, but grouped over the whole history at once
 * instead of one bucket/day per call.
 */
async function aggregateAll() {
  await sql`
    INSERT INTO rollup_hourly (site_id, bucket, pageviews, visitors)
    SELECT site_id, date_trunc('hour', ts, 'UTC'), count(*)::int,
           count(DISTINCT visitor_hash)::int
    FROM event_raw
    GROUP BY site_id, date_trunc('hour', ts, 'UTC')
    ON CONFLICT (site_id, bucket)
      DO UPDATE SET pageviews = EXCLUDED.pageviews, visitors = EXCLUDED.visitors
  `;
  await sql`
    INSERT INTO rollup_daily (site_id, day, pageviews, visitors)
    SELECT site_id, date_trunc('day', ts, 'UTC')::date, count(*)::int,
           count(DISTINCT visitor_hash)::int
    FROM event_raw
    GROUP BY site_id, date_trunc('day', ts, 'UTC')
    ON CONFLICT (site_id, day)
      DO UPDATE SET pageviews = EXCLUDED.pageviews, visitors = EXCLUDED.visitors
  `;
  await sql`
    INSERT INTO rollup_page_daily (site_id, day, path, pageviews, visitors)
    SELECT site_id, date_trunc('day', ts, 'UTC')::date, path, count(*)::int,
           count(DISTINCT visitor_hash)::int
    FROM event_raw
    GROUP BY site_id, date_trunc('day', ts, 'UTC'), path
    ON CONFLICT (site_id, day, path)
      DO UPDATE SET pageviews = EXCLUDED.pageviews, visitors = EXCLUDED.visitors
  `;
  await sql`
    INSERT INTO rollup_referrer_daily (site_id, day, referrer_host, pageviews, visitors)
    SELECT site_id, date_trunc('day', ts, 'UTC')::date, coalesce(referrer_host, ''),
           count(*)::int, count(DISTINCT visitor_hash)::int
    FROM event_raw
    GROUP BY site_id, date_trunc('day', ts, 'UTC'), coalesce(referrer_host, '')
    ON CONFLICT (site_id, day, referrer_host)
      DO UPDATE SET pageviews = EXCLUDED.pageviews, visitors = EXCLUDED.visitors
  `;
  await sql`
    INSERT INTO rollup_country_daily (site_id, day, country, pageviews, visitors)
    SELECT site_id, date_trunc('day', ts, 'UTC')::date, coalesce(country, 'ZZ'),
           count(*)::int, count(DISTINCT visitor_hash)::int
    FROM event_raw
    GROUP BY site_id, date_trunc('day', ts, 'UTC'), coalesce(country, 'ZZ')
    ON CONFLICT (site_id, day, country)
      DO UPDATE SET pageviews = EXCLUDED.pageviews, visitors = EXCLUDED.visitors
  `;
  await sql`
    INSERT INTO rollup_device_daily (site_id, day, device, pageviews, visitors)
    SELECT site_id, date_trunc('day', ts, 'UTC')::date, device, count(*)::int,
           count(DISTINCT visitor_hash)::int
    FROM event_raw
    GROUP BY site_id, date_trunc('day', ts, 'UTC'), device
    ON CONFLICT (site_id, day, device)
      DO UPDATE SET pageviews = EXCLUDED.pageviews, visitors = EXCLUDED.visitors
  `;
}

async function setWatermark(now) {
  // Leave the watermark one retention window back so a real rollup run
  // recomputes the recent days (and today's hourly buckets) from raw.
  const from = new Date(
    Math.floor((now - 72 * HOUR_MS) / HOUR_MS) * HOUR_MS,
  ).toISOString();
  await sql`
    INSERT INTO rollup_watermark (id, finalized_through)
    VALUES (1, ${from}::timestamptz)
    ON CONFLICT (id) DO UPDATE SET finalized_through = ${from}::timestamptz
  `;
}

try {
  const now = Date.now();
  const t0 = now;
  const ids = await ensureSites();
  console.log(`ensured ${ids.size} sites`);

  let total = 0;
  for (const site of SITES) {
    const siteId = ids.get(site.publicId);
    const events = buildEvents(site, siteId, now);
    await insertEvents(events);
    total += events.length;
    console.log(
      `seeded ${events.length} events for ${site.domain} over ${DAYS} days`,
    );
  }

  await aggregateAll();
  await setWatermark(now);

  const [{ days }] = await sql`
    SELECT count(DISTINCT day)::int AS days FROM rollup_daily
  `;
  console.log(
    `aggregated ${total} events into rollups across ${days} days in ${(
      (Date.now() - t0) /
      1000
    ).toFixed(1)}s`,
  );
} finally {
  await sql.end({ timeout: 5 });
}
