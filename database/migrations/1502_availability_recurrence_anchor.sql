-- Legacy intake flags continue to mean new-client audience. Purpose is separate.
ALTER TABLE provider_virtual_working_hours
 ADD COLUMN start_date DATE NULL,
 ADD COLUMN end_date DATE NULL,
 ADD COLUMN purpose VARCHAR(16) NOT NULL DEFAULT 'ONGOING';
-- Anchor existing alternating rows to their first weekday on/after creation.
UPDATE provider_virtual_working_hours SET start_date = DATE_ADD(DATE(created_at), INTERVAL
 MOD(FIELD(day_of_week,'Monday','Tuesday','Wednesday','Thursday','Friday','Saturday','Sunday') - 1 - WEEKDAY(created_at) + 7,7) DAY)
 WHERE frequency NOT IN ('WEEKLY','EITHER');
ALTER TABLE public_provider_slot_holds ADD COLUMN frequency VARCHAR(16) NOT NULL DEFAULT 'WEEKLY';
ALTER TABLE provider_virtual_slot_availability ADD COLUMN frequency VARCHAR(16) NOT NULL DEFAULT 'ONCE', ADD COLUMN purpose VARCHAR(16) NOT NULL DEFAULT 'INTAKE';
ALTER TABLE provider_in_person_slot_availability ADD COLUMN frequency VARCHAR(16) NOT NULL DEFAULT 'ONCE', ADD COLUMN purpose VARCHAR(16) NOT NULL DEFAULT 'INTAKE';
