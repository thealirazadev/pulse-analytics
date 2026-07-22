CREATE TABLE "custom_event_raw" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"site_id" integer NOT NULL,
	"ts" timestamp with time zone DEFAULT now() NOT NULL,
	"name" text NOT NULL
);
--> statement-breakpoint
CREATE TABLE "rollup_custom_event_daily" (
	"site_id" integer NOT NULL,
	"day" date NOT NULL,
	"name" text NOT NULL,
	"count" integer NOT NULL,
	CONSTRAINT "rollup_custom_event_daily_site_id_day_name_pk" PRIMARY KEY("site_id","day","name")
);
--> statement-breakpoint
ALTER TABLE "custom_event_raw" ADD CONSTRAINT "custom_event_raw_site_id_site_id_fk" FOREIGN KEY ("site_id") REFERENCES "public"."site"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "rollup_custom_event_daily" ADD CONSTRAINT "rollup_custom_event_daily_site_id_site_id_fk" FOREIGN KEY ("site_id") REFERENCES "public"."site"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "custom_event_raw_ts_idx" ON "custom_event_raw" USING btree ("ts");