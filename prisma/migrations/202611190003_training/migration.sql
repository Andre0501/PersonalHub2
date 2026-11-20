BEGIN;
SET LOCAL search_path=personalhub,pg_catalog;
ALTER TABLE workout_plans ADD CHECK(status IN ('ACTIVE','ARCHIVED'));
ALTER TABLE exercises ADD CHECK(status IN ('ACTIVE','ARCHIVED'));
ALTER TABLE workout_executions ADD CHECK(status IN ('IN_PROGRESS','COMPLETED','ABANDONED')),
  ADD CHECK ((status='IN_PROGRESS' AND current_revision_id IS NULL AND finished_at IS NULL)
    OR (status<>'IN_PROGRESS' AND current_revision_id IS NOT NULL AND finished_at IS NOT NULL));
ALTER TABLE exercise_executions ADD CHECK(status IN ('NOT_STARTED','IN_PROGRESS','COMPLETED','PARTIAL','SKIPPED'));
ALTER TABLE set_executions ADD CHECK(status IN ('NOT_STARTED','COMPLETED','PARTIAL','SKIPPED')),
  ADD CHECK(actual_reps>0 AND actual_load_kg>=0 AND actual_seconds>0 AND actual_meters>0),
  ADD CHECK((status IN ('NOT_STARTED','SKIPPED'))=(num_nonnulls(actual_reps,actual_load_kg,actual_seconds,actual_meters)=0));
CREATE FUNCTION personalhub.check_training_reference() RETURNS trigger LANGUAGE plpgsql SET search_path=personalhub,pg_catalog AS $$
DECLARE valid boolean;
BEGIN
  CASE TG_TABLE_NAME
    WHEN 'workout_plan_drafts' THEN
      valid := NEW.base_version_id IS NULL OR EXISTS(SELECT FROM workout_plan_versions v WHERE v.plan_version_id=NEW.base_version_id AND v.plan_id=NEW.plan_id);
    WHEN 'prescribed_exercises' THEN
      valid := EXISTS(SELECT FROM workout_plan_versions v JOIN workout_plans p USING(plan_id)
        JOIN exercises e ON e.trainer_id=p.trainer_id WHERE v.plan_version_id=NEW.plan_version_id AND e.exercise_id=NEW.source_exercise_id);
    WHEN 'workout_executions' THEN
      valid := EXISTS(SELECT FROM workout_plan_versions v JOIN workout_plans p USING(plan_id)
        WHERE v.plan_version_id=NEW.plan_version_id AND p.student_id=NEW.student_id);
    WHEN 'exercise_executions' THEN
      valid := EXISTS(SELECT FROM workout_executions e JOIN prescribed_exercises p ON p.plan_version_id=e.plan_version_id
        WHERE e.execution_id=NEW.execution_id AND p.prescribed_exercise_id=NEW.prescribed_exercise_id);
    WHEN 'set_executions' THEN
      valid := EXISTS(SELECT FROM exercise_executions e JOIN prescribed_sets s ON s.prescribed_exercise_id=e.prescribed_exercise_id
        WHERE e.exercise_execution_id=NEW.exercise_execution_id AND s.prescribed_set_id=NEW.prescribed_set_id);
  END CASE;
  IF NOT valid THEN RAISE EXCEPTION 'incompatible training reference' USING ERRCODE='23514'; END IF;
  RETURN NEW;
END $$;
DO $$ DECLARE t text; BEGIN
  FOREACH t IN ARRAY ARRAY['workout_plan_drafts','prescribed_exercises','workout_executions','exercise_executions','set_executions']
  LOOP EXECUTE format('CREATE TRIGGER training_reference BEFORE INSERT OR UPDATE ON %I FOR EACH ROW EXECUTE FUNCTION personalhub.check_training_reference()',t); END LOOP;
END $$;
COMMIT;
