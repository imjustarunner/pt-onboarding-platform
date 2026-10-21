-- Individual visits identify students directly, rather than inheriting every
-- student ever added to the provider's reusable class.
CREATE TABLE IF NOT EXISTS tutoring_session_clients (
 session_id BIGINT NOT NULL,
 client_id INT NOT NULL,
 created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
 PRIMARY KEY (session_id,client_id),
 INDEX idx_tutoring_session_client (client_id,session_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
INSERT IGNORE INTO tutoring_session_clients(session_id,client_id)
 SELECT s.id,ss.client_id FROM learning_class_sessions s
 JOIN student_subjects ss ON ss.id=s.student_subject_id
 JOIN learning_program_classes c ON c.id=s.learning_class_id AND c.organization_id=ss.agency_id
 WHERE s.session_subtype='tutoring' OR s.mode='individual';
INSERT IGNORE INTO tutoring_session_clients(session_id,client_id)
 SELECT s.id,COALESCE(r.created_client_id,r.matched_client_id) FROM learning_class_sessions s
 JOIN public_appointment_requests r ON r.linked_session_id=s.id
 JOIN learning_program_classes c ON c.id=s.learning_class_id AND c.organization_id=r.agency_id
 WHERE (s.session_subtype='tutoring' OR s.mode='individual')
 AND COALESCE(r.created_client_id,r.matched_client_id) IS NOT NULL;
-- A one-member legacy class is unambiguous; never guess among multiple members.
INSERT IGNORE INTO tutoring_session_clients(session_id,client_id)
 SELECT s.id,MIN(m.client_id) FROM learning_class_sessions s
 JOIN learning_class_client_memberships m ON m.learning_class_id=s.learning_class_id AND m.membership_status='active'
 WHERE (s.session_subtype='tutoring' OR s.mode='individual') AND NOT EXISTS(SELECT 1 FROM tutoring_session_clients t WHERE t.session_id=s.id)
 GROUP BY s.id HAVING COUNT(DISTINCT m.client_id)=1;
UPDATE learning_class_sessions s JOIN public_appointment_requests r ON r.linked_session_id=s.id
 SET s.ends_at=r.requested_end_at
 WHERE s.ends_at IS NULL AND r.requested_end_at>s.starts_at AND s.status='scheduled';
