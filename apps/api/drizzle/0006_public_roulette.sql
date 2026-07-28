CREATE TABLE IF NOT EXISTS "payment_notification_handoffs" (
	"payment_notification_handoff_id" text PRIMARY KEY NOT NULL,
	"payment_provider_event_audit_id" text NOT NULL,
	"idempotency_key" text NOT NULL,
	"payment_record_id" text NOT NULL,
	"application_id" text NOT NULL,
	"participant_id" text NOT NULL,
	"status" text NOT NULL,
	"delivery_status" text NOT NULL,
	"created_at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "payment_provider_events" (
	"payment_provider_event_audit_id" text PRIMARY KEY NOT NULL,
	"provider" text NOT NULL,
	"provider_event_id" text,
	"event_hash_version" text NOT NULL,
	"event_hash" text NOT NULL,
	"payment_record_id" text,
	"application_id" text NOT NULL,
	"provider_payment_id" text NOT NULL,
	"provider_order_id" text NOT NULL,
	"provider_status" text NOT NULL,
	"amount" integer NOT NULL,
	"currency" text NOT NULL,
	"verification_result" text NOT NULL,
	"processing_result" text NOT NULL,
	"rejection_code" text,
	"occurred_at" timestamp with time zone NOT NULL,
	"received_at" timestamp with time zone NOT NULL,
	"processed_at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "payment_notification_handoffs" ADD CONSTRAINT "payment_notification_handoffs_payment_provider_event_audit_id_payment_provider_events_payment_provider_event_audit_id_fk" FOREIGN KEY ("payment_provider_event_audit_id") REFERENCES "public"."payment_provider_events"("payment_provider_event_audit_id") ON DELETE restrict ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "payment_notification_handoffs_event_unique" ON "payment_notification_handoffs" USING btree ("payment_provider_event_audit_id");--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "payment_notification_handoffs_idempotency_unique" ON "payment_notification_handoffs" USING btree ("idempotency_key");--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "payment_provider_events_provider_event_unique" ON "payment_provider_events" USING btree ("provider","provider_event_id");--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "payment_provider_events_provider_hash_unique" ON "payment_provider_events" USING btree ("provider","event_hash_version","event_hash");