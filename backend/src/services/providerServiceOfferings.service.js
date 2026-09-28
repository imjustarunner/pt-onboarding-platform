import pool from '../config/database.js';
import { providerServiceSettings, validateProviderServices } from '../utils/providerServiceOfferings.js';

export async function readProviderServices(providerId, agencyId, database = pool) {
  const [types] = await database.execute('SELECT service_type,display_name FROM agency_public_service_types WHERE agency_id=? AND is_enabled=1 ORDER BY sort_order,service_type', [agencyId]);
  const [enrollments] = await database.execute('SELECT service_type,is_active FROM provider_public_service_enrollments WHERE user_id=? AND agency_id=?', [providerId, agencyId]);
  const [[person]] = await database.execute(`SELECT u.role,u.status,u.has_provider_access,ua.agency_role,a.name AS agency_name,a.organization_type,p.public_details_json
    FROM users u JOIN user_agencies ua ON ua.user_id=u.id AND ua.agency_id=? JOIN agencies a ON a.id=ua.agency_id
    LEFT JOIN provider_public_profiles p ON p.user_id=u.id WHERE u.id=?`, [agencyId, providerId]);
  return { agencyId, agencyName: person?.agency_name || '', services: providerServiceSettings(person, agencyId, types, enrollments) };
}

export async function saveProviderServices(providerId, agencyId, selected, onlineScheduling) {
  const connection = await pool.getConnection();
  try {
    await connection.beginTransaction();
    await connection.execute('SELECT id FROM users WHERE id=? FOR UPDATE', [providerId]);
    const current = await readProviderServices(providerId, agencyId, connection);
    const services = validateProviderServices(selected, current.services.map(s => s.serviceType));
    const online = onlineScheduling === undefined ? null : validateProviderServices(onlineScheduling, services);
    // Update only this tenant's choices; never overwrite the rest of the public profile.
    await connection.execute(`INSERT INTO provider_public_profiles (user_id,public_details_json)
      VALUES (?,CAST(? AS JSON))
      ON DUPLICATE KEY UPDATE public_details_json=JSON_MERGE_PATCH(COALESCE(public_details_json,JSON_OBJECT()),VALUES(public_details_json)),updated_at=CURRENT_TIMESTAMP`,
      [providerId,JSON.stringify({serviceOfferingsByAgency:{[String(agencyId)]:services}})]);
    // Turning a service off also disables its booking enrollment. Turning it on never enables booking.
    for (const service of current.services) if (!services.includes(service.serviceType)) {
      await connection.execute('UPDATE provider_public_service_enrollments SET is_active=0 WHERE user_id=? AND agency_id=? AND service_type=?', [providerId, agencyId, service.serviceType]);
    }
    if (online !== null) for (const service of current.services) {
      await connection.execute(`INSERT INTO provider_public_service_enrollments (agency_id,user_id,service_type,is_active)
       VALUES (?,?,?,?) ON DUPLICATE KEY UPDATE is_active=VALUES(is_active),updated_at=CURRENT_TIMESTAMP`,
       [agencyId,providerId,service.serviceType,online.includes(service.serviceType)?1:0]);
    }
    const result = await readProviderServices(providerId, agencyId, connection);
    await connection.commit();
    return result;
  } catch (e) { await connection.rollback(); throw e; } finally { connection.release(); }
}
