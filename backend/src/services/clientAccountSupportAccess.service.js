import pool from '../config/database.js';
import { billingError, positiveId } from './familyBillingPolicy.service.js';

// Account support is a direct agency role, never a delegated billing grant.
// This check does not grant access to financial, claims, or clinical routes.
export async function requireClientAccountSupport(user, clientId, agencyId = null, db = pool) {
  const role = String(user?.role || '').toLowerCase();
  if (!['super_admin', 'admin', 'support'].includes(role)) {
    throw billingError(403, 'Client account support access required');
  }
  const uid = positiveId(user?.id), cid = positiveId(clientId);
  const [rows] = await db.execute(`SELECT c.id,c.agency_id,c.organization_id,c.client_type
    FROM clients c JOIN agencies a ON a.id=c.agency_id
    WHERE c.id=? AND a.is_active=1 AND COALESCE(a.is_archived,0)=0
      AND (?='super_admin' OR EXISTS(SELECT 1 FROM user_agencies ua
        WHERE ua.user_id=? AND ua.agency_id=c.agency_id AND ua.is_active=1))`, [cid,role,uid]);
  const client = rows[0];
  if (!client || (agencyId != null && positiveId(agencyId) !== Number(client.agency_id))) {
    throw billingError(403, 'Client account support access required for this agency');
  }
  return client;
}
