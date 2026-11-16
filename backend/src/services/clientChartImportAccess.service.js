import pool from '../config/database.js';

export const chartImportRoles = ['super_admin', 'admin', 'support', 'provider', 'provider_plus'];

// School membership, billing access, and a school ROI never grant this access.
export async function requireClientChartImportAccess(user, clientId, agencyId = null, db = pool) {
  const role = String(user?.role || '').toLowerCase();
  const deny = () => Object.assign(new Error('Assigned provider, support, or administrator access required'), { status: 403 });
  if (!chartImportRoles.includes(role)) throw deny();
  const cid = Number(clientId), uid = Number(user?.id);
  if (!Number.isSafeInteger(cid) || cid <= 0 || !Number.isSafeInteger(uid) || uid <= 0) throw deny();
  const [rows] = await db.execute(`SELECT c.id,c.agency_id FROM clients c
    JOIN agencies a ON a.id=c.agency_id
    WHERE c.id=? AND a.is_active=1 AND COALESCE(a.is_archived,0)=0
      AND (?='super_admin'
        OR (? IN ('admin','support') AND EXISTS (
          SELECT 1 FROM user_agencies ua WHERE ua.user_id=? AND ua.agency_id=c.agency_id AND ua.is_active=1))
        OR (? IN ('provider','provider_plus') AND (c.provider_id=? OR EXISTS (
          SELECT 1 FROM client_provider_assignments p WHERE p.client_id=c.id AND p.provider_user_id=? AND p.is_active=1))))`,
  [cid, role, role, uid, role, uid, uid]);
  const client = rows[0];
  if (!client || (agencyId != null && Number(agencyId) !== Number(client.agency_id))) throw deny();
  return { clientId: Number(client.id), agencyId: Number(client.agency_id) };
}
