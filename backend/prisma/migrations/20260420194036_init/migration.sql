-- CreateEnum
CREATE TYPE "UserRole" AS ENUM ('admin', 'operator', 'viewer');

-- CreateEnum
CREATE TYPE "IcpVertical" AS ENUM ('physiotherapy', 'pilates', 'yoga', 'gym_fitness', 'bakery', 'cafe', 'other');

-- CreateEnum
CREATE TYPE "CompanySizeSignal" AS ENUM ('solo', 'micro_1_5', 'small_6_25', 'mid_26_100', 'unknown');

-- CreateEnum
CREATE TYPE "ConsentStatus" AS ENUM ('unknown', 'public_business_data_only', 'explicit_granted', 'revoked');

-- CreateEnum
CREATE TYPE "PipelineStageKind" AS ENUM ('open', 'won', 'lost');

-- CreateEnum
CREATE TYPE "LeadSource" AS ENUM ('manual', 'csv_import', 'enrichment', 'n8n_webhook', 'other');

-- CreateEnum
CREATE TYPE "LeadStatus" AS ENUM ('open', 'won', 'lost', 'archived');

-- CreateEnum
CREATE TYPE "TagKind" AS ENUM ('general', 'vertical', 'persona', 'service_interest');

-- CreateEnum
CREATE TYPE "TaggableEntityType" AS ENUM ('company', 'contact', 'lead', 'content_item');

-- CreateEnum
CREATE TYPE "ActivityKind" AS ENUM ('note', 'task', 'call_log', 'email_log', 'meeting_log');

-- CreateEnum
CREATE TYPE "ActivityEntityType" AS ENUM ('company', 'contact', 'lead');

-- CreateEnum
CREATE TYPE "EnrichmentRunStatus" AS ENUM ('queued', 'running', 'partial', 'succeeded', 'failed');

-- CreateEnum
CREATE TYPE "EnrichmentSourceType" AS ENUM ('website_scrape', 'google_places', 'lighthouse', 'whois', 'instagram_public', 'linkedin_public', 'facebook_public', 'manual');

-- CreateEnum
CREATE TYPE "EnrichmentSourceHitStatus" AS ENUM ('ok', 'blocked', 'not_found', 'error');

-- CreateEnum
CREATE TYPE "PainPointConfidence" AS ENUM ('observed', 'inferred', 'speculative');

-- CreateEnum
CREATE TYPE "DetectionOrigin" AS ENUM ('rule', 'claude', 'human');

-- CreateEnum
CREATE TYPE "ContentIdeaStatus" AS ENUM ('idea', 'in_production', 'shipped', 'archived');

-- CreateEnum
CREATE TYPE "ContentItemStatus" AS ENUM ('draft', 'in_review', 'approved', 'exported', 'archived');

-- CreateEnum
CREATE TYPE "ContentChannel" AS ENUM ('instagram', 'linkedin', 'newsletter');

-- CreateEnum
CREATE TYPE "ContentVersionGeneratedBy" AS ENUM ('claude', 'human', 'claude_edited_by_human');

-- CreateEnum
CREATE TYPE "IntegrationHealthStatus" AS ENUM ('ok', 'warn', 'error', 'unknown');

-- CreateEnum
CREATE TYPE "AiFeature" AS ENUM ('lead_enrichment_extract', 'pain_points', 'service_fit', 'outbound_prep', 'content_idea', 'content_draft', 'content_adapt', 'other');

-- CreateEnum
CREATE TYPE "JobQueueStatus" AS ENUM ('queued', 'running', 'succeeded', 'failed');

-- CreateTable
CREATE TABLE "users" (
    "id" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "password_hash" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "role" "UserRole" NOT NULL DEFAULT 'admin',
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "last_login_at" TIMESTAMPTZ(6),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "users_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "sessions" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "refresh_token_hash" TEXT NOT NULL,
    "user_agent" TEXT,
    "ip" INET,
    "expires_at" TIMESTAMPTZ(6) NOT NULL,
    "revoked_at" TIMESTAMPTZ(6),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "sessions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "audit_logs" (
    "id" BIGSERIAL NOT NULL,
    "actor_user_id" TEXT,
    "action" TEXT NOT NULL,
    "entity_type" TEXT,
    "entity_id" TEXT,
    "metadata" JSONB NOT NULL DEFAULT '{}',
    "ip" INET,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "audit_logs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "companies" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "website" TEXT,
    "domain" TEXT,
    "industry" TEXT,
    "icp_vertical" "IcpVertical",
    "country" TEXT NOT NULL DEFAULT 'ES',
    "region" TEXT,
    "city" TEXT,
    "postal_code" TEXT,
    "address" TEXT,
    "size_signal" "CompanySizeSignal",
    "phone" TEXT,
    "email" TEXT,
    "whatsapp" TEXT,
    "linkedin_url" TEXT,
    "instagram_handle" TEXT,
    "notes" TEXT,
    "created_by_id" TEXT NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,
    "deleted_at" TIMESTAMPTZ(6),

    CONSTRAINT "companies_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "contacts" (
    "id" TEXT NOT NULL,
    "company_id" TEXT,
    "first_name" TEXT NOT NULL,
    "last_name" TEXT,
    "role_title" TEXT,
    "email" TEXT,
    "phone" TEXT,
    "whatsapp" TEXT,
    "linkedin_url" TEXT,
    "is_primary" BOOLEAN NOT NULL DEFAULT false,
    "consent_status" "ConsentStatus" NOT NULL DEFAULT 'public_business_data_only',
    "created_by_id" TEXT NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,
    "deleted_at" TIMESTAMPTZ(6),

    CONSTRAINT "contacts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "pipelines" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "is_default" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "pipelines_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "pipeline_stages" (
    "id" TEXT NOT NULL,
    "pipeline_id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "order_index" INTEGER NOT NULL,
    "kind" "PipelineStageKind" NOT NULL,
    "color" TEXT,

    CONSTRAINT "pipeline_stages_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "leads" (
    "id" TEXT NOT NULL,
    "company_id" TEXT NOT NULL,
    "primary_contact_id" TEXT,
    "pipeline_id" TEXT NOT NULL,
    "stage_id" TEXT NOT NULL,
    "owner_id" TEXT NOT NULL,
    "source" "LeadSource" NOT NULL DEFAULT 'manual',
    "status" "LeadStatus" NOT NULL DEFAULT 'open',
    "priority_score" INTEGER NOT NULL DEFAULT 0,
    "priority_manual" INTEGER,
    "next_action_at" TIMESTAMPTZ(6),
    "lost_reason" TEXT,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,
    "deleted_at" TIMESTAMPTZ(6),

    CONSTRAINT "leads_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "tags" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "color" TEXT,
    "kind" "TagKind" NOT NULL DEFAULT 'general',
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "tags_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "taggables" (
    "id" TEXT NOT NULL,
    "tag_id" TEXT NOT NULL,
    "entity_type" "TaggableEntityType" NOT NULL,
    "entity_id" TEXT NOT NULL,

    CONSTRAINT "taggables_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "activities" (
    "id" TEXT NOT NULL,
    "kind" "ActivityKind" NOT NULL,
    "entity_type" "ActivityEntityType" NOT NULL,
    "entity_id" TEXT NOT NULL,
    "title" TEXT,
    "body" TEXT,
    "owner_id" TEXT NOT NULL,
    "due_at" TIMESTAMPTZ(6),
    "completed_at" TIMESTAMPTZ(6),
    "remind_at" TIMESTAMPTZ(6),
    "created_by_id" TEXT NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "activities_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "enrichment_runs" (
    "id" TEXT NOT NULL,
    "company_id" TEXT NOT NULL,
    "triggered_by_id" TEXT NOT NULL,
    "status" "EnrichmentRunStatus" NOT NULL DEFAULT 'queued',
    "input_url" TEXT,
    "started_at" TIMESTAMPTZ(6),
    "finished_at" TIMESTAMPTZ(6),
    "error_message" TEXT,
    "summary" JSONB NOT NULL DEFAULT '{}',
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "enrichment_runs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "enrichment_source_hits" (
    "id" TEXT NOT NULL,
    "run_id" TEXT NOT NULL,
    "source_type" "EnrichmentSourceType" NOT NULL,
    "source_url" TEXT,
    "status" "EnrichmentSourceHitStatus" NOT NULL,
    "fetched_at" TIMESTAMPTZ(6) NOT NULL,
    "response_excerpt" TEXT,
    "extracted" JSONB NOT NULL DEFAULT '{}',
    "error" TEXT,

    CONSTRAINT "enrichment_source_hits_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "pain_points" (
    "id" TEXT NOT NULL,
    "company_id" TEXT NOT NULL,
    "category_id" TEXT NOT NULL,
    "confidence" "PainPointConfidence" NOT NULL,
    "evidence_text" TEXT NOT NULL,
    "evidence_source_url" TEXT,
    "evidence_source_hit_id" TEXT,
    "evidence_timestamp" TIMESTAMPTZ(6) NOT NULL,
    "detected_by" "DetectionOrigin" NOT NULL,
    "human_verified" BOOLEAN NOT NULL DEFAULT false,
    "verified_by_id" TEXT,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "pain_points_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "pain_point_categories" (
    "id" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "label_es" TEXT NOT NULL,
    "description_es" TEXT NOT NULL,
    "default_service_recommendations" TEXT[],
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "pain_point_categories_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "service_lines" (
    "id" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "label_es" TEXT NOT NULL,
    "description_es" TEXT NOT NULL,
    "sub_capabilities" JSONB NOT NULL DEFAULT '[]',
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "service_lines_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "service_fit_recommendations" (
    "id" TEXT NOT NULL,
    "company_id" TEXT NOT NULL,
    "service_line_id" TEXT NOT NULL,
    "triggering_signals" TEXT[],
    "rationale_es" TEXT NOT NULL,
    "expected_outcome_es" TEXT NOT NULL,
    "fit_score" INTEGER NOT NULL,
    "generated_by" "DetectionOrigin" NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "service_fit_recommendations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "outbound_preps" (
    "id" TEXT NOT NULL,
    "company_id" TEXT NOT NULL,
    "segment" TEXT NOT NULL,
    "likely_need" TEXT NOT NULL,
    "outreach_angle" TEXT NOT NULL,
    "value_proposition" TEXT NOT NULL,
    "service_pitch" TEXT NOT NULL,
    "tone_guidance" TEXT NOT NULL,
    "priority_score" INTEGER NOT NULL,
    "sdr_notes" TEXT,
    "last_generated_at" TIMESTAMPTZ(6) NOT NULL,
    "last_generated_by_id" TEXT,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "outbound_preps_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "content_pillars" (
    "id" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "label_es" TEXT NOT NULL,
    "description_es" TEXT NOT NULL,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "content_pillars_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "content_ideas" (
    "id" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "angle" TEXT NOT NULL,
    "pillar_id" TEXT NOT NULL,
    "service_line_id" TEXT,
    "icp_vertical" "IcpVertical",
    "brief_es" TEXT NOT NULL,
    "status" "ContentIdeaStatus" NOT NULL DEFAULT 'idea',
    "created_by_id" TEXT NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "content_ideas_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "content_items" (
    "id" TEXT NOT NULL,
    "idea_id" TEXT NOT NULL,
    "channel" "ContentChannel" NOT NULL,
    "status" "ContentItemStatus" NOT NULL DEFAULT 'draft',
    "scheduled_for" DATE,
    "current_version_id" TEXT,
    "created_by_id" TEXT NOT NULL,
    "approved_by_id" TEXT,
    "approved_at" TIMESTAMPTZ(6),
    "exported_at" TIMESTAMPTZ(6),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,
    "deleted_at" TIMESTAMPTZ(6),

    CONSTRAINT "content_items_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "content_versions" (
    "id" TEXT NOT NULL,
    "item_id" TEXT NOT NULL,
    "version_number" INTEGER NOT NULL,
    "title" TEXT,
    "body" TEXT NOT NULL,
    "hooks" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "ctas" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "hashtags" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "meta" JSONB NOT NULL DEFAULT '{}',
    "generated_by" "ContentVersionGeneratedBy" NOT NULL,
    "edited_by_id" TEXT NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "content_versions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "content_approval_events" (
    "id" TEXT NOT NULL,
    "item_id" TEXT NOT NULL,
    "from_status" TEXT NOT NULL,
    "to_status" TEXT NOT NULL,
    "actor_id" TEXT NOT NULL,
    "comment" TEXT,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "content_approval_events_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "credentials" (
    "id" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "provider" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "ciphertext" BYTEA NOT NULL,
    "iv" BYTEA NOT NULL,
    "auth_tag" BYTEA NOT NULL,
    "key_version" INTEGER NOT NULL DEFAULT 1,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "last_used_at" TIMESTAMPTZ(6),
    "last_rotated_at" TIMESTAMPTZ(6),
    "created_by_id" TEXT NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "credentials_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "integration_health" (
    "id" TEXT NOT NULL,
    "credential_id" TEXT NOT NULL,
    "last_checked_at" TIMESTAMPTZ(6),
    "last_status" "IntegrationHealthStatus" NOT NULL DEFAULT 'unknown',
    "last_error" TEXT,
    "success_count_24h" INTEGER NOT NULL DEFAULT 0,
    "error_count_24h" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "integration_health_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ai_usage_logs" (
    "id" BIGSERIAL NOT NULL,
    "feature" "AiFeature" NOT NULL,
    "model" TEXT NOT NULL,
    "input_tokens" INTEGER NOT NULL,
    "output_tokens" INTEGER NOT NULL,
    "cache_creation_input_tokens" INTEGER NOT NULL DEFAULT 0,
    "cache_read_input_tokens" INTEGER NOT NULL DEFAULT 0,
    "estimated_cost_usd" DECIMAL(10,6) NOT NULL,
    "entity_type" TEXT,
    "entity_id" TEXT,
    "user_id" TEXT,
    "request_id" TEXT,
    "latency_ms" INTEGER NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ai_usage_logs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "external_api_usage_logs" (
    "id" BIGSERIAL NOT NULL,
    "provider" TEXT NOT NULL,
    "endpoint" TEXT NOT NULL,
    "units_consumed" INTEGER NOT NULL,
    "estimated_cost_usd" DECIMAL(10,6) NOT NULL,
    "entity_type" TEXT,
    "entity_id" TEXT,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "external_api_usage_logs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "jobs" (
    "id" TEXT NOT NULL,
    "queue" TEXT NOT NULL,
    "status" "JobQueueStatus" NOT NULL DEFAULT 'queued',
    "payload" JSONB NOT NULL DEFAULT '{}',
    "result" JSONB,
    "error" TEXT,
    "started_at" TIMESTAMPTZ(6),
    "finished_at" TIMESTAMPTZ(6),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "jobs_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "users_email_key" ON "users"("email");

-- CreateIndex
CREATE INDEX "users_email_idx" ON "users"("email");

-- CreateIndex
CREATE INDEX "sessions_user_id_idx" ON "sessions"("user_id");

-- CreateIndex
CREATE INDEX "sessions_expires_at_idx" ON "sessions"("expires_at");

-- CreateIndex
CREATE INDEX "audit_logs_created_at_idx" ON "audit_logs"("created_at" DESC);

-- CreateIndex
CREATE INDEX "audit_logs_actor_user_id_idx" ON "audit_logs"("actor_user_id");

-- CreateIndex
CREATE INDEX "audit_logs_entity_type_entity_id_idx" ON "audit_logs"("entity_type", "entity_id");

-- CreateIndex
CREATE UNIQUE INDEX "companies_domain_key" ON "companies"("domain");

-- CreateIndex
CREATE INDEX "companies_domain_idx" ON "companies"("domain");

-- CreateIndex
CREATE INDEX "companies_icp_vertical_idx" ON "companies"("icp_vertical");

-- CreateIndex
CREATE INDEX "companies_city_idx" ON "companies"("city");

-- CreateIndex
CREATE INDEX "companies_deleted_at_idx" ON "companies"("deleted_at");

-- CreateIndex
CREATE INDEX "contacts_company_id_idx" ON "contacts"("company_id");

-- CreateIndex
CREATE INDEX "contacts_email_idx" ON "contacts"("email");

-- CreateIndex
CREATE UNIQUE INDEX "pipeline_stages_pipeline_id_order_index_key" ON "pipeline_stages"("pipeline_id", "order_index");

-- CreateIndex
CREATE INDEX "leads_stage_id_priority_score_idx" ON "leads"("stage_id", "priority_score" DESC);

-- CreateIndex
CREATE INDEX "leads_owner_id_idx" ON "leads"("owner_id");

-- CreateIndex
CREATE INDEX "leads_status_idx" ON "leads"("status");

-- CreateIndex
CREATE INDEX "leads_company_id_idx" ON "leads"("company_id");

-- CreateIndex
CREATE INDEX "leads_deleted_at_idx" ON "leads"("deleted_at");

-- CreateIndex
CREATE UNIQUE INDEX "tags_name_key" ON "tags"("name");

-- CreateIndex
CREATE INDEX "taggables_entity_type_entity_id_idx" ON "taggables"("entity_type", "entity_id");

-- CreateIndex
CREATE UNIQUE INDEX "taggables_tag_id_entity_type_entity_id_key" ON "taggables"("tag_id", "entity_type", "entity_id");

-- CreateIndex
CREATE INDEX "activities_entity_type_entity_id_due_at_idx" ON "activities"("entity_type", "entity_id", "due_at");

-- CreateIndex
CREATE INDEX "activities_owner_id_idx" ON "activities"("owner_id");

-- CreateIndex
CREATE INDEX "activities_due_at_idx" ON "activities"("due_at");

-- CreateIndex
CREATE INDEX "enrichment_runs_company_id_idx" ON "enrichment_runs"("company_id");

-- CreateIndex
CREATE INDEX "enrichment_runs_status_idx" ON "enrichment_runs"("status");

-- CreateIndex
CREATE INDEX "enrichment_runs_created_at_idx" ON "enrichment_runs"("created_at" DESC);

-- CreateIndex
CREATE INDEX "enrichment_source_hits_run_id_idx" ON "enrichment_source_hits"("run_id");

-- CreateIndex
CREATE INDEX "enrichment_source_hits_source_type_idx" ON "enrichment_source_hits"("source_type");

-- CreateIndex
CREATE INDEX "pain_points_company_id_confidence_idx" ON "pain_points"("company_id", "confidence");

-- CreateIndex
CREATE INDEX "pain_points_category_id_idx" ON "pain_points"("category_id");

-- CreateIndex
CREATE UNIQUE INDEX "pain_point_categories_key_key" ON "pain_point_categories"("key");

-- CreateIndex
CREATE UNIQUE INDEX "service_lines_key_key" ON "service_lines"("key");

-- CreateIndex
CREATE INDEX "service_fit_recommendations_company_id_idx" ON "service_fit_recommendations"("company_id");

-- CreateIndex
CREATE INDEX "service_fit_recommendations_service_line_id_idx" ON "service_fit_recommendations"("service_line_id");

-- CreateIndex
CREATE UNIQUE INDEX "outbound_preps_company_id_key" ON "outbound_preps"("company_id");

-- CreateIndex
CREATE UNIQUE INDEX "content_pillars_key_key" ON "content_pillars"("key");

-- CreateIndex
CREATE INDEX "content_ideas_status_idx" ON "content_ideas"("status");

-- CreateIndex
CREATE INDEX "content_ideas_pillar_id_idx" ON "content_ideas"("pillar_id");

-- CreateIndex
CREATE INDEX "content_ideas_icp_vertical_idx" ON "content_ideas"("icp_vertical");

-- CreateIndex
CREATE UNIQUE INDEX "content_items_current_version_id_key" ON "content_items"("current_version_id");

-- CreateIndex
CREATE INDEX "content_items_status_channel_scheduled_for_idx" ON "content_items"("status", "channel", "scheduled_for");

-- CreateIndex
CREATE INDEX "content_items_idea_id_idx" ON "content_items"("idea_id");

-- CreateIndex
CREATE INDEX "content_items_deleted_at_idx" ON "content_items"("deleted_at");

-- CreateIndex
CREATE UNIQUE INDEX "content_versions_item_id_version_number_key" ON "content_versions"("item_id", "version_number");

-- CreateIndex
CREATE INDEX "content_approval_events_item_id_idx" ON "content_approval_events"("item_id");

-- CreateIndex
CREATE UNIQUE INDEX "credentials_key_key" ON "credentials"("key");

-- CreateIndex
CREATE UNIQUE INDEX "integration_health_credential_id_key" ON "integration_health"("credential_id");

-- CreateIndex
CREATE INDEX "ai_usage_logs_created_at_feature_idx" ON "ai_usage_logs"("created_at", "feature");

-- CreateIndex
CREATE INDEX "ai_usage_logs_user_id_idx" ON "ai_usage_logs"("user_id");

-- CreateIndex
CREATE INDEX "external_api_usage_logs_provider_created_at_idx" ON "external_api_usage_logs"("provider", "created_at");

-- CreateIndex
CREATE INDEX "jobs_queue_status_idx" ON "jobs"("queue", "status");

-- CreateIndex
CREATE INDEX "jobs_created_at_idx" ON "jobs"("created_at" DESC);

-- AddForeignKey
ALTER TABLE "sessions" ADD CONSTRAINT "sessions_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "audit_logs" ADD CONSTRAINT "audit_logs_actor_user_id_fkey" FOREIGN KEY ("actor_user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "companies" ADD CONSTRAINT "companies_created_by_id_fkey" FOREIGN KEY ("created_by_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "contacts" ADD CONSTRAINT "contacts_company_id_fkey" FOREIGN KEY ("company_id") REFERENCES "companies"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "contacts" ADD CONSTRAINT "contacts_created_by_id_fkey" FOREIGN KEY ("created_by_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "pipeline_stages" ADD CONSTRAINT "pipeline_stages_pipeline_id_fkey" FOREIGN KEY ("pipeline_id") REFERENCES "pipelines"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "leads" ADD CONSTRAINT "leads_company_id_fkey" FOREIGN KEY ("company_id") REFERENCES "companies"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "leads" ADD CONSTRAINT "leads_primary_contact_id_fkey" FOREIGN KEY ("primary_contact_id") REFERENCES "contacts"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "leads" ADD CONSTRAINT "leads_pipeline_id_fkey" FOREIGN KEY ("pipeline_id") REFERENCES "pipelines"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "leads" ADD CONSTRAINT "leads_stage_id_fkey" FOREIGN KEY ("stage_id") REFERENCES "pipeline_stages"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "leads" ADD CONSTRAINT "leads_owner_id_fkey" FOREIGN KEY ("owner_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "taggables" ADD CONSTRAINT "taggables_tag_id_fkey" FOREIGN KEY ("tag_id") REFERENCES "tags"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "activities" ADD CONSTRAINT "activities_owner_id_fkey" FOREIGN KEY ("owner_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "activities" ADD CONSTRAINT "activities_created_by_id_fkey" FOREIGN KEY ("created_by_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "enrichment_runs" ADD CONSTRAINT "enrichment_runs_company_id_fkey" FOREIGN KEY ("company_id") REFERENCES "companies"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "enrichment_runs" ADD CONSTRAINT "enrichment_runs_triggered_by_id_fkey" FOREIGN KEY ("triggered_by_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "enrichment_source_hits" ADD CONSTRAINT "enrichment_source_hits_run_id_fkey" FOREIGN KEY ("run_id") REFERENCES "enrichment_runs"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "pain_points" ADD CONSTRAINT "pain_points_company_id_fkey" FOREIGN KEY ("company_id") REFERENCES "companies"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "pain_points" ADD CONSTRAINT "pain_points_category_id_fkey" FOREIGN KEY ("category_id") REFERENCES "pain_point_categories"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "pain_points" ADD CONSTRAINT "pain_points_evidence_source_hit_id_fkey" FOREIGN KEY ("evidence_source_hit_id") REFERENCES "enrichment_source_hits"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "pain_points" ADD CONSTRAINT "pain_points_verified_by_id_fkey" FOREIGN KEY ("verified_by_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "service_fit_recommendations" ADD CONSTRAINT "service_fit_recommendations_company_id_fkey" FOREIGN KEY ("company_id") REFERENCES "companies"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "service_fit_recommendations" ADD CONSTRAINT "service_fit_recommendations_service_line_id_fkey" FOREIGN KEY ("service_line_id") REFERENCES "service_lines"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "outbound_preps" ADD CONSTRAINT "outbound_preps_company_id_fkey" FOREIGN KEY ("company_id") REFERENCES "companies"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "outbound_preps" ADD CONSTRAINT "outbound_preps_last_generated_by_id_fkey" FOREIGN KEY ("last_generated_by_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "content_ideas" ADD CONSTRAINT "content_ideas_pillar_id_fkey" FOREIGN KEY ("pillar_id") REFERENCES "content_pillars"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "content_ideas" ADD CONSTRAINT "content_ideas_service_line_id_fkey" FOREIGN KEY ("service_line_id") REFERENCES "service_lines"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "content_ideas" ADD CONSTRAINT "content_ideas_created_by_id_fkey" FOREIGN KEY ("created_by_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "content_items" ADD CONSTRAINT "content_items_idea_id_fkey" FOREIGN KEY ("idea_id") REFERENCES "content_ideas"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "content_items" ADD CONSTRAINT "content_items_created_by_id_fkey" FOREIGN KEY ("created_by_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "content_items" ADD CONSTRAINT "content_items_approved_by_id_fkey" FOREIGN KEY ("approved_by_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "content_items" ADD CONSTRAINT "content_items_current_version_id_fkey" FOREIGN KEY ("current_version_id") REFERENCES "content_versions"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "content_versions" ADD CONSTRAINT "content_versions_item_id_fkey" FOREIGN KEY ("item_id") REFERENCES "content_items"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "content_versions" ADD CONSTRAINT "content_versions_edited_by_id_fkey" FOREIGN KEY ("edited_by_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "content_approval_events" ADD CONSTRAINT "content_approval_events_item_id_fkey" FOREIGN KEY ("item_id") REFERENCES "content_items"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "content_approval_events" ADD CONSTRAINT "content_approval_events_actor_id_fkey" FOREIGN KEY ("actor_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "credentials" ADD CONSTRAINT "credentials_created_by_id_fkey" FOREIGN KEY ("created_by_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "integration_health" ADD CONSTRAINT "integration_health_credential_id_fkey" FOREIGN KEY ("credential_id") REFERENCES "credentials"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ai_usage_logs" ADD CONSTRAINT "ai_usage_logs_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
