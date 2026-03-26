/**
 * Public “program enrollment” listings backed by learning_program_classes + intake_links.
 * Distinct from company_events; used on /enroll surfaces.
 */

const PUBLIC_CLASS_REGISTRATION_SQL = `c.registration_eligible = 1
       AND c.status = 'active'
       AND c.is_active = 1
       AND (c.enrollment_closes_at IS NULL OR c.enrollment_closes_at >= NOW())
       AND (c.enrollment_opens_at IS NULL OR c.enrollment_opens_at <= NOW())
       AND EXISTS (
         SELECT 1 FROM intake_links il
         WHERE il.learning_class_id = c.id
           AND il.is_active = 1
           AND (il.company_event_id IS NULL OR il.company_event_id = 0)
       )`;

const ENROLLMENT_SELECT = `c.id, c.class_name, c.description, c.timezone,
       c.starts_at, c.ends_at, c.enrollment_opens_at, c.enrollment_closes_at, c.status,
       c.delivery_mode,
       (SELECT il.public_key FROM intake_links il
        WHERE il.learning_class_id = c.id
          AND (il.company_event_id IS NULL OR il.company_event_id = 0)
          AND il.is_active = 1
        ORDER BY
          CASE WHEN LOWER(COALESCE(il.form_type, '')) = 'smart_registration' THEN 0 ELSE 1 END,
          il.id DESC
        LIMIT 1) AS registration_public_key`;

export function formatPublicEnrollment(row) {
  const regKey = row.registration_public_key != null ? String(row.registration_public_key).trim() : '';
  return {
    kind: 'enrollment',
    id: Number(row.id),
    title: String(row.class_name || '').trim() || 'Program enrollment',
    description: row.description ? String(row.description) : null,
    timezone: row.timezone || 'America/New_York',
    startsAt: row.starts_at || null,
    endsAt: row.ends_at || null,
    enrollmentOpensAt: row.enrollment_opens_at || null,
    enrollmentClosesAt: row.enrollment_closes_at || null,
    status: row.status || 'active',
    deliveryMode: String(row.delivery_mode || 'group').toLowerCase() === 'individual' ? 'individual' : 'group',
    registrationEligible: true,
    registrationPublicKey: regKey || null
  };
}

/**
 * Enrollments for a program organization (learning org or program-type org with classes).
 */
export async function loadPublicProgramEnrollmentRows(conn, programOrgId) {
  const oid = Number(programOrgId);
  if (!Number.isFinite(oid) || oid <= 0) return [];
  const [rows] = await conn.execute(
    `SELECT ${ENROLLMENT_SELECT}
     FROM learning_program_classes c
     WHERE c.organization_id = ?
       AND ${PUBLIC_CLASS_REGISTRATION_SQL}
     ORDER BY c.class_name ASC
     LIMIT 100`,
    [oid]
  );
  return (rows || []).map((r) => formatPublicEnrollment(r));
}

