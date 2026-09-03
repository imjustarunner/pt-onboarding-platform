import pool from '../config/database.js';
import { provisionSchoolGoogleGroup } from '../services/schoolGroupProvisioning.service.js';

async function main() {
  const query = String(process.argv[2] || 'doherty').trim();
  const [rows] = await pool.execute(
    `SELECT a.id AS school_organization_id,
            a.name,
            a.slug,
            sp.itsco_email,
            oa.agency_id,
            parent.slug AS agency_slug
     FROM agencies a
     LEFT JOIN school_profiles sp ON sp.school_organization_id = a.id
     LEFT JOIN organization_affiliations oa
       ON oa.organization_id = a.id AND oa.is_active = TRUE
     LEFT JOIN agencies parent ON parent.id = oa.agency_id
     WHERE LOWER(COALESCE(a.organization_type, '')) = 'school'
       AND (
         LOWER(a.name) LIKE ?
         OR LOWER(COALESCE(a.slug, '')) LIKE ?
         OR LOWER(COALESCE(sp.itsco_email, '')) LIKE ?
       )
     ORDER BY a.id DESC
     LIMIT 8`,
    [`%${query.toLowerCase()}%`, `%${query.toLowerCase()}%`, `%${query.toLowerCase()}%`]
  );

  if (!rows?.length) {
    console.error(`No school matched "${query}"`);
    process.exit(1);
  }

  console.log('[provisionSchoolGoogleGroup] matches:', rows.map((r) => ({
    id: r.school_organization_id,
    name: r.name,
    group: r.itsco_email,
    agencyId: r.agency_id
  })));

  const school = rows[0];
  const groupEmail = String(school.itsco_email || '').trim().toLowerCase();
  if (!groupEmail.includes('@')) {
    console.error('School has no itsco_email / Google Group address on school_profiles');
    process.exit(1);
  }

  const result = await provisionSchoolGoogleGroup({
    agencyId: school.agency_id,
    schoolOrganizationId: school.school_organization_id,
    groupEmail,
    schoolName: school.name
  });

  console.log('[provisionSchoolGoogleGroup] done');
  console.log(JSON.stringify(result, null, 2));
  process.exit(result?.ok ? 0 : 1);
}

main().catch((e) => {
  console.error('[provisionSchoolGoogleGroup] error:', e?.message || e);
  process.exit(1);
});
