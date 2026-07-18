import { expect, test } from "@playwright/test";

/**
 * End-to-end smoke of the whole loop: log in, register a site, post beacons,
 * run the rollup job, and read the numbers back on the dashboard.
 *
 * Requires a running build (`next start`) against a fresh database and these
 * env values: ADMIN_EMAIL, ADMIN_PASSWORD_HASH (hash of E2E_ADMIN_PASSWORD),
 * and CRON_SECRET. See docs/testing.md.
 */

const EMAIL = process.env.ADMIN_EMAIL ?? "admin@example.com";
const PASSWORD = process.env.E2E_ADMIN_PASSWORD ?? "devpassword123";
const CRON_SECRET = process.env.CRON_SECRET ?? "";
const DOMAIN = `e2e-${Date.now()}.example.com`;

async function login(page: import("@playwright/test").Page, password: string) {
  await page.goto("/login");
  await page.getByLabel("Email").fill(EMAIL);
  await page.getByLabel("Password").fill(password);
  await page.getByRole("button", { name: /sign in/i }).click();
}

test("ingest to dashboard smoke", async ({ page }) => {
  await login(page, PASSWORD);
  await page.waitForURL(/\/dashboard/);

  const created = await page.request.post("/api/sites", {
    data: { domain: DOMAIN, name: "E2E Site" },
  });
  expect(created.status()).toBe(201);
  const site = (await created.json()) as { id: string };

  for (let i = 0; i < 3; i++) {
    const res = await page.request.post("/api/collect", {
      headers: {
        origin: `https://${DOMAIN}`,
        "content-type": "text/plain",
        "user-agent":
          "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 Chrome/120 Safari/537.36",
      },
      data: JSON.stringify({ sid: site.id, p: "/" }),
    });
    expect(res.status()).toBe(202);
  }

  const job = await page.request.post("/api/jobs/rollup", {
    headers: { authorization: `Bearer ${CRON_SECRET}` },
  });
  expect(job.status()).toBe(200);

  await page.goto(`/dashboard/${site.id}?range=today`);
  const main = page.getByRole("main");
  await expect(main).toContainText("Pageviews");
  await expect(main).toContainText("Top pages");
  await expect(main).toContainText("3");

  await page.getByRole("button", { name: /sign out/i }).click();
  await page.waitForURL(/\/login/);
});

test("rejects bad login and guards the dashboard", async ({ page }) => {
  await login(page, "definitely-wrong");
  await expect(page.getByText(/invalid email or password/i)).toBeVisible();

  await page.context().clearCookies();
  await page.goto("/dashboard");
  await page.waitForURL(/\/login/);
});
