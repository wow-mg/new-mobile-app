CREATE TABLE IF NOT EXISTS "participant_profiles" (
	"participant_id" text PRIMARY KEY NOT NULL,
	"display_name" text NOT NULL,
	"dupr_id" text,
	"dupr_status" text NOT NULL,
	"support_channel" text NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "tournament_applications" (
	"application_id" text PRIMARY KEY NOT NULL,
	"tournament_id" text NOT NULL,
	"participant_id" text NOT NULL,
	"dupr_id" text NOT NULL,
	"status" text NOT NULL,
	"submitted_at" timestamp with time zone NOT NULL,
	"support_channel" text NOT NULL,
	"payment_status" text NOT NULL,
	"refund_policy" text NOT NULL
);
