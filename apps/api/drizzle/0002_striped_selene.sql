CREATE TABLE IF NOT EXISTS "notifications" (
	"notification_id" text PRIMARY KEY NOT NULL,
	"participant_id" text NOT NULL,
	"type" text NOT NULL,
	"title" text NOT NULL,
	"body" text NOT NULL,
	"related_application_id" text,
	"read_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "partner_invitations" (
	"invitation_id" text PRIMARY KEY NOT NULL,
	"tournament_id" text NOT NULL,
	"division_id" text,
	"application_id" text,
	"inviter_participant_id" text NOT NULL,
	"invitee_contact" text NOT NULL,
	"status" text NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "payment_records" (
	"payment_record_id" text PRIMARY KEY NOT NULL,
	"application_id" text NOT NULL,
	"participant_id" text NOT NULL,
	"amount_krw" integer NOT NULL,
	"payment_mode" text NOT NULL,
	"status" text NOT NULL,
	"operator_note" text,
	"recorded_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "support_inquiries" (
	"inquiry_id" text PRIMARY KEY NOT NULL,
	"participant_id" text,
	"application_id" text,
	"channel" text NOT NULL,
	"category" text NOT NULL,
	"subject" text NOT NULL,
	"status" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "tournament_divisions" (
	"division_id" text PRIMARY KEY NOT NULL,
	"tournament_id" text NOT NULL,
	"name" text NOT NULL,
	"skill_level" text,
	"team_type" text NOT NULL,
	"entry_fee_krw" integer NOT NULL,
	"capacity_teams" integer,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "tournaments" (
	"tournament_id" text PRIMARY KEY NOT NULL,
	"title" text NOT NULL,
	"division" text NOT NULL,
	"location" text NOT NULL,
	"starts_at" timestamp with time zone NOT NULL,
	"application_status" text NOT NULL,
	"requires_dupr" boolean DEFAULT true NOT NULL,
	"payment_mode" text NOT NULL,
	"cancellation_policy" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "tournament_applications" ADD COLUMN "division_id" text;--> statement-breakpoint
ALTER TABLE "tournament_applications" ADD COLUMN "partner_invitation_id" text;