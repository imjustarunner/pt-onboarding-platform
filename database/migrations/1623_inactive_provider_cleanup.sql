-- Include explicit deactivation and legacy inactive/terminated status paths.
DROP TRIGGER IF EXISTS user_archive_queue_provider_cleanup;
CREATE TRIGGER user_archive_queue_provider_cleanup AFTER UPDATE ON users
FOR EACH ROW INSERT IGNORE INTO provider_offboarding_jobs (provider_id,actor_user_id)
SELECT NEW.id,NEW.archived_by_user_id
WHERE (NEW.is_archived=1 OR NEW.is_active=0 OR UPPER(COALESCE(NEW.status,'')) IN ('ARCHIVED','INACTIVE','INACTIVE_EMPLOYEE','TERMINATED','DELETED'))
  AND NOT (COALESCE(OLD.is_archived,0)=1 OR COALESCE(OLD.is_active,1)=0 OR UPPER(COALESCE(OLD.status,'')) IN ('ARCHIVED','INACTIVE','INACTIVE_EMPLOYEE','TERMINATED','DELETED'));
INSERT IGNORE INTO provider_offboarding_jobs (provider_id,actor_user_id)
SELECT u.id,u.archived_by_user_id FROM users u
WHERE (u.is_archived=1 OR u.is_active=0 OR UPPER(COALESCE(u.status,'')) IN ('ARCHIVED','INACTIVE','INACTIVE_EMPLOYEE','TERMINATED','DELETED'))
  AND (EXISTS(SELECT 1 FROM office_standing_assignments a WHERE a.provider_id=u.id AND a.is_active=1)
    OR EXISTS(SELECT 1 FROM office_events e WHERE COALESCE(e.booked_provider_id,e.assigned_provider_id)=u.id AND e.end_at>=UTC_TIMESTAMP() AND e.status<>'CANCELLED'));
