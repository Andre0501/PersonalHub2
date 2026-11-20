BEGIN;
CREATE SCHEMA IF NOT EXISTS extensions;
CREATE EXTENSION IF NOT EXISTS btree_gist WITH SCHEMA extensions;
SET LOCAL search_path = personalhub, pg_catalog, extensions, public;
REVOKE ALL ON SCHEMA personalhub FROM PUBLIC;
REVOKE ALL ON ALL TABLES IN SCHEMA personalhub FROM PUBLIC;
ALTER DEFAULT PRIVILEGES IN SCHEMA personalhub REVOKE ALL ON TABLES FROM PUBLIC;

ALTER TABLE users ADD CHECK (role IN ('TRAINER','STUDENT')),
  ADD CHECK (account_status IN ('PENDING_PROFILE','ACTIVE','SUSPENDED','DEACTIVATED')),
  ADD CHECK (email_normalized = lower(btrim(email_normalized)));
CREATE FUNCTION personalhub.check_profile_role() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF NOT EXISTS (SELECT FROM personalhub.users WHERE user_id = NEW.user_id AND role = TG_ARGV[0]) THEN
    RAISE EXCEPTION 'profile role mismatch' USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER trainer_role BEFORE INSERT OR UPDATE ON trainer_profiles
  FOR EACH ROW EXECUTE FUNCTION personalhub.check_profile_role('TRAINER');
CREATE TRIGGER student_role BEFORE INSERT OR UPDATE ON student_profiles
  FOR EACH ROW EXECUTE FUNCTION personalhub.check_profile_role('STUDENT');
CREATE FUNCTION personalhub.reject_change() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION 'immutable domain evidence' USING ERRCODE = '23514';
END $$;
CREATE TRIGGER fixed_role BEFORE UPDATE OF role ON users FOR EACH ROW
  WHEN (OLD.role IS DISTINCT FROM NEW.role) EXECUTE FUNCTION personalhub.reject_change();

ALTER TABLE link_requests ADD CHECK (expires_at = created_at + interval '168 hours'),
  ADD CHECK ((status = 'PENDING') = (resolved_at IS NULL)),
  ADD CHECK (status IN ('PENDING','ACCEPTED','DECLINED','CANCELLED','EXPIRED','UNAVAILABLE'));
CREATE UNIQUE INDEX one_pending_pair ON link_requests(trainer_id,student_id) WHERE status='PENDING';
CREATE UNIQUE INDEX one_active_trainer_per_student ON trainer_student_links(student_id) WHERE status='ACTIVE';
ALTER TABLE trainer_student_links ADD CHECK (
  (status='ACTIVE' AND ended_at IS NULL AND end_reason IS NULL) OR
  (status='ENDED' AND ended_at IS NOT NULL AND ended_at >= started_at AND end_reason IS NOT NULL AND
   end_reason IN ('STUDENT_REVOKED','STUDENT_ENDED','TRAINER_ENDED','REPLACED','ACCOUNT_CLOSED','ADMINISTRATIVE'))),
  ADD CONSTRAINT link_request_pair_fk FOREIGN KEY (origin_request_id,trainer_id,student_id) REFERENCES link_requests(request_id,trainer_id,student_id);
ALTER TABLE consent_records ADD CHECK (decision IN ('GRANTED','REVOKED'));
ALTER TABLE trainer_student_links ALTER CONSTRAINT trainer_student_links_replaced_by_link_id_fkey DEFERRABLE INITIALLY DEFERRED;
ALTER TABLE appointment_events ALTER CONSTRAINT appointment_events_operation_id_fkey DEFERRABLE INITIALLY DEFERRED;
ALTER TABLE subscription_events ALTER CONSTRAINT subscription_events_operation_id_fkey DEFERRABLE INITIALLY DEFERRED;

ALTER TABLE appointments ADD CHECK (ends_at>starts_at), ADD CHECK (status IN ('SCHEDULED','COMPLETED','CANCELLED','NO_SHOW','ARCHIVED','CLOSED_UNRESOLVED')),
  ADD CONSTRAINT appointment_link_pair_fk FOREIGN KEY(link_id,trainer_id,student_id) REFERENCES trainer_student_links(link_id,trainer_id,student_id),
  ADD CONSTRAINT trainer_calendar_no_overlap EXCLUDE USING gist (trainer_id WITH =, tstzrange(starts_at,ends_at,'[)') WITH &&) WHERE(status='SCHEDULED'),
  ADD CONSTRAINT student_calendar_no_overlap EXCLUDE USING gist (student_id WITH =, tstzrange(starts_at,ends_at,'[)') WITH &&) WHERE(status='SCHEDULED');
ALTER TABLE appointment_disputes ADD FOREIGN KEY(appointment_id,student_id) REFERENCES appointments(appointment_id,student_id);
CREATE UNIQUE INDEX one_open_dispute ON appointment_disputes(appointment_id,student_id) WHERE resolved_at IS NULL;
ALTER TABLE workout_plans ADD FOREIGN KEY(origin_link_id,trainer_id,student_id) REFERENCES trainer_student_links(link_id,trainer_id,student_id);
ALTER TABLE assessments ADD FOREIGN KEY(origin_link_id,author_trainer_id,student_id) REFERENCES trainer_student_links(link_id,trainer_id,student_id);
ALTER TABLE shared_notes ADD FOREIGN KEY(origin_link_id,author_trainer_id,student_id) REFERENCES trainer_student_links(link_id,trainer_id,student_id);
ALTER TABLE body_weight_records ADD CHECK(kg>0), ADD CHECK(status IN ('ACTIVE','VOIDED')), ADD CHECK(revision_number>0);
ALTER TABLE prescribed_sets ADD CHECK(num_nonnulls(target_reps,target_load_kg,target_seconds,target_meters)>0),
  ADD CHECK(target_reps>0 AND target_load_kg>=0 AND target_seconds>0 AND target_meters>0);
ALTER TABLE assessment_measurements ADD CHECK (num_nonnulls(numeric_value,text_value,boolean_value)=1);
ALTER TABLE meal_items ADD CHECK(quantity>0 AND position>0);
ALTER TABLE subscription_plans ADD CHECK(price_cents>=0 AND version>0),
  ADD CHECK(code IN ('FREE','PRO') AND billing_period IN ('NONE','MONTHLY','YEARLY') AND status IN ('DRAFT','ACTIVE','RETIRED')),
  ADD CHECK (NOT canonical_free OR (code='FREE' AND price_cents=0 AND billing_period='NONE')),
  ADD CHECK(effective_until IS NULL OR effective_until>effective_from),
  ADD EXCLUDE USING gist(offer_code WITH =,tstzrange(effective_from,effective_until,'[)') WITH &&) WHERE(status='ACTIVE'),
  ADD EXCLUDE USING gist(tstzrange(effective_from,effective_until,'[)') WITH &&) WHERE(canonical_free AND status='ACTIVE');
ALTER TABLE plan_entitlements ADD CHECK((value_type='INTEGER' AND integer_value IS NOT NULL AND integer_value>=0 AND boolean_value IS NULL)
  OR (value_type='BOOLEAN' AND boolean_value IS NOT NULL AND integer_value IS NULL));
ALTER TABLE subscriptions ADD CHECK(status IN ('ACTIVE','PAST_DUE','SUSPENDED','ENDED')), ADD CHECK(NOT is_current OR (status<>'ENDED' AND ended_at IS NULL));
CREATE UNIQUE INDEX one_current_subscription ON subscriptions(trainer_id) WHERE is_current;
ALTER TABLE subscription_events ADD CHECK ((provider_namespace IS NULL)=(external_event_reference IS NULL));
ALTER TABLE data_disposition_actions ADD CHECK(action_type NOT IN ('DELETE','ANONYMIZE') OR
  (dependency_matrix_ref IS NOT NULL AND dependency_matrix_version IS NOT NULL AND dependency_rule_code IS NOT NULL AND dependency_matrix_fingerprint IS NOT NULL));

-- A pointer and its previous revision must address the same aggregate.
DO $$
DECLARE spec text[]; immutable_table text;
BEGIN
  FOREACH spec SLICE 1 IN ARRAY ARRAY[
    ['workout_executions','execution_id','workout_revisions','execution_id','revision_id'],
    ['assessments','assessment_id','assessment_revisions','assessment_id','assessment_revision_id'],
    ['body_weight_records','weight_record_id','body_weight_revisions','record_id','weight_revision_id'],
    ['shared_notes','note_id','shared_note_revisions','note_id','note_revision_id'],
    ['meals','meal_id','meal_revisions','meal_id','meal_revision_id']]
  LOOP
    EXECUTE format('ALTER TABLE %I ADD FOREIGN KEY (%I,current_revision_id) REFERENCES %I(%I,%I) DEFERRABLE INITIALLY DEFERRED',spec[1],spec[2],spec[3],spec[4],spec[5]);
    EXECUTE format('ALTER TABLE %I ADD FOREIGN KEY (%I,previous_revision_id) REFERENCES %I(%I,%I), ADD CHECK (revision_number>0 AND (revision_number=1)=(previous_revision_id IS NULL))',spec[3],spec[4],spec[3],spec[4],spec[5]);
  END LOOP;
  FOREACH immutable_table IN ARRAY ARRAY['consent_records','audit_events','audit_event_subjects','appointment_events','subscription_events','workout_plan_versions','prescribed_exercises','prescribed_sets','workout_revisions','assessment_revisions','body_weight_revisions','shared_note_revisions','meal_revisions']
  LOOP
    EXECUTE format('CREATE TRIGGER immutable_evidence BEFORE UPDATE OR DELETE ON %I FOR EACH ROW EXECUTE FUNCTION personalhub.reject_change()',immutable_table);
  END LOOP;
END $$;

-- Offering for the pilot. Real billing is intentionally outside this release.
INSERT INTO subscription_plans(subscription_plan_id,offer_code,version,code,billing_period,status,canonical_free,price_cents,effective_from)
VALUES ('bb48fc40-c041-4b08-9114-f5bd40222c01','PILOT_FREE',1,'FREE','NONE','ACTIVE',true,0,CURRENT_TIMESTAMP);
INSERT INTO plan_entitlements(plan_id,feature_code,value_type,integer_value)
VALUES ('bb48fc40-c041-4b08-9114-f5bd40222c01','ACTIVE_STUDENTS','INTEGER',3);
COMMIT;
