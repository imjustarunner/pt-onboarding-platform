import clinicalPool from '../config/clinicalDatabase.js';

export const CLAIM_OPEN_LEAD_MS = 5 * 60 * 1000;
export const CLAIM_OPEN_CATCHUP_MS = 12 * 60 * 60 * 1000;

const blockedStatus = new Set(['no_show', 'cancelled', 'canceled', 'voided', 'rescheduled']);

export function sessionShouldOpenClaim(startAt, now = Date.now()) {
  const start = startAt instanceof Date ? startAt.getTime() : Date.parse(String(startAt || '').replace(' ', 'T'));
  if (!Number.isFinite(start)) return false;
  return start <= now + CLAIM_OPEN_LEAD_MS && start >= now - CLAIM_OPEN_CATCHUP_MS;
}

export function claimGroupKey(claim) {
  return [claim.agencyId, claim.clientId, String(claim.dateOfService || '').slice(0, 10), claim.payerId || 'self-pay', claim.billingNpi || '', claim.renderingNpi || ''].join('|');
}

export function sessionsForSubmission(sessions = []) {
  const include = sessions.filter(session => session.signed && session.billable !== false);
  const hold = sessions.filter(session => !include.includes(session));
  return { include, hold };
}

export function canJoinOpenClaim(openClaim, session) {
  if (!openClaim || !session) return false;
  if (!['draft', 'ready'].includes(openClaim.lifecycle)) return false;
  if (openClaim.hidden) return false;
  if (!openClaim.billingNpi || !session.billingNpi || openClaim.billingNpi !== session.billingNpi) return false;
  if (!openClaim.renderingNpi || !session.renderingNpi || openClaim.renderingNpi !== session.renderingNpi) return false;
  return claimGroupKey(openClaim) === claimGroupKey(session);
}

export async function openDueSessionClaims(db = clinicalPool, now = new Date()) {
  const start = new Date(now.getTime() - CLAIM_OPEN_CATCHUP_MS);
  const end = new Date(now.getTime() + CLAIM_OPEN_LEAD_MS);
  const [sessions] = await db.execute(
    `SELECT s.id, s.agency_id, s.client_id, s.provider_user_id, s.service_code, s.place_of_service, s.scheduled_start_at
     FROM clinical_sessions s
     WHERE s.scheduled_start_at >= ? AND s.scheduled_start_at <= ?
       AND s.service_code IS NOT NULL AND TRIM(s.service_code) <> ''
       AND LOWER(COALESCE(s.encounter_status, '')) NOT IN ('no_show', 'cancelled', 'canceled', 'voided', 'rescheduled')
       AND (s.claim_blocked_reason IS NULL OR s.claim_blocked_reason = '')
       AND NOT EXISTS (SELECT 1 FROM clinical_claims c WHERE c.agency_id = s.agency_id AND c.clinical_session_id = s.id)
       AND NOT EXISTS (SELECT 1 FROM clinical_claim_sessions cs WHERE cs.agency_id = s.agency_id AND cs.clinical_session_id = s.id)
     ORDER BY s.scheduled_start_at
     LIMIT 50`,
    [start, end]
  );
  let opened = 0;
  for (const session of sessions || []) {
    if (!sessionShouldOpenClaim(session.scheduled_start_at, now.getTime()) || blockedStatus.has(String(session.encounter_status || '').toLowerCase())) continue;
    const serviceDate = session.scheduled_start_at instanceof Date ? session.scheduled_start_at.toISOString().slice(0, 10) : String(session.scheduled_start_at).slice(0, 10);
    const [result] = await db.execute(
      `INSERT INTO clinical_claims
         (clinical_session_id, agency_id, client_id, claim_status, amount_cents, currency_code, metadata_json, created_by_user_id, clinical_note_id, place_of_service, date_of_service, claim_lifecycle)
       VALUES (?, ?, ?, 'PENDING', 0, 'USD', ?, ?, NULL, ?, ?, 'draft')`,
      [session.id, session.agency_id, session.client_id, JSON.stringify({ createdVia: 'sessionClaimWindow', hiddenFromQueue: false }), session.provider_user_id || 0, session.place_of_service || null, serviceDate]
    );
    await db.execute(
      `INSERT INTO clinical_claim_sessions (clinical_claim_id, clinical_session_id, agency_id, include_on_submit) VALUES (?, ?, ?, 0)`,
      [result.insertId, session.id, session.agency_id]
    );
    const code = String(session.service_code || '').trim().toUpperCase();
    if (code) {
      await db.execute(
        `INSERT INTO clinical_claim_lines (clinical_claim_id, line_number, procedure_code, units, charge_cents, diagnosis_pointers, service_date)
         VALUES (?, 1, ?, 1, 0, '1', ?)`,
        [result.insertId, code, serviceDate]
      );
    }
    opened += 1;
  }
  return { opened };
}

export async function attachSignedSessionToClaim({ agencyId, sessionId, noteId }, db = clinicalPool) {
  const aid = Number(agencyId || 0);
  const sid = Number(sessionId || 0);
  const nid = Number(noteId || 0);
  if (!aid || !sid || !nid) return { attached: false };
  const [links] = await db.execute(
    `SELECT cs.clinical_claim_id, c.claim_lifecycle
     FROM clinical_claim_sessions cs
     JOIN clinical_claims c ON c.id = cs.clinical_claim_id AND c.agency_id = cs.agency_id
     WHERE cs.agency_id = ? AND cs.clinical_session_id = ? AND c.is_deleted = 0
     LIMIT 1`,
    [aid, sid]
  );
  const link = links?.[0];
  if (!link || !['draft', 'ready'].includes(link.claim_lifecycle)) return { attached: false, reason: link ? 'claim already sent' : 'no open claim' };
  await db.execute('UPDATE clinical_claim_sessions SET clinical_note_id = ?, include_on_submit = 1 WHERE agency_id = ? AND clinical_session_id = ?', [nid, aid, sid]);
  await db.execute('UPDATE clinical_claims SET clinical_note_id = COALESCE(clinical_note_id, ?), claim_lifecycle = ? WHERE id = ? AND agency_id = ? AND claim_lifecycle IN (\'draft\', \'ready\')', [nid, 'ready', link.clinical_claim_id, aid]);
  await db.execute('UPDATE clinical_claim_lines SET clinical_note_id = ? WHERE clinical_claim_id = ? AND clinical_note_id IS NULL', [nid, link.clinical_claim_id]);
  try {
    const { priceNewClaimLines } = await import('./newClaimFees.service.js');
    const [[session]] = await db.execute('SELECT provider_user_id, rendering_provider_user_id, service_location_id FROM clinical_sessions WHERE id = ? AND agency_id = ?', [sid, aid]);
    const [[claim]] = await db.execute('SELECT destination_payer_id, date_of_service FROM clinical_claims WHERE id = ? AND agency_id = ?', [link.clinical_claim_id, aid]);
    const [lineRows] = await db.execute('SELECT id, procedure_code, units, charge_cents, modifiers_json FROM clinical_claim_lines WHERE clinical_claim_id = ?', [link.clinical_claim_id]);
    let locationModifiers = [];
    if (session?.service_location_id) {
      const { default: pool } = await import('../config/database.js');
      const [[loc]] = await pool.execute('SELECT default_modifiers FROM agency_service_locations WHERE id = ?', [session.service_location_id]);
      locationModifiers = String(loc?.default_modifiers || '').split(/[,\s]+/).map(code => code.toUpperCase()).filter(code => /^[A-Z0-9]{2}$/.test(code));
    }
    const priced = await priceNewClaimLines({
      lines: lineRows.map(line => ({ procedureCode: line.procedure_code, units: Number(line.units || 1), chargeCents: Number(line.charge_cents) > 0 ? Number(line.charge_cents) : undefined })),
      agencyId: aid,
      payerId: claim?.destination_payer_id || null,
      providerUserId: session?.rendering_provider_user_id || session?.provider_user_id || null,
      dateOfService: claim?.date_of_service || null
    });
    let total = 0;
    for (let i = 0; i < lineRows.length; i += 1) {
      const current = lineRows[i].modifiers_json;
      const parsed = Array.isArray(current) ? current : typeof current === 'string' && current ? JSON.parse(current) : [];
      const modifiers = parsed.length ? parsed : [...new Set([...(priced[i].modifiers || []), ...locationModifiers])].slice(0, 4);
      const charge = Number(lineRows[i].charge_cents) > 0 ? Number(lineRows[i].charge_cents) : Number(priced[i].chargeCents || 0);
      total += charge;
      await db.execute('UPDATE clinical_claim_lines SET charge_cents = ?, modifiers_json = ? WHERE id = ?', [charge, JSON.stringify(modifiers), lineRows[i].id]);
    }
    await db.execute('UPDATE clinical_claims SET amount_cents = ? WHERE id = ? AND agency_id = ?', [total, link.clinical_claim_id, aid]);
  } catch {
    // Signing the note still attaches the session when a fee or modifier default cannot be resolved.
  }
  return { attached: true, claimId: Number(link.clinical_claim_id) };
}
