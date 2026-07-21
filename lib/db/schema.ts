import { sql } from "drizzle-orm";
import {
  bigserial,
  char,
  check,
  date,
  index,
  integer,
  pgTable,
  primaryKey,
  serial,
  smallint,
  text,
  timestamp,
} from "drizzle-orm/pg-core";

/** A registered site. `public_id` is what the snippet and all HTTP APIs use. */
export const site = pgTable("site", {
  id: serial("id").primaryKey(),
  publicId: text("public_id").notNull().unique(),
  domain: text("domain").notNull().unique(),
  name: text("name").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
  verifiedAt: timestamp("verified_at", { withTimezone: true }),
});

/**
 * Per-UTC-day random salt. Created lazily by the day's first event and
 * destroyed once the day ends; its destruction is the cross-day
 * unlinkability guarantee.
 */
export const dailySalt = pgTable("daily_salt", {
  day: date("day").primaryKey(),
  salt: text("salt").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});

/** Write path. 72-hour retention. Contains no IP, no raw UA, no cross-day id. */
export const eventRaw = pgTable(
  "event_raw",
  {
    id: bigserial("id", { mode: "number" }).primaryKey(),
    siteId: integer("site_id")
      .notNull()
      .references(() => site.id, { onDelete: "cascade" }),
    ts: timestamp("ts", { withTimezone: true }).notNull().defaultNow(),
    path: text("path").notNull(),
    referrerHost: text("referrer_host"),
    country: char("country", { length: 2 }),
    device: text("device").notNull(),
    visitorHash: text("visitor_hash").notNull(),
  },
  (table) => [
    index("event_raw_site_ts_idx").on(table.siteId, table.ts),
    // The rollup recomputes and the retention prune filter on ts alone (all
    // sites at once), which the site-leading index cannot serve; without this
    // every hourly bucket sequentially scans the whole raw table.
    index("event_raw_ts_idx").on(table.ts),
  ],
);

/** Read path. All rollups are recompute-and-overwrite, never incremented. */
export const rollupHourly = pgTable(
  "rollup_hourly",
  {
    siteId: integer("site_id")
      .notNull()
      .references(() => site.id, { onDelete: "cascade" }),
    bucket: timestamp("bucket", { withTimezone: true }).notNull(),
    pageviews: integer("pageviews").notNull(),
    visitors: integer("visitors").notNull(),
  },
  (table) => [primaryKey({ columns: [table.siteId, table.bucket] })],
);

export const rollupDaily = pgTable(
  "rollup_daily",
  {
    siteId: integer("site_id")
      .notNull()
      .references(() => site.id, { onDelete: "cascade" }),
    day: date("day").notNull(),
    pageviews: integer("pageviews").notNull(),
    visitors: integer("visitors").notNull(),
  },
  (table) => [primaryKey({ columns: [table.siteId, table.day] })],
);

export const rollupPageDaily = pgTable(
  "rollup_page_daily",
  {
    siteId: integer("site_id")
      .notNull()
      .references(() => site.id, { onDelete: "cascade" }),
    day: date("day").notNull(),
    path: text("path").notNull(),
    pageviews: integer("pageviews").notNull(),
    visitors: integer("visitors").notNull(),
  },
  (table) => [primaryKey({ columns: [table.siteId, table.day, table.path] })],
);

export const rollupReferrerDaily = pgTable(
  "rollup_referrer_daily",
  {
    siteId: integer("site_id")
      .notNull()
      .references(() => site.id, { onDelete: "cascade" }),
    day: date("day").notNull(),
    // '' (empty string) = direct traffic
    referrerHost: text("referrer_host").notNull(),
    pageviews: integer("pageviews").notNull(),
    visitors: integer("visitors").notNull(),
  },
  (table) => [
    primaryKey({ columns: [table.siteId, table.day, table.referrerHost] }),
  ],
);

export const rollupCountryDaily = pgTable(
  "rollup_country_daily",
  {
    siteId: integer("site_id")
      .notNull()
      .references(() => site.id, { onDelete: "cascade" }),
    day: date("day").notNull(),
    // 'ZZ' = unknown
    country: char("country", { length: 2 }).notNull(),
    pageviews: integer("pageviews").notNull(),
    visitors: integer("visitors").notNull(),
  },
  (table) => [primaryKey({ columns: [table.siteId, table.day, table.country] })],
);

export const rollupDeviceDaily = pgTable(
  "rollup_device_daily",
  {
    siteId: integer("site_id")
      .notNull()
      .references(() => site.id, { onDelete: "cascade" }),
    day: date("day").notNull(),
    device: text("device").notNull(),
    pageviews: integer("pageviews").notNull(),
    visitors: integer("visitors").notNull(),
  },
  (table) => [primaryKey({ columns: [table.siteId, table.day, table.device] })],
);

/** Single-row table: every hour bucket ending <= finalized_through is final. */
export const rollupWatermark = pgTable(
  "rollup_watermark",
  {
    id: smallint("id").primaryKey().default(1),
    finalizedThrough: timestamp("finalized_through", {
      withTimezone: true,
    }).notNull(),
  },
  (table) => [check("watermark_single_row", sql`${table.id} = 1`)],
);

export type Site = typeof site.$inferSelect;
export type NewSite = typeof site.$inferInsert;
export type EventRaw = typeof eventRaw.$inferSelect;
