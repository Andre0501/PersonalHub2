-- Execute as migration owner after creating the login personalhub_api.
GRANT USAGE ON SCHEMA personalhub TO personalhub_api;
GRANT SELECT ON personalhub.users, personalhub.student_profiles, personalhub.trainer_profiles,
  personalhub.link_requests, personalhub.trainer_student_links, personalhub.consent_records,
  personalhub.body_weight_records, personalhub.body_weight_revisions, personalhub.appointments,
  personalhub.appointment_events, personalhub.audit_events, personalhub.audit_event_subjects,
  personalhub.subscription_plans, personalhub.plan_entitlements, personalhub.subscriptions,
  personalhub.subscription_events TO personalhub_api;
GRANT INSERT ON personalhub.users, personalhub.student_profiles, personalhub.trainer_profiles,
  personalhub.link_requests, personalhub.trainer_student_links, personalhub.consent_records,
  personalhub.body_weight_records, personalhub.body_weight_revisions, personalhub.appointments,
  personalhub.appointment_events, personalhub.audit_events, personalhub.audit_event_subjects,
  personalhub.subscriptions, personalhub.subscription_events TO personalhub_api;
GRANT UPDATE ON personalhub.link_requests, personalhub.trainer_student_links,
  personalhub.body_weight_records, personalhub.appointments TO personalhub_api;
GRANT SELECT, INSERT ON personalhub.exercises, personalhub.workout_plans, personalhub.workout_plan_drafts,
  personalhub.workout_plan_versions, personalhub.prescribed_exercises, personalhub.prescribed_sets,
  personalhub.workout_executions, personalhub.exercise_executions, personalhub.set_executions, personalhub.workout_revisions TO personalhub_api;
GRANT UPDATE ON personalhub.workout_plan_drafts, personalhub.workout_executions,
  personalhub.exercise_executions, personalhub.set_executions TO personalhub_api;
