CREATE TABLE "provider_calls" (
	"id" text PRIMARY KEY DEFAULT gen_random_uuid()::text NOT NULL,
	"job_id" text NOT NULL,
	"page_id" text NOT NULL,
	"attempt" integer NOT NULL,
	"lease_owner" text NOT NULL,
	"started_at" timestamp with time zone DEFAULT now() NOT NULL,
	"finished_at" timestamp with time zone,
	"outcome" text DEFAULT 'running' NOT NULL,
	"model" text NOT NULL,
	"prompt_version" text NOT NULL,
	"usage" jsonb,
	"estimated_cost" jsonb,
	"error_kind" text,
	CONSTRAINT "provider_calls_lease_owner_unique" UNIQUE("lease_owner")
);
