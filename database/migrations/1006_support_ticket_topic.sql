-- Migration 1006: ticket topic / audience for responsibility routing
-- general | billing | credentialing | payroll
-- Billing → has_billing_access + admin; credentialing → can_manage_credentialing + admin;
-- payroll → has_payroll_access + admin. Admin always sees all; flags mark responsibility.

ALTER TABLE support_tickets
  ADD COLUMN topic VARCHAR(32) NOT NULL DEFAULT 'general'
  COMMENT 'Audience/topic: general | billing | credentialing | payroll';

CREATE INDEX idx_support_tickets_topic_status
  ON support_tickets (topic, status, agency_id);
