import pool from '../config/database.js';
import ClientGuardian from '../models/ClientGuardian.model.js';

const fail = message => Object.assign(new Error(message), { status: 409 });
const permissions = row => { try { return typeof row?.permissions_json === 'string' ? JSON.parse(row.permissions_json) : row?.permissions_json || {}; } catch { return { canSignDocs: false }; } };
export function canReceiveGuardianConsentRequest(row) {
  const p = permissions(row);
  return Number(row?.guardian_user_id) > 0 && Number(row.access_enabled) === 1
    && row.is_active !== false && Number(row.is_active ?? 1) !== 0
    && !['ARCHIVED', 'TERMINATED', 'INACTIVE'].includes(String(row.status || '').toUpperCase())
    && p.canSignDocs !== false && !p.noContact && !p.no_contact && !p.contactRestricted && !p.revoked && !p.relationshipRevoked
    && !ClientGuardian.isNoView(p);
}

/** Most restrictive explicit decision wins. An older signature cannot supersede a newer one. */
export function summarizeGuardianRoiDecisions(rows, { now = new Date() } = {}) {
  const latest = new Map();
  for (const row of rows || []) {
    const key = `${row.guardian_user_id}:${row.school_staff_user_id}`;
    const previous = latest.get(key);
    const stamp = new Date(row.signed_at).getTime();
    if (!Number.isFinite(stamp)) continue;
    if (!previous || stamp > new Date(previous.signed_at).getTime()
      || (stamp === new Date(previous.signed_at).getTime() && Number(row.intake_submission_id) > Number(previous.intake_submission_id))) latest.set(key, row);
  }
  const byStaff = new Map();
  for (const row of latest.values()) {
    const id = Number(row.school_staff_user_id);
    if (!byStaff.has(id)) byStaff.set(id, { schoolStaffUserId: id, decisions: [], effectiveDecision: 'none', conflict: false });
    const item = byStaff.get(id);
    const expired = !Number.isFinite(new Date(row.expires_at).getTime()) || new Date(row.expires_at) <= now;
    item.decisions.push({ guardianUserId: Number(row.guardian_user_id), guardianName: [row.first_name, row.last_name].filter(Boolean).join(' ') || `Guardian ${row.guardian_user_id}`, decision: row.decision, expired, signedAt: row.signed_at, submissionId: Number(row.intake_submission_id) });

  }
  for (const item of byStaff.values()) {
    const current = item.decisions.filter(row => !row.expired);
    // Expired permissions do not grant access or veto a current signed permission.
    // An explicit denial remains restrictive until that same guardian changes it.
    item.effectiveDecision = item.decisions.some(row => row.decision === 'none') || !current.length
      ? 'none' : current.some(row => row.decision === 'roi') ? 'roi' : 'roi_docs';
    item.conflict = new Set(item.decisions.filter(row => !row.expired || row.decision === 'none').map(row => row.decision)).size > 1;
  }
  return [...byStaff.values()];
}

export async function loadGuardianRoiConsentForClients({ clientIds, schoolOrganizationId, db = pool }) {
  const ids = [...new Set((clientIds || []).map(Number).filter(Boolean))];
  if (!ids.length) return new Map();
  const [rows] = await db.execute(`SELECT d.*, u.first_name, u.last_name
    FROM client_school_roi_guardian_decisions d
    JOIN users u ON u.id = d.guardian_user_id
    WHERE d.client_id IN (${ids.map(() => '?').join(',')}) AND d.school_organization_id = ?
    ORDER BY d.signed_at DESC, d.intake_submission_id DESC`, [...ids, schoolOrganizationId]);
  // Read existing signed evidence without rewriting historical releases. Older
  // signed denials must also survive another guardian's new approval.
  const [legacy] = await db.execute(`SELECT d.client_id, s.guardian_user_id, d.intake_submission_id,
      d.signed_at, DATE_ADD(d.signed_at, INTERVAL 3 YEAR) AS expires_at,
      JSON_EXTRACT(d.audit_trail, '$.roiResponse.staffDecisions') AS decisions_json,
      u.first_name, u.last_name
    FROM intake_submission_documents d
    JOIN intake_submissions s ON s.id = d.intake_submission_id
    JOIN intake_links l ON l.id = s.intake_link_id
    LEFT JOIN users u ON u.id = s.guardian_user_id
    WHERE d.client_id IN (${ids.map(() => '?').join(',')})
      AND l.organization_id = ? AND d.signed_at IS NOT NULL
      AND JSON_VALID(d.audit_trail) AND JSON_EXTRACT(d.audit_trail, '$.smartSchoolRoi') = TRUE`, [...ids, schoolOrganizationId]);
  const evidence = [...(rows || [])];
  for (const row of legacy || []) {
    let decisions; try { decisions = typeof row.decisions_json === 'string' ? JSON.parse(row.decisions_json) : row.decisions_json; } catch { decisions = []; }
    for (const decision of Array.isArray(decisions) ? decisions : []) {
      // An unattributed denial stays restrictive until its signer is reconciled.
      if (!Number(row.guardian_user_id) && decision.decision !== 'none') continue;
      evidence.push({ ...row, guardian_user_id: Number(row.guardian_user_id) || -Number(row.intake_submission_id),
        ...(!Number(row.guardian_user_id) ? { first_name: 'Signer identity needs review', last_name: '' } : {}),
        school_staff_user_id: Number(decision.schoolStaffUserId), decision: decision.decision });
    }
  }
  return new Map(ids.map(id => [id, summarizeGuardianRoiDecisions(evidence.filter(row => Number(row.client_id) === id))]));
}
export async function loadGuardianRoiConsent({ clientId, schoolOrganizationId, db = pool }) {
  return (await loadGuardianRoiConsentForClients({ clientIds: [clientId], schoolOrganizationId, db })).get(Number(clientId)) || [];
}

export function restrictSchoolRoiState(state, consent) {
  if (!consent) return state;
  if (consent.effectiveDecision === 'none') return 'denied';
  if (consent.effectiveDecision === 'roi' && state === 'roi_docs') return 'roi';
  return state;
}

export async function assertGuardianRoiSigner({ clientId, guardianUserId, loadGuardians = id => ClientGuardian.listForClient(id) }) {
  if (!Number(guardianUserId)) throw fail('The signer must be linked to this child before school permissions can be applied. Contact the office.');
  const guardians = await loadGuardians(clientId);
  if (!guardians.some(row => Number(row.guardian_user_id) === Number(guardianUserId) && canReceiveGuardianConsentRequest(row))) throw fail('This guardian is not currently authorized to sign for this child. Contact the office.');
}

export async function recordGuardianRoiConsent({ clientId, schoolOrganizationId, guardianUserId, submissionId, response, signedAt = new Date(), db = pool, loadGuardians = id => ClientGuardian.listForClient(id), applyState }) {
  if (!Number(guardianUserId) || !Number(submissionId)) throw fail('The signer must be linked to this child before school permissions can be applied. Contact the office.');
  await assertGuardianRoiSigner({ clientId, guardianUserId, loadGuardians });
  const connection = await db.getConnection();
  try {
    await connection.beginTransaction();
    // Serializes both guardians so the last request cannot overwrite an earlier denial.
    await connection.execute('SELECT id FROM clients WHERE id = ? FOR UPDATE', [clientId]);
    const expiresAt = new Date(signedAt); expiresAt.setUTCFullYear(expiresAt.getUTCFullYear() + 3);
    for (const staff of response?.staffDecisions || []) {
      if (!Number(staff.schoolStaffUserId) || !['none', 'roi', 'roi_docs'].includes(staff.decision)) throw fail('Review every listed school staff decision before signing.');
      await connection.execute(`INSERT INTO client_school_roi_guardian_decisions
        (client_id, school_organization_id, guardian_user_id, school_staff_user_id, intake_submission_id, decision, signed_at, expires_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?) ON DUPLICATE KEY UPDATE id = id`,
      [clientId, schoolOrganizationId, guardianUserId, staff.schoolStaffUserId, submissionId, staff.decision, new Date(signedAt), expiresAt]);
    }
    const consent = await loadGuardianRoiConsent({ clientId, schoolOrganizationId, db: connection });
    for (const item of consent) await applyState({ clientId, schoolOrganizationId, schoolStaffUserId: item.schoolStaffUserId, nextState: item.effectiveDecision === 'none' ? 'packet' : item.effectiveDecision, db: connection });
    await connection.commit();
    return consent.map(item => ({ ...item, nextState: item.effectiveDecision === 'none' ? 'packet' : item.effectiveDecision }));
  } catch (error) { await connection.rollback(); throw error; }
  finally { connection.release(); }
}
