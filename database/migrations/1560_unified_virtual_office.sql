-- Stable office entrances route to isolated scheduled encounters. No public URL changes.
CREATE TABLE virtual_office_encounters (
 room_id INT NOT NULL, generation INT NOT NULL,
 counseling_session_id INT NOT NULL, appointment_id INT NULL, agency_id INT NOT NULL,
 linked_by_user_id INT NOT NULL, linked_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
 attendance_version INT NOT NULL DEFAULT 0, synced_version INT NOT NULL DEFAULT -1,
 PRIMARY KEY (room_id,generation), UNIQUE KEY office_counseling_session (counseling_session_id),
 INDEX record_sync (synced_version,attendance_version)
);
ALTER TABLE private_virtual_office_visits ADD COLUMN counseling_visit_id BIGINT NULL;
ALTER TABLE counseling_session_visits
 ADD COLUMN client_id INT NULL,
 ADD COLUMN entry_method VARCHAR(24) NOT NULL DEFAULT 'session_link',
 ADD COLUMN office_visit_id BIGINT NULL,
 ADD UNIQUE KEY office_visit (office_visit_id),
 ADD INDEX client_attendance (session_id,client_id);
