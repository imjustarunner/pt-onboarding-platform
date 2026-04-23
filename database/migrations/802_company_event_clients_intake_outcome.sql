-- Program events: per-event intake outcome (accepted vs denied)
--
-- Until now, `intake_complete` was a single boolean meaning "the event provider
-- finished the intake step." For the registrants workflow, coordinators need to
-- distinguish between an intake that resulted in the client being **accepted**
-- into the program vs **denied**. Both states still mean the intake itself was
-- completed; the outcome controls whether a treatment plan is even possible
-- (only Accepted clients move to TP and ultimately become Participants).
--
-- Rules:
--   intake_outcome IS NULL  -> intake_complete = 0 (Needed)
--   intake_outcome = 'accepted' -> intake_complete = 1, TP eligible
--   intake_outcome = 'denied'   -> intake_complete = 1, TP NOT eligible
--
-- Backfill: any existing intake_complete = 1 row is interpreted as accepted
-- (the old workflow only had a "complete" path).

ALTER TABLE company_event_clients
  ADD COLUMN intake_outcome ENUM('accepted', 'denied') NULL DEFAULT NULL
    COMMENT 'Outcome of intake — accepted means TP eligible; denied stops the workflow'
    AFTER intake_completed_by_user_id;

UPDATE company_event_clients
   SET intake_outcome = 'accepted'
 WHERE intake_complete = 1
   AND intake_outcome IS NULL;
