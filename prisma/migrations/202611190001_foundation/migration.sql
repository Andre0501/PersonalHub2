BEGIN;
-- CreateSchema
CREATE SCHEMA IF NOT EXISTS "personalhub";

-- CreateTable
CREATE TABLE "personalhub"."users" (
    "user_id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "auth_subject" UUID,
    "email_normalized" TEXT NOT NULL,
    "role" TEXT NOT NULL,
    "display_name" TEXT NOT NULL,
    "account_status" TEXT NOT NULL DEFAULT 'ACTIVE',
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "users_pkey" PRIMARY KEY ("user_id")
);

-- CreateTable
CREATE TABLE "personalhub"."trainer_profiles" (
    "trainer_id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "user_id" UUID NOT NULL,

    CONSTRAINT "trainer_profiles_pkey" PRIMARY KEY ("trainer_id")
);

-- CreateTable
CREATE TABLE "personalhub"."student_profiles" (
    "student_id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "user_id" UUID NOT NULL,
    "share_code" UUID NOT NULL DEFAULT gen_random_uuid(),

    CONSTRAINT "student_profiles_pkey" PRIMARY KEY ("student_id")
);

-- CreateTable
CREATE TABLE "personalhub"."link_requests" (
    "request_id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "trainer_id" UUID NOT NULL,
    "student_id" UUID NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expires_at" TIMESTAMPTZ(3) NOT NULL,
    "resolved_at" TIMESTAMPTZ(3),
    "record_revision" INTEGER NOT NULL DEFAULT 1,

    CONSTRAINT "link_requests_pkey" PRIMARY KEY ("request_id")
);

-- CreateTable
CREATE TABLE "personalhub"."trainer_student_links" (
    "link_id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "trainer_id" UUID NOT NULL,
    "student_id" UUID NOT NULL,
    "origin_request_id" UUID NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'ACTIVE',
    "started_at" TIMESTAMPTZ(3) NOT NULL,
    "ended_at" TIMESTAMPTZ(3),
    "end_reason" TEXT,
    "replaced_by_link_id" UUID,

    CONSTRAINT "trainer_student_links_pkey" PRIMARY KEY ("link_id")
);

-- CreateTable
CREATE TABLE "personalhub"."consent_records" (
    "consent_record_id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "link_id" UUID NOT NULL,
    "decision" TEXT NOT NULL,
    "scope_version" TEXT NOT NULL,
    "notice_version" TEXT NOT NULL,
    "purpose" TEXT NOT NULL,
    "actor_user_id" UUID NOT NULL,
    "related_request_id" UUID,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "consent_records_pkey" PRIMARY KEY ("consent_record_id")
);

-- CreateTable
CREATE TABLE "personalhub"."exercises" (
    "exercise_id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "trainer_id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "name_normalized" TEXT NOT NULL,
    "description" TEXT,
    "exercise_type" TEXT NOT NULL,
    "default_unit" TEXT,
    "status" TEXT NOT NULL DEFAULT 'ACTIVE',
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "exercises_pkey" PRIMARY KEY ("exercise_id")
);

-- CreateTable
CREATE TABLE "personalhub"."workout_plans" (
    "plan_id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "trainer_id" UUID NOT NULL,
    "student_id" UUID NOT NULL,
    "origin_link_id" UUID NOT NULL,
    "title" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'ACTIVE',
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "workout_plans_pkey" PRIMARY KEY ("plan_id")
);

-- CreateTable
CREATE TABLE "personalhub"."workout_plan_drafts" (
    "draft_id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "plan_id" UUID NOT NULL,
    "base_version_id" UUID,
    "draft_content" JSONB NOT NULL,
    "draft_revision" INTEGER NOT NULL DEFAULT 1,
    "updated_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "workout_plan_drafts_pkey" PRIMARY KEY ("draft_id")
);

-- CreateTable
CREATE TABLE "personalhub"."workout_plan_versions" (
    "plan_version_id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "plan_id" UUID NOT NULL,
    "version_number" INTEGER NOT NULL,
    "title" TEXT NOT NULL,
    "instructions" TEXT,
    "snapshot" JSONB NOT NULL,
    "published_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "workout_plan_versions_pkey" PRIMARY KEY ("plan_version_id")
);

-- CreateTable
CREATE TABLE "personalhub"."prescribed_exercises" (
    "prescribed_exercise_id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "plan_version_id" UUID NOT NULL,
    "source_exercise_id" UUID NOT NULL,
    "position" INTEGER NOT NULL,
    "name_snapshot" TEXT NOT NULL,
    "description_snapshot" TEXT,
    "instructions" TEXT,

    CONSTRAINT "prescribed_exercises_pkey" PRIMARY KEY ("prescribed_exercise_id")
);

-- CreateTable
CREATE TABLE "personalhub"."prescribed_sets" (
    "prescribed_set_id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "prescribed_exercise_id" UUID NOT NULL,
    "position" INTEGER NOT NULL,
    "target_reps" INTEGER,
    "target_load_kg" DECIMAL(12,3),
    "target_seconds" INTEGER,
    "target_meters" DECIMAL(12,3),

    CONSTRAINT "prescribed_sets_pkey" PRIMARY KEY ("prescribed_set_id")
);

-- CreateTable
CREATE TABLE "personalhub"."workout_executions" (
    "execution_id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "student_id" UUID NOT NULL,
    "plan_version_id" UUID NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'IN_PROGRESS',
    "execution_revision" INTEGER NOT NULL DEFAULT 1,
    "started_at" TIMESTAMPTZ(3) NOT NULL,
    "finished_at" TIMESTAMPTZ(3),
    "current_revision_id" UUID,

    CONSTRAINT "workout_executions_pkey" PRIMARY KEY ("execution_id")
);

-- CreateTable
CREATE TABLE "personalhub"."exercise_executions" (
    "exercise_execution_id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "execution_id" UUID NOT NULL,
    "prescribed_exercise_id" UUID NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'NOT_STARTED',

    CONSTRAINT "exercise_executions_pkey" PRIMARY KEY ("exercise_execution_id")
);

-- CreateTable
CREATE TABLE "personalhub"."set_executions" (
    "set_execution_id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "exercise_execution_id" UUID NOT NULL,
    "prescribed_set_id" UUID NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'NOT_STARTED',
    "actual_reps" INTEGER,
    "actual_load_kg" DECIMAL(12,3),
    "actual_seconds" INTEGER,
    "actual_meters" DECIMAL(12,3),

    CONSTRAINT "set_executions_pkey" PRIMARY KEY ("set_execution_id")
);

-- CreateTable
CREATE TABLE "personalhub"."workout_revisions" (
    "revision_id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "execution_id" UUID NOT NULL,
    "revision_number" INTEGER NOT NULL,
    "previous_revision_id" UUID,
    "snapshot" JSONB NOT NULL,
    "reason" TEXT,
    "actor_user_id" UUID NOT NULL,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "workout_revisions_pkey" PRIMARY KEY ("revision_id")
);

-- CreateTable
CREATE TABLE "personalhub"."assessments" (
    "assessment_id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "student_id" UUID NOT NULL,
    "author_trainer_id" UUID NOT NULL,
    "origin_link_id" UUID NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'DRAFT',
    "title" TEXT NOT NULL,
    "assessed_at" TIMESTAMPTZ(3) NOT NULL,
    "current_revision_id" UUID,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "assessments_pkey" PRIMARY KEY ("assessment_id")
);

-- CreateTable
CREATE TABLE "personalhub"."measurement_definitions" (
    "measurement_definition_id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "value_type" TEXT NOT NULL,
    "canonical_unit" TEXT,
    "min_value" DECIMAL(12,3),
    "max_value" DECIMAL(12,3),
    "requires_method" BOOLEAN NOT NULL DEFAULT false,
    "status" TEXT NOT NULL DEFAULT 'ACTIVE',

    CONSTRAINT "measurement_definitions_pkey" PRIMARY KEY ("measurement_definition_id")
);

-- CreateTable
CREATE TABLE "personalhub"."assessment_measurements" (
    "measurement_id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "assessment_id" UUID NOT NULL,
    "measurement_definition_id" UUID NOT NULL,
    "measurement_context" TEXT NOT NULL DEFAULT '',
    "method" TEXT,
    "numeric_value" DECIMAL(12,3),
    "text_value" TEXT,
    "boolean_value" BOOLEAN,

    CONSTRAINT "assessment_measurements_pkey" PRIMARY KEY ("measurement_id")
);

-- CreateTable
CREATE TABLE "personalhub"."assessment_revisions" (
    "assessment_revision_id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "assessment_id" UUID NOT NULL,
    "revision_number" INTEGER NOT NULL,
    "previous_revision_id" UUID,
    "snapshot" JSONB NOT NULL,
    "reason" TEXT,
    "actor_user_id" UUID NOT NULL,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "assessment_revisions_pkey" PRIMARY KEY ("assessment_revision_id")
);

-- CreateTable
CREATE TABLE "personalhub"."body_weight_records" (
    "weight_record_id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "student_id" UUID NOT NULL,
    "kg" DECIMAL(6,2) NOT NULL,
    "measured_at" TIMESTAMPTZ(3) NOT NULL,
    "note" TEXT,
    "status" TEXT NOT NULL DEFAULT 'ACTIVE',
    "revision_number" INTEGER NOT NULL DEFAULT 1,
    "current_revision_id" UUID NOT NULL,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "body_weight_records_pkey" PRIMARY KEY ("weight_record_id")
);

-- CreateTable
CREATE TABLE "personalhub"."body_weight_revisions" (
    "weight_revision_id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "record_id" UUID NOT NULL,
    "revision_number" INTEGER NOT NULL,
    "previous_revision_id" UUID,
    "snapshot" JSONB NOT NULL,
    "reason" TEXT,
    "actor_user_id" UUID NOT NULL,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "body_weight_revisions_pkey" PRIMARY KEY ("weight_revision_id")
);

-- CreateTable
CREATE TABLE "personalhub"."shared_notes" (
    "note_id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "student_id" UUID NOT NULL,
    "author_trainer_id" UUID NOT NULL,
    "origin_link_id" UUID NOT NULL,
    "title" TEXT NOT NULL,
    "content" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'DRAFT',
    "current_revision_id" UUID,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "shared_notes_pkey" PRIMARY KEY ("note_id")
);

-- CreateTable
CREATE TABLE "personalhub"."shared_note_revisions" (
    "note_revision_id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "note_id" UUID NOT NULL,
    "revision_number" INTEGER NOT NULL,
    "previous_revision_id" UUID,
    "snapshot" JSONB NOT NULL,
    "reason" TEXT,
    "actor_user_id" UUID NOT NULL,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "shared_note_revisions_pkey" PRIMARY KEY ("note_revision_id")
);

-- CreateTable
CREATE TABLE "personalhub"."meals" (
    "meal_id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "student_id" UUID NOT NULL,
    "consumed_at" TIMESTAMPTZ(3) NOT NULL,
    "meal_type" TEXT,
    "note" TEXT,
    "status" TEXT NOT NULL DEFAULT 'ACTIVE',
    "current_revision_id" UUID NOT NULL,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "meals_pkey" PRIMARY KEY ("meal_id")
);

-- CreateTable
CREATE TABLE "personalhub"."meal_items" (
    "meal_item_id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "meal_id" UUID NOT NULL,
    "position" INTEGER NOT NULL,
    "description" TEXT NOT NULL,
    "quantity" DECIMAL(12,3) NOT NULL,
    "unit" TEXT NOT NULL,

    CONSTRAINT "meal_items_pkey" PRIMARY KEY ("meal_item_id")
);

-- CreateTable
CREATE TABLE "personalhub"."meal_revisions" (
    "meal_revision_id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "meal_id" UUID NOT NULL,
    "revision_number" INTEGER NOT NULL,
    "previous_revision_id" UUID,
    "snapshot" JSONB NOT NULL,
    "reason" TEXT,
    "actor_user_id" UUID NOT NULL,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "meal_revisions_pkey" PRIMARY KEY ("meal_revision_id")
);

-- CreateTable
CREATE TABLE "personalhub"."appointments" (
    "appointment_id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "trainer_id" UUID NOT NULL,
    "student_id" UUID NOT NULL,
    "link_id" UUID NOT NULL,
    "starts_at" TIMESTAMPTZ(3) NOT NULL,
    "ends_at" TIMESTAMPTZ(3) NOT NULL,
    "timezone" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'SCHEDULED',
    "status_reason" TEXT,
    "record_revision" INTEGER NOT NULL DEFAULT 1,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "appointments_pkey" PRIMARY KEY ("appointment_id")
);

-- CreateTable
CREATE TABLE "personalhub"."appointment_events" (
    "appointment_event_id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "appointment_id" UUID NOT NULL,
    "sequence" INTEGER NOT NULL,
    "operation_id" UUID NOT NULL,
    "event_type" TEXT NOT NULL,
    "previous_status" TEXT,
    "new_status" TEXT NOT NULL,
    "reason" TEXT,
    "details" JSONB,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "appointment_events_pkey" PRIMARY KEY ("appointment_event_id")
);

-- CreateTable
CREATE TABLE "personalhub"."appointment_disputes" (
    "dispute_id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "appointment_id" UUID NOT NULL,
    "student_id" UUID NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'OPEN',
    "claim" TEXT NOT NULL,
    "assigned_actor_ref" TEXT,
    "resolved_by_actor_ref" TEXT,
    "resolution_code" TEXT,
    "resolution_reason" TEXT,
    "opened_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "resolved_at" TIMESTAMPTZ(3),

    CONSTRAINT "appointment_disputes_pkey" PRIMARY KEY ("dispute_id")
);

-- CreateTable
CREATE TABLE "personalhub"."subscription_plans" (
    "subscription_plan_id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "offer_code" TEXT NOT NULL,
    "version" INTEGER NOT NULL,
    "code" TEXT NOT NULL,
    "billing_period" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'DRAFT',
    "canonical_free" BOOLEAN NOT NULL DEFAULT false,
    "price_cents" INTEGER NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'BRL',
    "effective_from" TIMESTAMPTZ(3) NOT NULL,
    "effective_until" TIMESTAMPTZ(3),

    CONSTRAINT "subscription_plans_pkey" PRIMARY KEY ("subscription_plan_id")
);

-- CreateTable
CREATE TABLE "personalhub"."plan_entitlements" (
    "entitlement_id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "plan_id" UUID NOT NULL,
    "feature_code" TEXT NOT NULL,
    "value_type" TEXT NOT NULL,
    "boolean_value" BOOLEAN,
    "integer_value" INTEGER,

    CONSTRAINT "plan_entitlements_pkey" PRIMARY KEY ("entitlement_id")
);

-- CreateTable
CREATE TABLE "personalhub"."subscriptions" (
    "subscription_id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "trainer_id" UUID NOT NULL,
    "plan_id" UUID NOT NULL,
    "status" TEXT NOT NULL,
    "is_current" BOOLEAN NOT NULL DEFAULT true,
    "started_at" TIMESTAMPTZ(3) NOT NULL,
    "ended_at" TIMESTAMPTZ(3),

    CONSTRAINT "subscriptions_pkey" PRIMARY KEY ("subscription_id")
);

-- CreateTable
CREATE TABLE "personalhub"."subscription_events" (
    "subscription_event_id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "subscription_id" UUID NOT NULL,
    "sequence" INTEGER NOT NULL,
    "operation_id" UUID NOT NULL,
    "event_type" TEXT NOT NULL,
    "provider_namespace" TEXT,
    "external_event_reference" TEXT,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "subscription_events_pkey" PRIMARY KEY ("subscription_event_id")
);

-- CreateTable
CREATE TABLE "personalhub"."audit_events" (
    "operation_id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "actor_type" TEXT NOT NULL,
    "actor_ref" TEXT NOT NULL,
    "operation_key" UUID NOT NULL,
    "operation_code" TEXT NOT NULL,
    "operation_signature" TEXT NOT NULL,
    "outcome" TEXT NOT NULL,
    "receipt" JSONB NOT NULL,
    "authority_ref" TEXT,
    "authority_version" TEXT,
    "authorization_checked_at" TIMESTAMPTZ(3),
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "audit_events_pkey" PRIMARY KEY ("operation_id")
);

-- CreateTable
CREATE TABLE "personalhub"."audit_event_subjects" (
    "audit_event_subject_id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "operation_id" UUID NOT NULL,
    "user_id" UUID NOT NULL,

    CONSTRAINT "audit_event_subjects_pkey" PRIMARY KEY ("audit_event_subject_id")
);

-- CreateTable
CREATE TABLE "personalhub"."data_subject_requests" (
    "subject_request_id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "user_id" UUID NOT NULL,
    "request_type" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'RECEIVED',
    "purpose" TEXT NOT NULL,
    "verified_at" TIMESTAMPTZ(3),
    "received_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "closed_at" TIMESTAMPTZ(3),
    "decision_reason" TEXT,

    CONSTRAINT "data_subject_requests_pkey" PRIMARY KEY ("subject_request_id")
);

-- CreateTable
CREATE TABLE "personalhub"."retention_policies" (
    "policy_id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "code" TEXT NOT NULL,
    "version" INTEGER NOT NULL,
    "category" TEXT NOT NULL,
    "purpose" TEXT NOT NULL,
    "legal_basis" TEXT NOT NULL,
    "review_condition" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "effective_from" TIMESTAMPTZ(3) NOT NULL,
    "effective_until" TIMESTAMPTZ(3),

    CONSTRAINT "retention_policies_pkey" PRIMARY KEY ("policy_id")
);

-- CreateTable
CREATE TABLE "personalhub"."data_disposition_actions" (
    "action_id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "request_id" UUID,
    "policy_id" UUID NOT NULL,
    "subject_user_id" UUID NOT NULL,
    "action_type" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "resource_type" TEXT NOT NULL,
    "resource_id" UUID,
    "disposition_scope" JSONB NOT NULL,
    "dependency_matrix_ref" TEXT,
    "dependency_matrix_version" TEXT,
    "dependency_rule_code" TEXT,
    "dependency_matrix_fingerprint" TEXT,
    "executed_by_actor_ref" TEXT,
    "evidence_ref" TEXT,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "completed_at" TIMESTAMPTZ(3),

    CONSTRAINT "data_disposition_actions_pkey" PRIMARY KEY ("action_id")
);

-- CreateTable
CREATE TABLE "personalhub"."account_closure_cases" (
    "closure_case_id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "user_id" UUID NOT NULL,
    "request_id" UUID,
    "status" TEXT NOT NULL,
    "initiated_by_actor_type" TEXT NOT NULL,
    "initiated_by_user_id" UUID,
    "initiated_by_actor_ref" TEXT,
    "opened_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "closed_at" TIMESTAMPTZ(3),

    CONSTRAINT "account_closure_cases_pkey" PRIMARY KEY ("closure_case_id")
);

-- CreateIndex
CREATE UNIQUE INDEX "users_auth_subject_key" ON "personalhub"."users"("auth_subject");

-- CreateIndex
CREATE UNIQUE INDEX "users_email_normalized_key" ON "personalhub"."users"("email_normalized");

-- CreateIndex
CREATE UNIQUE INDEX "trainer_profiles_user_id_key" ON "personalhub"."trainer_profiles"("user_id");

-- CreateIndex
CREATE UNIQUE INDEX "student_profiles_user_id_key" ON "personalhub"."student_profiles"("user_id");

-- CreateIndex
CREATE UNIQUE INDEX "student_profiles_share_code_key" ON "personalhub"."student_profiles"("share_code");

-- CreateIndex
CREATE INDEX "link_requests_student_id_status_created_at_idx" ON "personalhub"."link_requests"("student_id", "status", "created_at");

-- CreateIndex
CREATE INDEX "link_requests_trainer_id_created_at_idx" ON "personalhub"."link_requests"("trainer_id", "created_at");

-- CreateIndex
CREATE UNIQUE INDEX "link_requests_request_id_trainer_id_student_id_key" ON "personalhub"."link_requests"("request_id", "trainer_id", "student_id");

-- CreateIndex
CREATE UNIQUE INDEX "trainer_student_links_origin_request_id_key" ON "personalhub"."trainer_student_links"("origin_request_id");

-- CreateIndex
CREATE INDEX "trainer_student_links_trainer_id_status_idx" ON "personalhub"."trainer_student_links"("trainer_id", "status");

-- CreateIndex
CREATE INDEX "trainer_student_links_student_id_started_at_idx" ON "personalhub"."trainer_student_links"("student_id", "started_at");

-- CreateIndex
CREATE UNIQUE INDEX "trainer_student_links_link_id_trainer_id_student_id_key" ON "personalhub"."trainer_student_links"("link_id", "trainer_id", "student_id");

-- CreateIndex
CREATE UNIQUE INDEX "consent_records_link_id_decision_key" ON "personalhub"."consent_records"("link_id", "decision");

-- CreateIndex
CREATE INDEX "exercises_trainer_id_status_idx" ON "personalhub"."exercises"("trainer_id", "status");

-- CreateIndex
CREATE INDEX "workout_plans_student_id_created_at_idx" ON "personalhub"."workout_plans"("student_id", "created_at");

-- CreateIndex
CREATE UNIQUE INDEX "workout_plan_drafts_plan_id_key" ON "personalhub"."workout_plan_drafts"("plan_id");

-- CreateIndex
CREATE UNIQUE INDEX "workout_plan_versions_plan_id_version_number_key" ON "personalhub"."workout_plan_versions"("plan_id", "version_number");

-- CreateIndex
CREATE UNIQUE INDEX "prescribed_exercises_plan_version_id_position_key" ON "personalhub"."prescribed_exercises"("plan_version_id", "position");

-- CreateIndex
CREATE UNIQUE INDEX "prescribed_sets_prescribed_exercise_id_position_key" ON "personalhub"."prescribed_sets"("prescribed_exercise_id", "position");

-- CreateIndex
CREATE INDEX "workout_executions_student_id_started_at_idx" ON "personalhub"."workout_executions"("student_id", "started_at");

-- CreateIndex
CREATE UNIQUE INDEX "exercise_executions_execution_id_prescribed_exercise_id_key" ON "personalhub"."exercise_executions"("execution_id", "prescribed_exercise_id");

-- CreateIndex
CREATE UNIQUE INDEX "set_executions_exercise_execution_id_prescribed_set_id_key" ON "personalhub"."set_executions"("exercise_execution_id", "prescribed_set_id");

-- CreateIndex
CREATE UNIQUE INDEX "workout_revisions_execution_id_revision_number_key" ON "personalhub"."workout_revisions"("execution_id", "revision_number");

-- CreateIndex
CREATE UNIQUE INDEX "workout_revisions_execution_id_revision_id_key" ON "personalhub"."workout_revisions"("execution_id", "revision_id");

-- CreateIndex
CREATE UNIQUE INDEX "measurement_definitions_code_key" ON "personalhub"."measurement_definitions"("code");

-- CreateIndex
CREATE UNIQUE INDEX "assessment_measurements_assessment_id_measurement_definitio_key" ON "personalhub"."assessment_measurements"("assessment_id", "measurement_definition_id", "measurement_context");

-- CreateIndex
CREATE UNIQUE INDEX "assessment_revisions_assessment_id_revision_number_key" ON "personalhub"."assessment_revisions"("assessment_id", "revision_number");

-- CreateIndex
CREATE UNIQUE INDEX "assessment_revisions_assessment_id_assessment_revision_id_key" ON "personalhub"."assessment_revisions"("assessment_id", "assessment_revision_id");

-- CreateIndex
CREATE INDEX "body_weight_records_student_id_measured_at_weight_record_id_idx" ON "personalhub"."body_weight_records"("student_id", "measured_at", "weight_record_id");

-- CreateIndex
CREATE UNIQUE INDEX "body_weight_revisions_record_id_revision_number_key" ON "personalhub"."body_weight_revisions"("record_id", "revision_number");

-- CreateIndex
CREATE UNIQUE INDEX "body_weight_revisions_record_id_weight_revision_id_key" ON "personalhub"."body_weight_revisions"("record_id", "weight_revision_id");

-- CreateIndex
CREATE UNIQUE INDEX "shared_note_revisions_note_id_revision_number_key" ON "personalhub"."shared_note_revisions"("note_id", "revision_number");

-- CreateIndex
CREATE UNIQUE INDEX "shared_note_revisions_note_id_note_revision_id_key" ON "personalhub"."shared_note_revisions"("note_id", "note_revision_id");

-- CreateIndex
CREATE INDEX "meals_student_id_consumed_at_idx" ON "personalhub"."meals"("student_id", "consumed_at");

-- CreateIndex
CREATE UNIQUE INDEX "meal_items_meal_id_position_key" ON "personalhub"."meal_items"("meal_id", "position");

-- CreateIndex
CREATE UNIQUE INDEX "meal_revisions_meal_id_revision_number_key" ON "personalhub"."meal_revisions"("meal_id", "revision_number");

-- CreateIndex
CREATE UNIQUE INDEX "meal_revisions_meal_id_meal_revision_id_key" ON "personalhub"."meal_revisions"("meal_id", "meal_revision_id");

-- CreateIndex
CREATE INDEX "appointments_link_id_status_starts_at_idx" ON "personalhub"."appointments"("link_id", "status", "starts_at");

-- CreateIndex
CREATE UNIQUE INDEX "appointments_appointment_id_student_id_key" ON "personalhub"."appointments"("appointment_id", "student_id");

-- CreateIndex
CREATE UNIQUE INDEX "appointment_events_appointment_id_sequence_key" ON "personalhub"."appointment_events"("appointment_id", "sequence");

-- CreateIndex
CREATE UNIQUE INDEX "subscription_plans_offer_code_version_key" ON "personalhub"."subscription_plans"("offer_code", "version");

-- CreateIndex
CREATE UNIQUE INDEX "plan_entitlements_plan_id_feature_code_key" ON "personalhub"."plan_entitlements"("plan_id", "feature_code");

-- CreateIndex
CREATE INDEX "subscriptions_trainer_id_is_current_idx" ON "personalhub"."subscriptions"("trainer_id", "is_current");

-- CreateIndex
CREATE UNIQUE INDEX "subscription_events_subscription_id_sequence_key" ON "personalhub"."subscription_events"("subscription_id", "sequence");

-- CreateIndex
CREATE UNIQUE INDEX "subscription_events_provider_namespace_external_event_refer_key" ON "personalhub"."subscription_events"("provider_namespace", "external_event_reference");

-- CreateIndex
CREATE INDEX "audit_events_actor_ref_operation_code_created_at_idx" ON "personalhub"."audit_events"("actor_ref", "operation_code", "created_at");

-- CreateIndex
CREATE UNIQUE INDEX "audit_events_actor_ref_operation_key_key" ON "personalhub"."audit_events"("actor_ref", "operation_key");

-- CreateIndex
CREATE UNIQUE INDEX "audit_event_subjects_operation_id_user_id_key" ON "personalhub"."audit_event_subjects"("operation_id", "user_id");

-- CreateIndex
CREATE UNIQUE INDEX "retention_policies_code_version_key" ON "personalhub"."retention_policies"("code", "version");

-- AddForeignKey
ALTER TABLE "personalhub"."trainer_profiles" ADD CONSTRAINT "trainer_profiles_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "personalhub"."users"("user_id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "personalhub"."student_profiles" ADD CONSTRAINT "student_profiles_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "personalhub"."users"("user_id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "personalhub"."link_requests" ADD CONSTRAINT "link_requests_trainer_id_fkey" FOREIGN KEY ("trainer_id") REFERENCES "personalhub"."trainer_profiles"("trainer_id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "personalhub"."link_requests" ADD CONSTRAINT "link_requests_student_id_fkey" FOREIGN KEY ("student_id") REFERENCES "personalhub"."student_profiles"("student_id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "personalhub"."trainer_student_links" ADD CONSTRAINT "trainer_student_links_trainer_id_fkey" FOREIGN KEY ("trainer_id") REFERENCES "personalhub"."trainer_profiles"("trainer_id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "personalhub"."trainer_student_links" ADD CONSTRAINT "trainer_student_links_student_id_fkey" FOREIGN KEY ("student_id") REFERENCES "personalhub"."student_profiles"("student_id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "personalhub"."trainer_student_links" ADD CONSTRAINT "trainer_student_links_origin_request_id_fkey" FOREIGN KEY ("origin_request_id") REFERENCES "personalhub"."link_requests"("request_id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "personalhub"."trainer_student_links" ADD CONSTRAINT "trainer_student_links_replaced_by_link_id_fkey" FOREIGN KEY ("replaced_by_link_id") REFERENCES "personalhub"."trainer_student_links"("link_id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "personalhub"."consent_records" ADD CONSTRAINT "consent_records_link_id_fkey" FOREIGN KEY ("link_id") REFERENCES "personalhub"."trainer_student_links"("link_id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "personalhub"."consent_records" ADD CONSTRAINT "consent_records_actor_user_id_fkey" FOREIGN KEY ("actor_user_id") REFERENCES "personalhub"."users"("user_id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "personalhub"."consent_records" ADD CONSTRAINT "consent_records_related_request_id_fkey" FOREIGN KEY ("related_request_id") REFERENCES "personalhub"."link_requests"("request_id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "personalhub"."exercises" ADD CONSTRAINT "exercises_trainer_id_fkey" FOREIGN KEY ("trainer_id") REFERENCES "personalhub"."trainer_profiles"("trainer_id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "personalhub"."workout_plans" ADD CONSTRAINT "workout_plans_trainer_id_fkey" FOREIGN KEY ("trainer_id") REFERENCES "personalhub"."trainer_profiles"("trainer_id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "personalhub"."workout_plans" ADD CONSTRAINT "workout_plans_student_id_fkey" FOREIGN KEY ("student_id") REFERENCES "personalhub"."student_profiles"("student_id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "personalhub"."workout_plans" ADD CONSTRAINT "workout_plans_origin_link_id_fkey" FOREIGN KEY ("origin_link_id") REFERENCES "personalhub"."trainer_student_links"("link_id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "personalhub"."workout_plan_drafts" ADD CONSTRAINT "workout_plan_drafts_plan_id_fkey" FOREIGN KEY ("plan_id") REFERENCES "personalhub"."workout_plans"("plan_id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "personalhub"."workout_plan_drafts" ADD CONSTRAINT "workout_plan_drafts_base_version_id_fkey" FOREIGN KEY ("base_version_id") REFERENCES "personalhub"."workout_plan_versions"("plan_version_id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "personalhub"."workout_plan_versions" ADD CONSTRAINT "workout_plan_versions_plan_id_fkey" FOREIGN KEY ("plan_id") REFERENCES "personalhub"."workout_plans"("plan_id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "personalhub"."prescribed_exercises" ADD CONSTRAINT "prescribed_exercises_plan_version_id_fkey" FOREIGN KEY ("plan_version_id") REFERENCES "personalhub"."workout_plan_versions"("plan_version_id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "personalhub"."prescribed_exercises" ADD CONSTRAINT "prescribed_exercises_source_exercise_id_fkey" FOREIGN KEY ("source_exercise_id") REFERENCES "personalhub"."exercises"("exercise_id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "personalhub"."prescribed_sets" ADD CONSTRAINT "prescribed_sets_prescribed_exercise_id_fkey" FOREIGN KEY ("prescribed_exercise_id") REFERENCES "personalhub"."prescribed_exercises"("prescribed_exercise_id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "personalhub"."workout_executions" ADD CONSTRAINT "workout_executions_student_id_fkey" FOREIGN KEY ("student_id") REFERENCES "personalhub"."student_profiles"("student_id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "personalhub"."workout_executions" ADD CONSTRAINT "workout_executions_plan_version_id_fkey" FOREIGN KEY ("plan_version_id") REFERENCES "personalhub"."workout_plan_versions"("plan_version_id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "personalhub"."exercise_executions" ADD CONSTRAINT "exercise_executions_execution_id_fkey" FOREIGN KEY ("execution_id") REFERENCES "personalhub"."workout_executions"("execution_id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "personalhub"."exercise_executions" ADD CONSTRAINT "exercise_executions_prescribed_exercise_id_fkey" FOREIGN KEY ("prescribed_exercise_id") REFERENCES "personalhub"."prescribed_exercises"("prescribed_exercise_id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "personalhub"."set_executions" ADD CONSTRAINT "set_executions_exercise_execution_id_fkey" FOREIGN KEY ("exercise_execution_id") REFERENCES "personalhub"."exercise_executions"("exercise_execution_id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "personalhub"."set_executions" ADD CONSTRAINT "set_executions_prescribed_set_id_fkey" FOREIGN KEY ("prescribed_set_id") REFERENCES "personalhub"."prescribed_sets"("prescribed_set_id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "personalhub"."workout_revisions" ADD CONSTRAINT "workout_revisions_execution_id_fkey" FOREIGN KEY ("execution_id") REFERENCES "personalhub"."workout_executions"("execution_id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "personalhub"."workout_revisions" ADD CONSTRAINT "workout_revisions_actor_user_id_fkey" FOREIGN KEY ("actor_user_id") REFERENCES "personalhub"."users"("user_id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "personalhub"."assessments" ADD CONSTRAINT "assessments_student_id_fkey" FOREIGN KEY ("student_id") REFERENCES "personalhub"."student_profiles"("student_id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "personalhub"."assessments" ADD CONSTRAINT "assessments_author_trainer_id_fkey" FOREIGN KEY ("author_trainer_id") REFERENCES "personalhub"."trainer_profiles"("trainer_id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "personalhub"."assessments" ADD CONSTRAINT "assessments_origin_link_id_fkey" FOREIGN KEY ("origin_link_id") REFERENCES "personalhub"."trainer_student_links"("link_id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "personalhub"."assessment_measurements" ADD CONSTRAINT "assessment_measurements_assessment_id_fkey" FOREIGN KEY ("assessment_id") REFERENCES "personalhub"."assessments"("assessment_id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "personalhub"."assessment_measurements" ADD CONSTRAINT "assessment_measurements_measurement_definition_id_fkey" FOREIGN KEY ("measurement_definition_id") REFERENCES "personalhub"."measurement_definitions"("measurement_definition_id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "personalhub"."assessment_revisions" ADD CONSTRAINT "assessment_revisions_assessment_id_fkey" FOREIGN KEY ("assessment_id") REFERENCES "personalhub"."assessments"("assessment_id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "personalhub"."assessment_revisions" ADD CONSTRAINT "assessment_revisions_actor_user_id_fkey" FOREIGN KEY ("actor_user_id") REFERENCES "personalhub"."users"("user_id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "personalhub"."body_weight_records" ADD CONSTRAINT "body_weight_records_student_id_fkey" FOREIGN KEY ("student_id") REFERENCES "personalhub"."student_profiles"("student_id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "personalhub"."body_weight_revisions" ADD CONSTRAINT "body_weight_revisions_record_id_fkey" FOREIGN KEY ("record_id") REFERENCES "personalhub"."body_weight_records"("weight_record_id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "personalhub"."body_weight_revisions" ADD CONSTRAINT "body_weight_revisions_actor_user_id_fkey" FOREIGN KEY ("actor_user_id") REFERENCES "personalhub"."users"("user_id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "personalhub"."shared_notes" ADD CONSTRAINT "shared_notes_student_id_fkey" FOREIGN KEY ("student_id") REFERENCES "personalhub"."student_profiles"("student_id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "personalhub"."shared_notes" ADD CONSTRAINT "shared_notes_author_trainer_id_fkey" FOREIGN KEY ("author_trainer_id") REFERENCES "personalhub"."trainer_profiles"("trainer_id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "personalhub"."shared_notes" ADD CONSTRAINT "shared_notes_origin_link_id_fkey" FOREIGN KEY ("origin_link_id") REFERENCES "personalhub"."trainer_student_links"("link_id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "personalhub"."shared_note_revisions" ADD CONSTRAINT "shared_note_revisions_note_id_fkey" FOREIGN KEY ("note_id") REFERENCES "personalhub"."shared_notes"("note_id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "personalhub"."shared_note_revisions" ADD CONSTRAINT "shared_note_revisions_actor_user_id_fkey" FOREIGN KEY ("actor_user_id") REFERENCES "personalhub"."users"("user_id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "personalhub"."meals" ADD CONSTRAINT "meals_student_id_fkey" FOREIGN KEY ("student_id") REFERENCES "personalhub"."student_profiles"("student_id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "personalhub"."meal_items" ADD CONSTRAINT "meal_items_meal_id_fkey" FOREIGN KEY ("meal_id") REFERENCES "personalhub"."meals"("meal_id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "personalhub"."meal_revisions" ADD CONSTRAINT "meal_revisions_meal_id_fkey" FOREIGN KEY ("meal_id") REFERENCES "personalhub"."meals"("meal_id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "personalhub"."meal_revisions" ADD CONSTRAINT "meal_revisions_actor_user_id_fkey" FOREIGN KEY ("actor_user_id") REFERENCES "personalhub"."users"("user_id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "personalhub"."appointments" ADD CONSTRAINT "appointments_trainer_id_fkey" FOREIGN KEY ("trainer_id") REFERENCES "personalhub"."trainer_profiles"("trainer_id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "personalhub"."appointments" ADD CONSTRAINT "appointments_student_id_fkey" FOREIGN KEY ("student_id") REFERENCES "personalhub"."student_profiles"("student_id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "personalhub"."appointments" ADD CONSTRAINT "appointments_link_id_fkey" FOREIGN KEY ("link_id") REFERENCES "personalhub"."trainer_student_links"("link_id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "personalhub"."appointment_events" ADD CONSTRAINT "appointment_events_appointment_id_fkey" FOREIGN KEY ("appointment_id") REFERENCES "personalhub"."appointments"("appointment_id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "personalhub"."appointment_events" ADD CONSTRAINT "appointment_events_operation_id_fkey" FOREIGN KEY ("operation_id") REFERENCES "personalhub"."audit_events"("operation_id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "personalhub"."appointment_disputes" ADD CONSTRAINT "appointment_disputes_appointment_id_fkey" FOREIGN KEY ("appointment_id") REFERENCES "personalhub"."appointments"("appointment_id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "personalhub"."appointment_disputes" ADD CONSTRAINT "appointment_disputes_student_id_fkey" FOREIGN KEY ("student_id") REFERENCES "personalhub"."student_profiles"("student_id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "personalhub"."plan_entitlements" ADD CONSTRAINT "plan_entitlements_plan_id_fkey" FOREIGN KEY ("plan_id") REFERENCES "personalhub"."subscription_plans"("subscription_plan_id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "personalhub"."subscriptions" ADD CONSTRAINT "subscriptions_trainer_id_fkey" FOREIGN KEY ("trainer_id") REFERENCES "personalhub"."trainer_profiles"("trainer_id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "personalhub"."subscriptions" ADD CONSTRAINT "subscriptions_plan_id_fkey" FOREIGN KEY ("plan_id") REFERENCES "personalhub"."subscription_plans"("subscription_plan_id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "personalhub"."subscription_events" ADD CONSTRAINT "subscription_events_subscription_id_fkey" FOREIGN KEY ("subscription_id") REFERENCES "personalhub"."subscriptions"("subscription_id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "personalhub"."subscription_events" ADD CONSTRAINT "subscription_events_operation_id_fkey" FOREIGN KEY ("operation_id") REFERENCES "personalhub"."audit_events"("operation_id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "personalhub"."audit_event_subjects" ADD CONSTRAINT "audit_event_subjects_operation_id_fkey" FOREIGN KEY ("operation_id") REFERENCES "personalhub"."audit_events"("operation_id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "personalhub"."audit_event_subjects" ADD CONSTRAINT "audit_event_subjects_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "personalhub"."users"("user_id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "personalhub"."data_subject_requests" ADD CONSTRAINT "data_subject_requests_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "personalhub"."users"("user_id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "personalhub"."data_disposition_actions" ADD CONSTRAINT "data_disposition_actions_request_id_fkey" FOREIGN KEY ("request_id") REFERENCES "personalhub"."data_subject_requests"("subject_request_id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "personalhub"."data_disposition_actions" ADD CONSTRAINT "data_disposition_actions_policy_id_fkey" FOREIGN KEY ("policy_id") REFERENCES "personalhub"."retention_policies"("policy_id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "personalhub"."data_disposition_actions" ADD CONSTRAINT "data_disposition_actions_subject_user_id_fkey" FOREIGN KEY ("subject_user_id") REFERENCES "personalhub"."users"("user_id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "personalhub"."account_closure_cases" ADD CONSTRAINT "account_closure_cases_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "personalhub"."users"("user_id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "personalhub"."account_closure_cases" ADD CONSTRAINT "account_closure_cases_request_id_fkey" FOREIGN KEY ("request_id") REFERENCES "personalhub"."data_subject_requests"("subject_request_id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "personalhub"."account_closure_cases" ADD CONSTRAINT "account_closure_cases_initiated_by_user_id_fkey" FOREIGN KEY ("initiated_by_user_id") REFERENCES "personalhub"."users"("user_id") ON DELETE RESTRICT ON UPDATE RESTRICT;


COMMIT;
