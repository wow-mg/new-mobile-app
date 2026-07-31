CREATE TABLE IF NOT EXISTS "tournament_draft_divisions" (
	"draft_division_id" text PRIMARY KEY NOT NULL,
	"draft_id" text NOT NULL,
	"position" integer NOT NULL,
	"name" text NOT NULL,
	"skill_level" text,
	"team_type" text NOT NULL,
	"entry_fee_krw" integer NOT NULL,
	"capacity_teams" integer,
	"pool_ko_config" jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "tournament_draft_events" (
	"event_id" text PRIMARY KEY NOT NULL,
	"draft_id" text NOT NULL,
	"actor_id" text NOT NULL,
	"actor_role" text NOT NULL,
	"from_status" text,
	"to_status" text NOT NULL,
	"reason" text,
	"occurred_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "tournament_drafts" (
	"draft_id" text PRIMARY KEY NOT NULL,
	"organizer_id" text NOT NULL,
	"status" text NOT NULL,
	"title" text NOT NULL,
	"location" text NOT NULL,
	"starts_at" timestamp with time zone NOT NULL,
	"application_status" text NOT NULL,
	"requires_dupr" boolean DEFAULT true NOT NULL,
	"payment_mode" text NOT NULL,
	"cancellation_policy" text NOT NULL,
	"full_refund_cutoff_hours" integer,
	"partial_refund_cutoff_hours" integer,
	"partial_refund_percent" integer,
	"review_reason" text,
	"submitted_at" timestamp with time zone,
	"reviewed_at" timestamp with time zone,
	"approved_at" timestamp with time zone,
	"published_at" timestamp with time zone,
	"published_tournament_id" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "tournament_draft_divisions" ADD CONSTRAINT "tournament_draft_divisions_draft_id_tournament_drafts_draft_id_fk" FOREIGN KEY ("draft_id") REFERENCES "public"."tournament_drafts"("draft_id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "tournament_draft_events" ADD CONSTRAINT "tournament_draft_events_draft_id_tournament_drafts_draft_id_fk" FOREIGN KEY ("draft_id") REFERENCES "public"."tournament_drafts"("draft_id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
