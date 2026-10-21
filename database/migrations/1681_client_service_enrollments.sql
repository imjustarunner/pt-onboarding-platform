CREATE TABLE IF NOT EXISTS client_service_enrollments (
 id BIGINT AUTO_INCREMENT PRIMARY KEY,
 client_id INT NOT NULL,
 agency_id INT NOT NULL,
 service_kind VARCHAR(30) NOT NULL,
 provider_user_id INT NOT NULL DEFAULT 0,
 organization_id INT NOT NULL DEFAULT 0,
 label VARCHAR(150) NOT NULL,
 is_active BOOLEAN NOT NULL DEFAULT TRUE,
 created_by_user_id INT NULL,
 updated_by_user_id INT NULL,
 created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
 updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
 UNIQUE KEY uq_client_service (client_id,agency_id,service_kind,provider_user_id,organization_id),
 INDEX idx_client_service_agency (agency_id,is_active,client_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- Preserve existing assignments. Additional services do not replace a client's
-- identity, primary agency, or another provider's assignment.
INSERT IGNORE INTO client_service_enrollments (client_id,agency_id,service_kind,provider_user_id,organization_id,label)
 SELECT id,agency_id,IF(client_type IN ('learning','tutoring'),'tutoring','counseling'),COALESCE(provider_id,0),COALESCE(organization_id,0),
 IF(client_type IN ('learning','tutoring'),'Tutoring','Counseling') FROM clients WHERE status NOT IN ('ARCHIVED','TERMINATED') AND agency_id IS NOT NULL AND client_type IN ('clinical','school','learning');

INSERT IGNORE INTO client_service_enrollments (client_id,agency_id,service_kind,provider_user_id,organization_id,label)
 SELECT DISTINCT ap.client_id,a.agency_id,IF(a.business_type IN ('tutoring','learning'),'tutoring','counseling'),COALESCE(a.provider_user_id,0),0,
 IF(a.business_type IN ('tutoring','learning'),'Tutoring','Counseling')
 FROM appointments a JOIN appointment_participants ap ON ap.appointment_id=a.id
 JOIN clients c ON c.id=ap.client_id
 WHERE a.start_at>=UTC_TIMESTAMP() AND a.status IN ('scheduled','confirmed','client_confirmed')
 AND a.business_type IN ('tutoring','learning','mental_health','healthcare')
 AND (a.business_type IN ('tutoring','learning') OR c.client_type NOT IN ('learning','tutoring'))
 AND (c.agency_id=a.agency_id OR EXISTS (SELECT 1 FROM client_agency_assignments ca WHERE ca.client_id=c.id AND ca.agency_id=a.agency_id AND ca.is_active=1))
 AND NOT EXISTS (SELECT 1 FROM client_service_enrollments e WHERE e.client_id=c.id AND e.agency_id=a.agency_id
 AND e.provider_user_id=COALESCE(a.provider_user_id,0) AND e.service_kind=IF(a.business_type IN ('tutoring','learning'),'tutoring','counseling'));

INSERT IGNORE INTO client_service_enrollments (client_id,agency_id,service_kind,provider_user_id,organization_id,label)
 SELECT DISTINCT s.client_id,s.agency_id,'tutoring',COALESCE(s.primary_tutor_user_id,0),0,'Tutoring'
 FROM student_subjects s JOIN clients c ON c.id=s.client_id
 WHERE s.status NOT IN ('completed','discharged')
 AND (c.agency_id=s.agency_id OR EXISTS (SELECT 1 FROM client_agency_assignments ca WHERE ca.client_id=c.id AND ca.agency_id=s.agency_id AND ca.is_active=1))
 AND NOT EXISTS (SELECT 1 FROM client_service_enrollments e WHERE e.client_id=s.client_id AND e.agency_id=s.agency_id AND e.service_kind='tutoring' AND e.provider_user_id=COALESCE(s.primary_tutor_user_id,0));
