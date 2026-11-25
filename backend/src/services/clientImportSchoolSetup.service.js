import pool from '../config/database.js';
import { ensureSchoolServiceLocation } from './officeBillingSites.service.js';
import { ensureClientService } from './clientServiceEnrollment.service.js';
import { hasTerminalClientStatus } from './clientTerminationRoster.service.js';

export async function resolveClientImportSchool({ clientId, agencyId, requestedSchoolId }, db = pool) {
  const schoolId = Number(requestedSchoolId || 0);
  if (requestedSchoolId && (!Number.isSafeInteger(schoolId) || schoolId < 1)) return null;
  const [[school]] = await db.execute(
    `SELECT school.id FROM clients c
     JOIN agencies school ON school.organization_type='school' AND school.is_active=1 AND COALESCE(school.is_archived,0)=0
     LEFT JOIN client_organization_assignments coa
       ON coa.client_id=c.id AND coa.organization_id=school.id AND coa.is_active=1
     WHERE c.id=? AND c.agency_id=?
       AND ((? > 0 AND school.id=?) OR (?=0 AND
         (school.id=c.organization_id OR coa.is_primary=1 OR (c.client_type='school' AND coa.organization_id IS NOT NULL))))
       AND (EXISTS (SELECT 1 FROM organization_affiliations oa
         WHERE oa.agency_id=c.agency_id AND oa.organization_id=school.id AND oa.is_active=1)
         OR EXISTS (SELECT 1 FROM agency_schools legacy
         WHERE legacy.agency_id=c.agency_id AND legacy.school_organization_id=school.id AND COALESCE(legacy.is_active,1)=1))
     ORDER BY (school.id=c.organization_id) DESC, coa.is_primary DESC, school.id
     LIMIT 1`, [clientId, agencyId, schoolId, schoolId, schoolId]
  );
  return school || null;
}

/** A roster assignment supplies the counseling provider and the school's billing site. */
export async function syncClientImportSchoolSetup(scope, actorId, { preserveDefaults = false } = {}) {
  const { clientId, agencyId } = scope;
  const db = await pool.getConnection();
  try {
    await db.beginTransaction();
    const [[client]] = await db.execute(
      `SELECT c.id,c.status,c.compliance_archived_at,c.organization_id,c.provider_id,s.status_key AS client_status_key
       FROM clients c LEFT JOIN client_statuses s ON s.id=c.client_status_id
       WHERE c.id=? AND c.agency_id=? FOR UPDATE`, [clientId, agencyId]
    );
    const school = client && !['ARCHIVED','TERMINATED'].includes(client.status) && !client.compliance_archived_at && !hasTerminalClientStatus(client) && await resolveClientImportSchool(scope, db);
    if (!school) {
      await db.commit();
      return null;
    }
    const [roster] = await db.execute(
      `SELECT DISTINCT cpa.provider_user_id, cpa.is_primary
       FROM client_provider_assignments cpa JOIN users u ON u.id=cpa.provider_user_id
       WHERE cpa.client_id=? AND cpa.organization_id=? AND cpa.is_active=1
         AND COALESCE(u.is_active,1)=1 AND COALESCE(u.is_archived,0)=0 AND u.terminated_at IS NULL
       ORDER BY cpa.is_primary DESC, cpa.provider_user_id`, [clientId, school.id]
    );
    const activeRoster = [...new Set(roster.map(row => Number(row.provider_user_id)))];
    const legacyProvider = Number(client.organization_id) === Number(school.id) ? Number(client.provider_id) : 0;
    let providerId = Number(roster.find(row => Number(row.is_primary)===1)?.provider_user_id)
      || (activeRoster.includes(legacyProvider) ? legacyProvider : 0)
      || (activeRoster.length === 1 ? activeRoster[0] : 0);
    if (!activeRoster.length && legacyProvider) {
      const [[legacy]] = await db.execute(
        `SELECT u.id FROM users u JOIN user_agencies m ON m.user_id=u.id AND m.agency_id=? AND m.is_active=1
         WHERE u.id=? AND COALESCE(u.is_active,1)=1 AND COALESCE(u.is_archived,0)=0 AND u.terminated_at IS NULL
           AND NOT EXISTS (SELECT 1 FROM client_provider_assignments a
             WHERE a.client_id=? AND a.organization_id=? AND a.provider_user_id=u.id)
         LIMIT 1`, [agencyId, legacyProvider, clientId, school.id]
      );
      providerId = Number(legacy?.id || 0);
    }
    if (providerId) {
      await ensureClientService({ clientId, agencyId, providerUserId: providerId, serviceKind: 'counseling', userId: actorId }, db);
    }
    const location = await ensureSchoolServiceLocation({ agencyId, schoolOrganizationId: school.id, actorUserId: actorId, db });
    if (!location?.id) throw Object.assign(new Error('The school billing location could not be saved.'), { status: 409 });
    if (!preserveDefaults) {
      await db.execute(
        "UPDATE clients SET default_place_of_service='03',default_service_location_id=? WHERE id=? AND agency_id=?",
        [location.id, clientId, agencyId]
      );
      await db.execute(
        "UPDATE client_agency_assignments SET default_place_of_service='03',default_service_location_id=? WHERE client_id=? AND agency_id=? AND is_active=1",
        [location.id, clientId, agencyId]
      );
    }
    await db.commit();
    return { schoolOrganizationId: Number(school.id), providerId: providerId || null,
      providerIds: activeRoster, placeOfService: '03', serviceLocation: { id: location.id, name: location.name } };
  } catch (error) {
    await db.rollback();
    throw error;
  } finally {
    db.release();
  }
}
