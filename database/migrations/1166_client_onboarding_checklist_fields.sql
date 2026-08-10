-- Migration 1166: Client onboarding checklist fields (doc verify + staff completion timestamp).
ALTER TABLE clients
  ADD COLUMN onboarding_docs_json JSON NULL
  COMMENT 'Packet document verification: { items: [{ key, status: present|missing|na }] }';

ALTER TABLE clients
  ADD COLUMN staff_onboarding_completed_at DATETIME NULL
  COMMENT 'When staff completed New Client Onboarding (status → onboarded)';

ALTER TABLE clients
  ADD COLUMN staff_onboarding_completed_by_user_id INT NULL
  COMMENT 'User who marked staff onboarding complete';
