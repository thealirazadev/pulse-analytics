CREATE TABLE "goal" (
	"id" serial PRIMARY KEY NOT NULL,
	"site_id" integer NOT NULL,
	"name" text NOT NULL,
	"kind" text NOT NULL,
	"match_value" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "goal_site_kind_match_uq" UNIQUE("site_id","kind","match_value")
);
--> statement-breakpoint
CREATE TABLE "rollup_goal_daily" (
	"goal_id" integer NOT NULL,
	"site_id" integer NOT NULL,
	"day" date NOT NULL,
	"completions" integer NOT NULL,
	CONSTRAINT "rollup_goal_daily_goal_id_day_pk" PRIMARY KEY("goal_id","day")
);
--> statement-breakpoint
ALTER TABLE "goal" ADD CONSTRAINT "goal_site_id_site_id_fk" FOREIGN KEY ("site_id") REFERENCES "public"."site"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "rollup_goal_daily" ADD CONSTRAINT "rollup_goal_daily_goal_id_goal_id_fk" FOREIGN KEY ("goal_id") REFERENCES "public"."goal"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "rollup_goal_daily" ADD CONSTRAINT "rollup_goal_daily_site_id_site_id_fk" FOREIGN KEY ("site_id") REFERENCES "public"."site"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "goal_site_idx" ON "goal" USING btree ("site_id");