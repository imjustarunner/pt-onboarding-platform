-- Assignment transitions notify schools and providers only. Retain the unused
-- family outbox as audit history; old application revisions cannot enqueue mail.
CREATE TRIGGER IF NOT EXISTS scb_hold_family_assignment_delivery
BEFORE INSERT ON school_family_status_emails FOR EACH ROW
SET NEW.delivery_status = 'held';
UPDATE school_family_status_emails SET delivery_status='held'
WHERE delivery_status IN ('pending','processing');
