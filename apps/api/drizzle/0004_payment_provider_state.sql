ALTER TABLE "payment_records" ADD COLUMN "provider_payment_id" text;--> statement-breakpoint
ALTER TABLE "payment_records" ADD COLUMN "provider_order_id" text;--> statement-breakpoint
ALTER TABLE "payment_records" ADD COLUMN "provider_status" text;--> statement-breakpoint
ALTER TABLE "payment_records" ADD COLUMN "amount" integer;--> statement-breakpoint
ALTER TABLE "payment_records" ADD COLUMN "currency" text;--> statement-breakpoint
ALTER TABLE "payment_records" ADD COLUMN "idempotency_key" text;--> statement-breakpoint
ALTER TABLE "payment_records" ADD COLUMN "provider_audit_metadata" jsonb;--> statement-breakpoint
ALTER TABLE "payment_records" ADD COLUMN "provider_raw_response_metadata" jsonb;--> statement-breakpoint
ALTER TABLE "payment_records" ADD COLUMN "provider_created_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "payment_records" ADD COLUMN "reconciled_at" timestamp with time zone;--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "payment_records_idempotency_key_unique" ON "payment_records" USING btree ("idempotency_key");