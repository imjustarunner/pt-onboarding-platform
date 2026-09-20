-- New intake publications reopen global acceptance regardless of which scheduling UI wrote them.
-- Closing intake disables/removes the publications in the same transaction as the user update.
DROP TRIGGER IF EXISTS provider_in_person_intake_open_insert;
CREATE TRIGGER provider_in_person_intake_open_insert AFTER INSERT ON provider_in_person_slot_availability
FOR EACH ROW UPDATE users SET provider_accepting_new_clients=1,in_office_available=1
WHERE id=NEW.provider_id AND NEW.is_active=1 AND NEW.end_at>UTC_TIMESTAMP() AND sees_clients=1;
DROP TRIGGER IF EXISTS provider_in_person_intake_open_update;
CREATE TRIGGER provider_in_person_intake_open_update AFTER UPDATE ON provider_in_person_slot_availability
FOR EACH ROW UPDATE users SET provider_accepting_new_clients=1,in_office_available=1
WHERE id=NEW.provider_id AND NEW.is_active=1 AND NEW.end_at>UTC_TIMESTAMP() AND sees_clients=1;
DROP TRIGGER IF EXISTS provider_virtual_intake_open_insert;
CREATE TRIGGER provider_virtual_intake_open_insert AFTER INSERT ON provider_virtual_slot_availability
FOR EACH ROW UPDATE users SET provider_accepting_new_clients=1
WHERE id=NEW.provider_id AND NEW.is_active=1 AND NEW.available_for_intake=1 AND NEW.end_at>UTC_TIMESTAMP() AND sees_clients=1;
DROP TRIGGER IF EXISTS provider_virtual_intake_open_update;
CREATE TRIGGER provider_virtual_intake_open_update AFTER UPDATE ON provider_virtual_slot_availability
FOR EACH ROW UPDATE users SET provider_accepting_new_clients=1
WHERE id=NEW.provider_id AND NEW.is_active=1 AND NEW.available_for_intake=1 AND NEW.end_at>UTC_TIMESTAMP() AND sees_clients=1;
DROP TRIGGER IF EXISTS provider_virtual_hours_open_insert;
CREATE TRIGGER provider_virtual_hours_open_insert AFTER INSERT ON provider_virtual_working_hours
FOR EACH ROW UPDATE users SET provider_accepting_new_clients=1
WHERE id=NEW.provider_id AND NEW.available_for_intake=1 AND sees_clients=1;
DROP TRIGGER IF EXISTS provider_virtual_hours_open_update;
CREATE TRIGGER provider_virtual_hours_open_update AFTER UPDATE ON provider_virtual_working_hours
FOR EACH ROW UPDATE users SET provider_accepting_new_clients=1
WHERE id=NEW.provider_id AND NEW.available_for_intake=1 AND sees_clients=1;
DROP TRIGGER IF EXISTS provider_school_intake_open_insert;
CREATE TRIGGER provider_school_intake_open_insert AFTER INSERT ON provider_school_assignments
FOR EACH ROW UPDATE users SET provider_accepting_new_clients=1
WHERE id=NEW.provider_user_id AND NEW.is_active=1 AND NEW.slots_available>0 AND sees_clients=1;
DROP TRIGGER IF EXISTS provider_school_intake_open_update;
CREATE TRIGGER provider_school_intake_open_update AFTER UPDATE ON provider_school_assignments
FOR EACH ROW UPDATE users SET provider_accepting_new_clients=1
WHERE id=NEW.provider_user_id AND NEW.is_active=1 AND NEW.slots_available>0 AND sees_clients=1;

DROP TRIGGER IF EXISTS provider_legacy_office_open_insert;
CREATE TRIGGER provider_legacy_office_open_insert AFTER INSERT ON provider_in_office_availability
FOR EACH ROW UPDATE users SET provider_accepting_new_clients=1,in_office_available=1
WHERE id=NEW.provider_id AND NEW.is_available=1 AND sees_clients=1;
DROP TRIGGER IF EXISTS provider_legacy_office_open_update;
CREATE TRIGGER provider_legacy_office_open_update AFTER UPDATE ON provider_in_office_availability
FOR EACH ROW UPDATE users SET provider_accepting_new_clients=1,in_office_available=1
WHERE id=NEW.provider_id AND NEW.is_available=1 AND sees_clients=1;

-- A new school opening also clears a stale per-school closure.
DROP TRIGGER IF EXISTS provider_school_open_acceptance_insert;
CREATE TRIGGER provider_school_open_acceptance_insert BEFORE INSERT ON provider_school_assignments
FOR EACH ROW SET NEW.accepting_new_clients_override=IF(NEW.is_active=1 AND NEW.slots_available>0,1,NEW.accepting_new_clients_override);
DROP TRIGGER IF EXISTS provider_school_open_acceptance_update;
CREATE TRIGGER provider_school_open_acceptance_update BEFORE UPDATE ON provider_school_assignments
FOR EACH ROW SET NEW.accepting_new_clients_override=IF(NEW.is_active=1 AND NEW.slots_available>0,1,NEW.accepting_new_clients_override);
