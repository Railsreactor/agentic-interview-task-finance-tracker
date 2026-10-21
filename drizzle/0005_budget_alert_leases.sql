ALTER TABLE "budget_alerts" ALTER COLUMN "sent_at" DROP DEFAULT;--> statement-breakpoint
ALTER TABLE "budget_alerts" ALTER COLUMN "sent_at" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "budget_alerts" ADD COLUMN "status" text DEFAULT 'pending' NOT NULL;--> statement-breakpoint
UPDATE "budget_alerts" SET "status" = 'sent' WHERE "sent_at" IS NOT NULL;--> statement-breakpoint
ALTER TABLE "budget_alerts" ADD COLUMN "lease_until" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "budget_alerts" ADD COLUMN "updated_at" timestamp with time zone DEFAULT now() NOT NULL;