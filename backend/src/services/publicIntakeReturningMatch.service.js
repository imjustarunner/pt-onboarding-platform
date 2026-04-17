import pool from '../config/database.js';
import Agency from '../models/Agency.model.js';
import { deriveInitials } from './publicIntakeClient.service.js';

function norm(s) {
  return String(s || '')
    .trim()
    .toLowerCase()
    .replace(/\s+/g, ' ');
}

/**
 * When enabled per agency, resolve a single existing client for a returning guardian
 * using signer email + school label + participant initials.
 *
 * @returns {Promise<{ clientId: number, initials: string } | null>}
 */
export async function tryReturningGuardianAutoMatch({
  agencyId,
  signerEmail,
  schoolNameInput,
  participantFullName
}) {
  const aid = Number(agencyId || 0) || null;
  const email = String(signerEmail || '').trim().toLowerCase();
  const schoolNorm = norm(schoolNameInput);
  const fullName = String(participantFullName || '').trim();
  const initials = String(deriveInitials(fullName) || '').trim();
  if (!aid || !email.includes('@') || !schoolNorm || !initials) return null;

  try {
    const [rows] = await pool.execute(
      `SELECT DISTINCT c.id AS id, c.initials AS initials
       FROM users u
       INNER JOIN client_guardians cg ON cg.guardian_user_id = u.id
       INNER JOIN clients c ON c.id = cg.client_id AND c.agency_id = ?
       INNER JOIN client_organization_assignments coa
         ON coa.client_id = c.id AND coa.is_active = TRUE
       INNER JOIN agencies org ON org.id = coa.organization_id
       LEFT JOIN school_profiles sp ON sp.organization_id = org.id
       WHERE LOWER(TRIM(u.email)) = ?
         AND LOWER(TRIM(u.role)) = 'client_guardian'
         AND LOWER(TRIM(c.initials)) = LOWER(TRIM(?))
         AND (
           LOWER(TRIM(org.name)) = ?
           OR LOWER(TRIM(COALESCE(sp.location_label, ''))) = ?
         )
       LIMIT 5`,
      [aid, email, initials, schoolNorm, schoolNorm]
    );
    if (!Array.isArray(rows) || rows.length !== 1) return null;
    const id = Number(rows[0].id || 0) || null;
    if (!id) return null;
    return { clientId: id, initials: String(rows[0].initials || initials || '').trim() };
  } catch (e) {
    console.warn('[returningMatch] query failed', { agencyId: aid, message: e?.message });
    return null;
  }
}

export async function agencyReturningGuardianAutoMatchEnabled(agencyId) {
  const aid = Number(agencyId || 0) || null;
  if (!aid) return false;
  try {
    const row = await Agency.findById(aid);
    const raw = row?.feature_flags;
    const flags = typeof raw === 'string' ? (() => { try { return JSON.parse(raw); } catch { return {}; } })() : (raw || {});
    return flags.returningGuardianAutoMatchEnabled === true;
  } catch {
    return false;
  }
}
