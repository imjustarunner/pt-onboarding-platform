-- Migration 967: Seed default hourly indirect service types for all agencies

INSERT IGNORE INTO payroll_indirect_service_types
  (agency_id, type_key, label, description, icon_key, sort_order, is_active)
SELECT a.id, v.type_key, v.label, v.description, v.icon_key, v.sort_order, 1
FROM agencies a
CROSS JOIN (
  SELECT 'preparing_for_sessions' AS type_key, 'Preparing for Sessions' AS label, 'Prep materials and plan for upcoming sessions' AS description, 'book' AS icon_key, 10 AS sort_order
  UNION ALL SELECT 'writing_notes', 'Writing Notes', 'Write clinical or session documentation', 'file-text', 20
  UNION ALL SELECT 'non_billable_contacts', 'Non-Billable Contacts', 'Phone and outreach contacts that are not billable', 'phone', 30
  UNION ALL SELECT 'prep_for_outreach', 'Prep for Outreach Events', 'Prepare for community or outreach events', 'megaphone', 40
  UNION ALL SELECT 'travel_for_outreach', 'Travel for Outreach Events', 'Travel time related to outreach events', 'car', 50
  UNION ALL SELECT 'virtual_outreach', 'Virtual Outreach', 'Virtual outreach and community engagement', 'laptop', 60
  UNION ALL SELECT 'treatment_planning', 'Treatment Planning (Non-Billable)', 'Non-billable treatment planning work', 'clipboard', 70
  UNION ALL SELECT 'case_consultations', 'Case Consultations (Non-Billable)', 'Non-billable case consultation time', 'users', 80
  UNION ALL SELECT 'documentation_emr', 'Documentation / EMR (Non-Billable)', 'Non-billable EMR and chart documentation', 'monitor', 90
  UNION ALL SELECT 'client_follow_up', 'Client Follow-Up (Non-Billable)', 'Non-billable client follow-up activities', 'user-check', 100
  UNION ALL SELECT 'resource_coordination', 'Resource Coordination (Non-Billable)', 'Coordinate resources and supports', 'handshake', 110
  UNION ALL SELECT 'other_indirect', 'Other Indirect', 'Other approved indirect work', 'more', 120
) v;
