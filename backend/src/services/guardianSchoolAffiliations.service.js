import pool from '../config/database.js';
import { guardianCanReadIntakeDocuments } from '../utils/guardianDocumentAccess.js';

// Display context only: an affiliation never grants school staff or guardian access.
// Call with the already-authorized, guardian-safe overview rows, never request IDs.
export async function attachGuardianSchoolAffiliations(clients = [], { guardianUserId, providerClientIds = [], documentClientIds = [] } = {}) {
  const visible = clients.filter(c => !c.no_view && (!c.guardian_portal_locked || c.relationship_type === 'self'));
  const ids = visible.map(c => Number(c.client_id)).filter(id => id > 0);
  if (!ids.length) return clients.map(c => ({ ...c, school_affiliations: [] }));
  const [rows] = await pool.execute(
    `SELECT coa.client_id, coa.organization_id, a.name, a.logo_url,
            coa.is_active, coa.is_primary
     FROM client_organization_assignments coa
     JOIN agencies a ON a.id = coa.organization_id AND a.organization_type = 'school'
     WHERE coa.client_id IN (${ids.map(() => '?').join(',')})
     ORDER BY coa.is_active DESC, coa.is_primary DESC, a.name`, ids
  );
  const byClient = new Map(ids.map(id => [id, []]));
  for (const row of rows) {
    byClient.get(Number(row.client_id))?.push({
      organization_id: Number(row.organization_id), name: row.name,
      logo_url: row.logo_url || null,
      status: Number(row.is_active) === 1 ? 'current' : 'former',
      is_primary: Number(row.is_primary) === 1
    });
  }
  const result = clients.map(client => {
    const schools = byClient.get(Number(client.client_id));
    // Legacy primary schools remain visible; an explicit inactive record wins.
    if (schools && client.organization_type === 'school' && !schools.some(s => s.organization_id === Number(client.organization_id))) {
      schools.unshift({ organization_id: Number(client.organization_id), name: client.organization_name,
        logo_url: client.organization_logo_url || null, status: 'current', is_primary: true });
    }
    return { ...client, school_affiliations: schools || [] };
  });
  const schoolClients = result.filter(c => c.school_affiliations.length);
  if (!schoolClients.length) return result;
  const schoolIds = schoolClients.map(c => Number(c.client_id));
  const placeholders = schoolIds.map(() => '?').join(',');
  const [[providers], [staff], [rois]] = await Promise.all([
    pool.execute(`SELECT p.client_id, p.organization_id, p.service_day, p.is_active,
                         TRIM(CONCAT(COALESCE(u.first_name,''), ' ', COALESCE(u.last_name,''))) AS name
                  FROM client_provider_assignments p JOIN users u ON u.id=p.provider_user_id
                  WHERE p.client_id IN (${placeholders})
                  UNION ALL
                  SELECT c.id, c.organization_id, c.service_day, 1,
                         TRIM(CONCAT(COALESCE(u.first_name,''), ' ', COALESCE(u.last_name,'')))
                  FROM clients c JOIN users u ON u.id=c.provider_id
                  WHERE c.id IN (${placeholders}) AND NOT EXISTS
                    (SELECT 1 FROM client_provider_assignments p WHERE p.client_id=c.id AND p.organization_id=c.organization_id)`, [...schoolIds, ...schoolIds]),
    pool.execute(`SELECT r.client_id, r.school_organization_id, r.access_level, r.is_active,
                         TRIM(CONCAT(COALESCE(u.first_name,''), ' ', COALESCE(u.last_name,''))) AS name
                  FROM client_school_staff_roi_access r JOIN users u ON u.id=r.school_staff_user_id
                  WHERE r.client_id IN (${placeholders}) ORDER BY u.last_name,u.first_name`, schoolIds),
    pool.execute(`SELECT r.client_id,r.school_organization_id,r.status,r.signed_at,
                         CASE WHEN c.organization_id=r.school_organization_id THEN c.roi_expires_at ELSE NULL END AS expires_at,
                         (SELECT MIN(d.id) FROM intake_submission_documents d
                          JOIN intake_submissions s ON s.id=d.intake_submission_id
                          WHERE s.id=r.latest_intake_submission_id AND s.guardian_user_id=?
                            AND d.client_id=r.client_id AND d.signed_pdf_path IS NOT NULL
                            AND JSON_EXTRACT(d.audit_trail,'$.smartSchoolRoi')=true) AS document_id
                  FROM client_school_roi_signing_links r JOIN clients c ON c.id=r.client_id
                  WHERE r.client_id IN (${placeholders})`, [Number(guardianUserId) || 0, ...schoolIds])
  ]);
  for (const client of schoolClients) for (const school of client.school_affiliations) {
    const sameSchool = row => Number(row.client_id) === Number(client.client_id) && Number(row.organization_id || row.school_organization_id) === school.organization_id;
    school.providers = providerClientIds.includes(Number(client.client_id)) ? providers.filter(sameSchool).map(p => ({
      name: p.name || 'Assigned provider', service_day: p.service_day || null,
      status: school.status === 'current' && Number(p.is_active) === 1 ? 'current' : 'former'
    })) : [];
    school.staff = staff.filter(sameSchool).map(s => ({ name: s.name || 'School staff member',
      access_level: s.access_level,
      status: school.status === 'current' && Number(s.is_active) === 1 ? 'current' : 'former'
    }));
    const roi = rois.find(sameSchool);
    const canRead = documentClientIds.includes(Number(client.client_id)) && guardianCanReadIntakeDocuments({access_enabled:1,permissions_json:client.permissions_json});
    school.roi = roi ? { status: roi.status, signed_at: roi.signed_at || null, expires_at: roi.expires_at || null,
      document_id: canRead ? Number(roi.document_id) || null : null } : {status:'not_on_file'};
  }
  return result;
}
