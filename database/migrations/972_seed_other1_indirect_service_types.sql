-- Migration 972: Seed Type 2 (Other 1) hourly service types for all agencies

INSERT IGNORE INTO payroll_indirect_service_types
  (agency_id, type_key, label, description, icon_key, pay_bucket, sort_order, is_active)
SELECT a.id, v.type_key, v.label, v.description, v.icon_key, 'other_1', v.sort_order, 1
FROM agencies a
CROSS JOIN (
  SELECT 'training_meetings' AS type_key, 'Training Meetings' AS label,
         'Staff training and development meetings' AS description, 'users' AS icon_key, 210 AS sort_order
  UNION ALL SELECT 'outreach_meetings', 'Outreach Meetings',
         'Outreach planning and coordination meetings', 'megaphone', 220
  UNION ALL SELECT 'bilingual_coordination', 'Bilingual Coordination',
         'Bilingual coordination and language-support work', 'handshake', 230
  UNION ALL SELECT 'bilingual_intakes_not_billed', 'Bilingual Intakes (Not Billed)',
         'Non-billed bilingual intake work', 'user-check', 240
  UNION ALL SELECT 'back_to_school_events', 'Back to School Events',
         'Back-to-school and school kickoff events', 'book', 250
  UNION ALL SELECT 'other_type_2', 'Other (Type 2)',
         'Other approved Other 1 / Type 2 work', 'more', 260
) v;
