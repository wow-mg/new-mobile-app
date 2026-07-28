CREATE TABLE IF NOT EXISTS "refund_history" (
	"refund_history_id" text PRIMARY KEY NOT NULL,
	"refund_request_id" text NOT NULL,
	"event" text NOT NULL,
	"actor_kind" text NOT NULL,
	"refund_status" text NOT NULL,
	"application_status" text NOT NULL,
	"payment_status" text NOT NULL,
	"amount_krw" integer,
	"currency" text,
	"message" text NOT NULL,
	"created_at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "refund_requests" (
	"refund_request_id" text PRIMARY KEY NOT NULL,
	"payment_record_id" text NOT NULL,
	"application_id" text NOT NULL,
	"participant_id" text NOT NULL,
	"status" text NOT NULL,
	"policy_decision" text NOT NULL,
	"policy_snapshot" jsonb NOT NULL,
	"paid_amount_krw" integer NOT NULL,
	"requested_amount_krw" integer NOT NULL,
	"approved_amount_krw" integer,
	"currency" text NOT NULL,
	"reason" text NOT NULL,
	"operator_reason" text,
	"requested_at" timestamp with time zone NOT NULL,
	"updated_at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "refund_transactions" (
	"refund_transaction_id" text PRIMARY KEY NOT NULL,
	"refund_request_id" text NOT NULL,
	"idempotency_key" text NOT NULL,
	"provider_kind" text NOT NULL,
	"status" text NOT NULL,
	"amount_krw" integer NOT NULL,
	"currency" text NOT NULL,
	"provider_reference" text,
	"created_at" timestamp with time zone NOT NULL,
	"updated_at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
ALTER TABLE "tournaments" ADD COLUMN "full_refund_cutoff_hours" integer;--> statement-breakpoint
ALTER TABLE "tournaments" ADD COLUMN "partial_refund_cutoff_hours" integer;--> statement-breakpoint
ALTER TABLE "tournaments" ADD COLUMN "partial_refund_percent" integer;--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "refund_history" ADD CONSTRAINT "refund_history_refund_request_id_refund_requests_refund_request_id_fk" FOREIGN KEY ("refund_request_id") REFERENCES "public"."refund_requests"("refund_request_id") ON DELETE restrict ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "refund_requests" ADD CONSTRAINT "refund_requests_payment_record_id_payment_records_payment_record_id_fk" FOREIGN KEY ("payment_record_id") REFERENCES "public"."payment_records"("payment_record_id") ON DELETE restrict ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "refund_requests" ADD CONSTRAINT "refund_requests_application_id_tournament_applications_application_id_fk" FOREIGN KEY ("application_id") REFERENCES "public"."tournament_applications"("application_id") ON DELETE restrict ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "refund_requests" ADD CONSTRAINT "refund_requests_participant_id_participant_profiles_participant_id_fk" FOREIGN KEY ("participant_id") REFERENCES "public"."participant_profiles"("participant_id") ON DELETE restrict ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "refund_transactions" ADD CONSTRAINT "refund_transactions_refund_request_id_refund_requests_refund_request_id_fk" FOREIGN KEY ("refund_request_id") REFERENCES "public"."refund_requests"("refund_request_id") ON DELETE restrict ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "refund_requests_payment_record_unique" ON "refund_requests" USING btree ("payment_record_id");--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "refund_transactions_request_idempotency_unique" ON "refund_transactions" USING btree ("refund_request_id","idempotency_key");