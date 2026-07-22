/**
 * Capture README screenshots of the running app with Playwright (chromium).
 *
 * Before shooting it exercises the real ingest path — POSTing a handful of live
 * beacons to /api/collect — and then runs the real aggregation job via
 * POST /api/jobs/rollup, so the numbers on screen come from the app's own
 * write/aggregate/read pipeline over the seeded database (see seed.mjs).
 *
 * Prerequisites: `node --env-file=.env scripts/demo/seed.mjs` has run against
 * the demo database, and the production server is up (`npm run start`). Reads
 * BASE_URL (default http://localhost:3005), ADMIN_EMAIL, DEMO_PASSWORD, and
 * CRON_SECRET from the environment.
 *
 * Usage:
 *   node --env-file=.env DEMO_PASSWORD=demo-password-123 scripts/demo/capture.mjs
 */
import { mkdir } from "node:fs/promises";
import { chromium } from "@playwright/test";

const BASE_URL = process.env.BASE_URL ?? "http://localhost:3005";
const EMAIL = process.env.ADMIN_EMAIL ?? "admin@example.com";
const PASSWORD = process.env.DEMO_PASSWORD ?? "demo-password-123";
const CRON_SECRET = process.env.CRON_SECRET ?? "";
const OUT_DIR = process.env.OUT_DIR ?? "scripts/demo/shots";
const PRIMARY = "pk_a1b2c3d4";
const PRIMARY_DOMAIN = "northwind.example.com";
const DESKTOP_UA =
  "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0 Safari/537.36";

const LIVE_PATHS = [
  "/",
  "/products",
  "/products/aeron-chair",
  "/pricing",
  "/cart",
  "/checkout",
  "/about",
];

/** POST a few genuine beacons through the public ingest endpoint. */
async function ingestLiveBeacons() {
  let accepted = 0;
  for (let i = 0; i < 24; i++) {
    const path = LIVE_PATHS[i % LIVE_PATHS.length];
    const res = await fetch(`${BASE_URL}/api/collect`, {
      method: "POST",
      headers: {
        "content-type": "text/plain",
        origin: `https://${PRIMARY_DOMAIN}`,
        "user-agent": DESKTOP_UA,
      },
      body: JSON.stringify({ sid: PRIMARY, p: path }),
    });
    if (res.status === 202) accepted++;
  }
  console.log(`ingest: ${accepted}/24 beacons accepted (202)`);
}

/** Run the real aggregation job. */
async function runRollup() {
  const res = await fetch(`${BASE_URL}/api/jobs/rollup`, {
    method: "POST",
    headers: { authorization: `Bearer ${CRON_SECRET}` },
  });
  const body = await res.json().catch(() => ({}));
  console.log(`rollup: http ${res.status}`, JSON.stringify(body));
}

async function newContext(browser, theme) {
  const context = await browser.newContext({
    viewport: { width: 1280, height: 800 },
    deviceScaleFactor: 1,
    colorScheme: theme === "dark" ? "dark" : "light",
  });
  // theme.js reads this before paint, so the whole session is themed.
  await context.addInitScript((t) => {
    try {
      localStorage.setItem("pulse-theme", t);
    } catch {}
  }, theme);
  return context;
}

async function login(page) {
  await page.goto(`${BASE_URL}/login`, { waitUntil: "networkidle" });
  await page.getByLabel("Email").fill(EMAIL);
  await page.getByLabel("Password").fill(PASSWORD);
  await page.getByRole("button", { name: /sign in/i }).click();
  await page.waitForURL(/\/dashboard/);
}

/** Wait for the chart canvas and the breakdown panels to have painted. */
async function waitForDashboard(page) {
  await page.waitForSelector("canvas.u-over, .uplot canvas", {
    timeout: 15000,
  });
  await page.getByRole("heading", { name: "Top pages" }).waitFor();
  await page.getByRole("heading", { name: "Countries" }).waitFor();
  // Let the bar fills and chart series settle.
  await page.waitForTimeout(900);
}

async function shoot(page, name) {
  const file = `${OUT_DIR}/${name}.png`;
  await page.screenshot({ path: file, fullPage: true });
  console.log(`shot: ${file}`);
}

async function main() {
  await mkdir(OUT_DIR, { recursive: true });

  await ingestLiveBeacons();
  await runRollup();

  const browser = await chromium.launch();
  try {
    for (const theme of ["light", "dark"]) {
      const context = await newContext(browser, theme);
      const page = await context.newPage();
      await login(page);

      // Main dashboard, 7-day range: stat tiles, time-series, all breakdowns.
      await page.goto(`${BASE_URL}/dashboard/${PRIMARY}?range=7d`, {
        waitUntil: "networkidle",
      });
      await waitForDashboard(page);
      await shoot(page, `dashboard-7d-${theme}`);

      // Today range: the hourly time-series with its diurnal curve.
      await page.goto(`${BASE_URL}/dashboard/${PRIMARY}?range=today`, {
        waitUntil: "networkidle",
      });
      await waitForDashboard(page);
      await shoot(page, `dashboard-today-${theme}`);

      // Site management: the registered sites with verified badges.
      await page.goto(`${BASE_URL}/sites`, { waitUntil: "networkidle" });
      await page.getByRole("heading", { name: "Sites" }).waitFor();
      await page.waitForTimeout(300);
      await shoot(page, `sites-${theme}`);

      // Install snippet screen.
      await page.goto(`${BASE_URL}/sites/${PRIMARY}`, {
        waitUntil: "networkidle",
      });
      await page.getByRole("heading", { name: "Install" }).waitFor();
      await page.waitForTimeout(300);
      await shoot(page, `snippet-${theme}`);

      await context.close();
    }
  } finally {
    await browser.close();
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
