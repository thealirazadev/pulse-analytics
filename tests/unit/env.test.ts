import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { getEnv, resetEnvCache } from "@/lib/env";

const REQUIRED = {
  DATABASE_URL: "postgres://u:p@localhost:5432/db",
  SESSION_SECRET: "a".repeat(64),
  ADMIN_EMAIL: "admin@example.com",
  ADMIN_PASSWORD_HASH: "aa:bb",
  CRON_SECRET: "secret",
  APP_URL: "https://pulse.example.com",
};

describe("getEnv", () => {
  const original = { ...process.env };

  beforeEach(() => {
    resetEnvCache();
    for (const key of Object.keys(REQUIRED)) delete process.env[key];
    delete process.env.GEOIP_DB_PATH;
  });

  afterEach(() => {
    process.env = { ...original };
    resetEnvCache();
  });

  it("returns all values when present and defaults geo path to empty", () => {
    Object.assign(process.env, REQUIRED);
    const env = getEnv();
    expect(env.DATABASE_URL).toBe(REQUIRED.DATABASE_URL);
    expect(env.APP_URL).toBe(REQUIRED.APP_URL);
    expect(env.GEOIP_DB_PATH).toBe("");
  });

  it("fails fast naming every missing required variable", () => {
    Object.assign(process.env, REQUIRED);
    delete process.env.DATABASE_URL;
    delete process.env.CRON_SECRET;
    expect(() => getEnv()).toThrow(/DATABASE_URL/);
    expect(() => getEnv()).toThrow(/CRON_SECRET/);
  });

  it("treats a blank value as missing", () => {
    Object.assign(process.env, REQUIRED);
    process.env.SESSION_SECRET = "   ";
    expect(() => getEnv()).toThrow(/SESSION_SECRET/);
  });
});
