BEGIN;
SET LOCAL search_path=personalhub,pg_catalog;
CREATE FUNCTION personalhub.check_committed_link() RETURNS trigger
LANGUAGE plpgsql SET search_path=personalhub,pg_catalog AS $$
DECLARE target_id uuid; edge trainer_student_links%ROWTYPE;
BEGIN
  IF TG_TABLE_NAME='link_requests' THEN
    SELECT link_id INTO target_id FROM trainer_student_links WHERE origin_request_id=NEW.request_id;
    IF target_id IS NULL THEN
      IF NEW.status='ACCEPTED' THEN RAISE EXCEPTION 'accepted invitation requires link' USING ERRCODE='23514'; END IF;
      RETURN NULL;
    END IF;
  ELSE
    target_id:=NEW.link_id;
  END IF;
  SELECT * INTO STRICT edge FROM trainer_student_links WHERE link_id=target_id;
  IF NOT EXISTS(SELECT FROM link_requests WHERE request_id=edge.origin_request_id AND status='ACCEPTED')
    OR NOT EXISTS(SELECT FROM consent_records c JOIN student_profiles s ON s.student_id=edge.student_id
      WHERE c.link_id=target_id AND c.decision='GRANTED' AND c.actor_user_id=s.user_id AND c.related_request_id=edge.origin_request_id)
    OR ((edge.status='ENDED') IS DISTINCT FROM EXISTS(SELECT FROM consent_records WHERE link_id=target_id AND decision='REVOKED'))
    OR ((edge.end_reason IS NOT DISTINCT FROM 'REPLACED') IS DISTINCT FROM (edge.replaced_by_link_id IS NOT NULL))
    OR (edge.replaced_by_link_id IS NOT NULL AND NOT EXISTS(SELECT FROM trainer_student_links n
        WHERE n.link_id=edge.replaced_by_link_id AND n.student_id=edge.student_id AND n.trainer_id<>edge.trainer_id AND n.started_at=edge.ended_at))
  THEN RAISE EXCEPTION 'link, consent and request must agree at commit' USING ERRCODE='23514'; END IF;
  RETURN NULL;
END $$;
CREATE CONSTRAINT TRIGGER coherent_link AFTER INSERT OR UPDATE ON trainer_student_links DEFERRABLE INITIALLY DEFERRED
  FOR EACH ROW EXECUTE FUNCTION personalhub.check_committed_link();
CREATE CONSTRAINT TRIGGER coherent_consent AFTER INSERT ON consent_records DEFERRABLE INITIALLY DEFERRED
  FOR EACH ROW EXECUTE FUNCTION personalhub.check_committed_link();
CREATE CONSTRAINT TRIGGER coherent_request AFTER INSERT OR UPDATE ON link_requests DEFERRABLE INITIALLY DEFERRED
  FOR EACH ROW EXECUTE FUNCTION personalhub.check_committed_link();

CREATE FUNCTION personalhub.check_revision_sequence() RETURNS trigger LANGUAGE plpgsql SET search_path=personalhub,pg_catalog AS $$
DECLARE previous_number int;
BEGIN
  IF NEW.previous_revision_id IS NOT NULL THEN
    EXECUTE format('SELECT revision_number FROM %I WHERE %I=$1',TG_TABLE_NAME,TG_ARGV[0]) INTO previous_number USING NEW.previous_revision_id;
    IF previous_number IS DISTINCT FROM NEW.revision_number-1 THEN
      RAISE EXCEPTION 'revision chain must advance one step' USING ERRCODE='23514';
    END IF;
  END IF;
  RETURN NEW;
END $$;
DO $$ DECLARE p text[]; BEGIN
  FOREACH p SLICE 1 IN ARRAY ARRAY[['workout_revisions','revision_id'],['assessment_revisions','assessment_revision_id'],
    ['body_weight_revisions','weight_revision_id'],['shared_note_revisions','note_revision_id'],['meal_revisions','meal_revision_id']]
  LOOP EXECUTE format('CREATE TRIGGER revision_sequence BEFORE INSERT ON %I FOR EACH ROW EXECUTE FUNCTION personalhub.check_revision_sequence(%L)',p[1],p[2]); END LOOP;
END $$;
COMMIT;
