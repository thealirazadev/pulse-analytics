CREATE TABLE "daily_salt" (
	"day" date PRIMARY KEY NOT NULL,
	"salt" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "event_raw" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"site_id" integer NOT NULL,
	"ts" timestamp with time zone DEFAULT now() NOT NULL,
	"path" text NOT NULL,
	"referrer_host" text,
	"country" char(2),
	"device" text NOT NULL,
	"visitor_hash" text NOT NULL
);
--> statement-breakpoint
CREATE TABLE "rollup_country_daily" (
	"site_id" integer NOT NULL,
	"day" date NOT NULL,
	"country" char(2) NOT NULL,
	"pageviews" integer NOT NULL,
	"visitors" integer NOT NULL,
	CONSTRAINT "rollup_country_daily_site_id_day_country_pk" PRIMARY KEY("site_id","day","country")
);
--> statement-breakpoint
CREATE TABLE "rollup_daily" (
	"site_id" integer NOT NULL,
	"day" date NOT NULL,
	"pageviews" integer NOT NULL,
	"visitors" integer NOT NULL,
	CONSTRAINT "rollup_daily_site_id_day_pk" PRIMARY KEY("site_id","day")
);
--> statement-breakpoint
CREATE TABLE "rollup_device_daily" (
	"site_id" integer NOT NULL,
	"day" date NOT NULL,
	"device" text NOT NULL,
	"pageviews" integer NOT NULL,
	"visitors" integer NOT NULL,
	CONSTRAINT "rollup_device_daily_site_id_day_device_pk" PRIMARY KEY("site_id","day","device")
);
--> statement-breakpoint
CREATE TABLE "rollup_hourly" (
	"site_id" integer NOT NULL,
	"bucket" timestamp with time zone NOT NULL,
	"pageviews" integer NOT NULL,
	"visitors" integer NOT NULL,
	CONSTRAINT "rollup_hourly_site_id_bucket_pk" PRIMARY KEY("site_id","bucket")
);
--> statement-breakpoint
CREATE TABLE "rollup_page_daily" (
	"site_id" integer NOT NULL,
	"day" date NOT NULL,
	"path" text NOT NULL,
	"pageviews" integer NOT NULL,
	"visitors" integer NOT NULL,
	CONSTRAINT "rollup_page_daily_site_id_day_path_pk" PRIMARY KEY("site_id","day","path")
);
--> statement-breakpoint
CREATE TABLE "rollup_referrer_daily" (
	"site_id" integer NOT NULL,
	"day" date NOT NULL,
	"referrer_host" text NOT NULL,
	"pageviews" integer NOT NULL,
	"visitors" integer NOT NULL,
	CONSTRAINT "rollup_referrer_daily_site_id_day_referrer_host_pk" PRIMARY KEY("site_id","day","referrer_host")
);
--> statement-breakpoint
CREATE TABLE "rollup_watermark" (
	"id" smallint PRIMARY KEY DEFAULT 1 NOT NULL,
	"finalized_through" timestamp with time zone NOT NULL,
	CONSTRAINT "watermark_single_row" CHECK ("rollup_watermark"."id" = 1)
);
--> statement-breakpoint
CREATE TABLE "site" (
	"id" serial PRIMARY KEY NOT NULL,
	"public_id" text NOT NULL,
	"domain" text NOT NULL,
	"name" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"verified_at" timestamp with time zone,
	CONSTRAINT "site_public_id_unique" UNIQUE("public_id"),
	CONSTRAINT "site_domain_unique" UNIQUE("domain")
);
--> statement-breakpoint
ALTER TABLE "event_raw" ADD CONSTRAINT "event_raw_site_id_site_id_fk" FOREIGN KEY ("site_id") REFERENCES "public"."site"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "rollup_country_daily" ADD CONSTRAINT "rollup_country_daily_site_id_site_id_fk" FOREIGN KEY ("site_id") REFERENCES "public"."site"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "rollup_daily" ADD CONSTRAINT "rollup_daily_site_id_site_id_fk" FOREIGN KEY ("site_id") REFERENCES "public"."site"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "rollup_device_daily" ADD CONSTRAINT "rollup_device_daily_site_id_site_id_fk" FOREIGN KEY ("site_id") REFERENCES "public"."site"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "rollup_hourly" ADD CONSTRAINT "rollup_hourly_site_id_site_id_fk" FOREIGN KEY ("site_id") REFERENCES "public"."site"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "rollup_page_daily" ADD CONSTRAINT "rollup_page_daily_site_id_site_id_fk" FOREIGN KEY ("site_id") REFERENCES "public"."site"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "rollup_referrer_daily" ADD CONSTRAINT "rollup_referrer_daily_site_id_site_id_fk" FOREIGN KEY ("site_id") REFERENCES "public"."site"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "event_raw_site_ts_idx" ON "event_raw" USING btree ("site_id","ts");