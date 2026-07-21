/**
 * Ingest-throughput benchmark: fire N POST /api/collect requests spread across
 * a pool of registered sites (so the per-site rate limiter is not the ceiling)
 * and report requests/sec plus the HTTP status breakdown. Run `seed.mjs
 * --sites <S>` first, and have the app serving at --url.
 *
 * Usage:
 *   node scripts/bench/ingest.mjs --url http://localhost:3999 \
 *        --requests 20000 --concurrency 64 --sites 200
 */
const UA =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 " +
  "(KHTML, like Gecko) Chrome/120.0 Safari/537.36";

function arg(name, fallback) {
  const i = process.argv.indexOf(`--${name}`);
  return i !== -1 && process.argv[i + 1] ? process.argv[i + 1] : fallback;
}

const base = arg("url", "http://localhost:3999");
const total = Number(arg("requests", "20000"));
const concurrency = Number(arg("concurrency", "64"));
const siteCount = Number(arg("sites", "200"));
const collect = `${base}/api/collect`;

const statuses = new Map();
let sent = 0;

async function one(i) {
  const s = i % siteCount;
  const sid = `pk_bench${String(s).padStart(3, "0")}`;
  const body = JSON.stringify({ sid, p: `/p${i % 8}`, r: null });
  try {
    const res = await fetch(collect, {
      method: "POST",
      headers: {
        "content-type": "text/plain",
        origin: `https://bench${s}.example`,
        "user-agent": UA,
      },
      body,
    });
    statuses.set(res.status, (statuses.get(res.status) ?? 0) + 1);
  } catch {
    statuses.set("error", (statuses.get("error") ?? 0) + 1);
  }
}

async function worker() {
  while (true) {
    const i = sent++;
    if (i >= total) return;
    await one(i);
  }
}

const t0 = Date.now();
await Promise.all(Array.from({ length: concurrency }, worker));
const secs = (Date.now() - t0) / 1000;

const ok = statuses.get(202) ?? 0;
console.log(
  `\ningest: ${total} requests, concurrency ${concurrency}, ${siteCount} sites`,
);
console.log(`elapsed: ${secs.toFixed(2)}s`);
console.log(
  `throughput: ${(total / secs).toFixed(0)} req/s (accepted 202: ${ok})`,
);
console.log("status breakdown:", Object.fromEntries(statuses));
