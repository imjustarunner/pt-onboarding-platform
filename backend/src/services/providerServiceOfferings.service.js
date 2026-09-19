import pool from '../config/database.js';
import { offersProviderService, validateProviderServices } from '../utils/providerServiceOfferings.js';

export async function readProviderServices(providerId, agencyId, database = pool) {
  const [types] = await database.execute('SELECT service_type,display_name FROM agency_public_service_types WHERE agency_id=? AND is_enabled=1 ORDER BY sort_order,service_type', [agencyId]);
  const [enrollments] = await database.execute('SELECT service_type,is_active FROM provider_public_service_enrollments WHERE user_id=? AND agency_id=?', [providerId, agencyId]);
  const [[person]] = await database.execute(`SELECT u.role,u.status,u.has_provider_access,ua.agency_role,a.name AS agency_name,a.organization_type,p.public_details_json
    FROM users u JOIN user_agencies ua ON ua.user_id=u.id AND ua.agency_id=? JOIN agencies a ON a.id=ua.agency_id
    LEFT JOIN provider_public_profiles p ON p.user_id=u.id WHERE u.id=?`, [agencyId, providerId]);
  const role = person?.agency_role || person?.role;
  const counselingEligible = ['ACTIVE','ACTIVE_EMPLOYEE'].includes(String(person?.status || '').toUpperCase()) && (['provider','provider_plus','intern','intern_plus','facilitator','supervisor','admin','super_admin'].includes(role) || Boolean(person?.has_provider_access));
  return { agencyId, agencyName: person?.agency_name || '', services: types.map(type => {
    const enrollment = enrollments.find(e => e.service_type === type.service_type);
    return { serviceType: type.service_type, displayName: type.display_name || type.service_type,
      offered: offersProviderService(person?.public_details_json, agencyId, type.service_type, {enrolled: Boolean(enrollment?.is_active) || (!enrollment && ['coaching','consulting'].includes(type.service_type) && ['life_coach','consultant'].includes(person?.organization_type) && person?.status === 'ACTIVE_EMPLOYEE' && ['admin','provider','provider_plus','super_admin','staff'].includes(person?.role)), hasEnrollment: Boolean(enrollment), counselingEligible}),
      onlineScheduling: Boolean(enrollment?.is_active) };
  }) };
}

export async function saveProviderServices(providerId, agencyId, selected) {
  const connection = await pool.getConnection();
  try {
    await connection.beginTransaction();
    await connection.execute('SELECT id FROM users WHERE id=? FOR UPDATE', [providerId]);
    const current = await readProviderServices(providerId, agencyId, connection);
    const services = validateProviderServices(selected, current.services.map(s => s.serviceType));
    // Update only this tenant's choices; never overwrite the rest of the public profile.
    await connection.execute(`INSERT INTO provider_public_profiles (user_id,public_details_json)
      VALUES (?,CAST(? AS JSON))
      ON DUPLICATE KEY UPDATE public_details_json=JSON_MERGE_PATCH(COALESCE(public_details_json,JSON_OBJECT()),VALUES(public_details_json)),updated_at=CURRENT_TIMESTAMP`,
      [providerId,JSON.stringify({serviceOfferingsByAgency:{[String(agencyId)]:services}})]);
    // Turning a service off also disables its booking enrollment. Turning it on never enables booking.
    for (const service of current.services) if (!services.includes(service.serviceType)) {
      await connection.execute('UPDATE provider_public_service_enrollments SET is_active=0 WHERE user_id=? AND agency_id=? AND service_type=?', [providerId, agencyId, service.serviceType]);
    }
    const result = await readProviderServices(providerId, agencyId, connection);
    await connection.commit();
    return result;
  } catch (e) { await connection.rollback(); throw e; } finally { connection.release(); }
}
