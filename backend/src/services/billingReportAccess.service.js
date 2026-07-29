import pool from '../config/database.js';
import { getSupervisorSuperviseeIds } from '../utils/supervisorSchoolAccess.js';

const FINANCIAL_ROLES = new Set(['super_admin', 'admin', 'support']);

const MEDICAL_RECORD_ROLES = new Set([
  'super_admin',
  'admin',
  'support',
  'provider',
  'provider_plus',
  'supervisor',
  'clinical_practice_assistant'
]);

export function canAccessBillingFinancials(role) {
  return FINANCIAL_ROLES.has(String(role || '').toLowerCase());
}

export function canAccessMedicalRecord(role) {
  return MEDICAL_RECORD_ROLES.has(String(role || '').toLowerCase());
}

export async function providerHasAssignedClient({ userId, clientId }) {
  const uid = Number(userId || 0);
  const cid = Number(clientId || 0);
  if (!uid || !cid) return false;

  try {
    const [rows] = await pool.execute(
      `SELECT 1
       FROM client_provider_assignments
       WHERE client_id = ? AND provider_user_id = ? AND is_active = TRUE
       LIMIT 1`,
      [cid, uid]
    );
    if (rows?.[0]) return true;
  } catch {
    // fall through
  }

  const [legacy] = await pool.execute(
    `SELECT 1 FROM clients WHERE id = ? AND provider_id = ? LIMIT 1`,
    [cid, uid]
  );
  return !!legacy?.[0];
}

export async function supervisorHasClientViaSupervisee({ supervisorUserId, agencyId, clientId }) {
  const superviseeIds = await getSupervisorSuperviseeIds(supervisorUserId, agencyId);
  if (!superviseeIds.length) return false;
  const placeholders = superviseeIds.map(() => '?').join(', ');

  const [cpa] = await pool.execute(
    `SELECT 1
     FROM client_provider_assignments
     WHERE client_id = ? AND provider_user_id IN (${placeholders}) AND is_active = TRUE
     LIMIT 1`,
    [clientId, ...superviseeIds]
  );
  if (cpa?.[0]) return true;

  const [be] = await pool.execute(
    `SELECT 1
     FROM billing_encounters
     WHERE client_id = ? AND agency_id = ? AND provider_user_id IN (${placeholders})
     LIMIT 1`,
    [clientId, agencyId, ...superviseeIds]
  );
  return !!be?.[0];
}

/**
 * Admin / support billing import financials.
 */
export async function ensureBillingFinancialAccess(req, res, { agencyId }) {
  const role = String(req.user?.role || '').toLowerCase();
  if (!canAccessBillingFinancials(role)) {
    res.status(403).json({ error: { message: 'Billing import access requires admin, super admin, or support role' } });
    return false;
  }
  if (role === 'super_admin') return true;
  const userId = Number(req.user?.id || 0);
  const [ua] = await pool.execute(
    `SELECT 1 FROM user_agencies WHERE user_id = ? AND agency_id = ? LIMIT 1`,
    [userId, agencyId]
  );
  if (!ua?.length) {
    res.status(403).json({ error: { message: 'Access denied' } });
    return false;
  }
  return true;
}

/**
 * Medical record / clinical notes on imported encounters.
 */
export async function ensureMedicalRecordAccess(req, res, { agencyId, clientId }) {
  const role = String(req.user?.role || '').toLowerCase();
  if (!canAccessMedicalRecord(role)) {
    res.status(403).json({ error: { message: 'Medical record access denied' } });
    return false;
  }
  if (role === 'super_admin') return true;

  const userId = Number(req.user?.id || 0);
  const [ua] = await pool.execute(
    `SELECT 1 FROM user_agencies WHERE user_id = ? AND agency_id = ? LIMIT 1`,
    [userId, agencyId]
  );
  if (!ua?.length) {
    res.status(403).json({ error: { message: 'Access denied' } });
    return false;
  }

  if (['admin', 'support', 'clinical_practice_assistant'].includes(role)) {
    return true;
  }

  if (role === 'supervisor') {
    const ok = await supervisorHasClientViaSupervisee({ supervisorUserId: userId, agencyId, clientId });
    if (!ok) {
      res.status(403).json({ error: { message: 'Supervisor access requires a supervisee assigned to this client' } });
      return false;
    }
    return true;
  }

  if (['provider', 'provider_plus'].includes(role)) {
    const ok = await providerHasAssignedClient({ userId, clientId });
    if (!ok) {
      res.status(403).json({ error: { message: 'Assigned provider access is required for this client' } });
      return false;
    }
    return true;
  }

  res.status(403).json({ error: { message: 'Access denied' } });
  return false;
}
