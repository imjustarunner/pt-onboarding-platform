-- Migration 1127: Supervisor's Meeting for supervisor Log Time column

INSERT IGNORE INTO payroll_indirect_service_types
  (agency_id, type_key, label, description, icon_key, pay_bucket, sort_order, is_active)
SELECT a.id, v.type_key, v.label, v.description, v.icon_key, v.pay_bucket, v.sort_order, 1
FROM agencies a
CROSS JOIN (
  SELECT 'supervisors_meeting' AS type_key, 'Supervisor''s Meeting' AS label,
         'Supervisor meeting when not auto-logged (paid at Admin Time rate)' AS description,
         'users' AS icon_key, 'supervision_note' AS pay_bucket, 320 AS sort_order
) v;

UPDATE payroll_indirect_service_types pist
INNER JOIN (
  SELECT a.id AS agency_id, v.type_key, v.label, v.description, v.icon_key, v.pay_bucket, v.sort_order
  FROM agencies a
  CROSS JOIN (
    SELECT 'supervisors_meeting' AS type_key, 'Supervisor''s Meeting' AS label,
           'Supervisor meeting when not auto-logged (paid at Admin Time rate)' AS description,
           'users' AS icon_key, 'supervision_note' AS pay_bucket, 320 AS sort_order
  ) v
) seed ON pist.agency_id = seed.agency_id AND pist.type_key = seed.type_key
SET pist.label = seed.label,
    pist.description = seed.description,
    pist.icon_key = seed.icon_key,
    pist.pay_bucket = seed.pay_bucket,
    pist.sort_order = seed.sort_order,
    pist.is_active = 1;
