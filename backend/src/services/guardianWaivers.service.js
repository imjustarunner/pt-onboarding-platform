import pool from '../config/database.js';
import ClientGuardian from '../models/ClientGuardian.model.js';
import User from '../models/User.model.js';
import {
  GUARDIAN_WAIVER_ESIGN_KEY,
  GUARDIAN_WAIVER_SECTION_KEYS,
  evaluateWaiverCompleteness,
  guardianWaiverSectionKeysFromLink,
  isGuardianWaiversFeatureEnabled,
  isValidSectionKey,
  linkHasGuardianWaiverStep,
  isDobAdultLocked,
  parseFeatureFlags,
  resolveRequiredSectionKeys,
  summarizeWaiverPayloadForKiosk
} from '../utils/guardianWaivers.utils.js';

function normalizeSignatureData(sig) {
  const s = String(sig || '').trim();
  if (s.length < 80) return null;
  return s;
}

function parseSectionsJson(raw) {
  if (raw == null) return {};
  if (typeof raw === 'string') {
    try {
      return JSON.parse(raw) || {};
    } catch {
      return {};
    }
  }
  return typeof raw === 'object' ? { ...raw } : {};
}

async function assertGuardianLinkedToClient(guardianUserId, clientId) {
  const gid = Number(guardianUserId);
  const cid = Number(clientId);
  if (!gid || !cid) throw Object.assign(new Error('Invalid guardian or client'), { status: 400 });
  const clients = await ClientGuardian.listClientsForGuardian({ guardianUserId: gid });
  const ok = (clients || []).some((c) => Number(c.client_id) === cid && Number(c.access_enabled) !== 0);
  if (!ok) throw Object.assign(new Error('Guardian is not linked to this client'), { status: 403 });
}

/** After intake finalization a row may exist with access_enabled=0; still persist waiver audit trail. */
async function assertGuardianClientRelationshipExists(guardianUserId, clientId) {
  const gid = Number(guardianUserId);
  const cid = Number(clientId);
  if (!gid || !cid) throw Object.assign(new Error('Invalid guardian or client'), { status: 400 });
  const [rows] = await pool.execute(
    'SELECT id FROM client_guardians WHERE guardian_user_id = ? AND client_id = ? LIMIT 1',
    [gid, cid]
  );
  if (!rows?.length) {
    throw Object.assign(new Error('Guardian is not linked to this client'), { status: 403 });
  }
}

export async function isClientAdultLockedForGuardian(clientId) {
  const cid = Number(clientId);
  if (!cid) return false;
  const [rows] = await pool.execute('SELECT date_of_birth FROM clients WHERE id = ? LIMIT 1', [cid]);
  const dob = rows?.[0]?.date_of_birth;
  return isDobAdultLocked(dob);
}

async function resolveGuardianUserIdForIntakePersist({ guardianUserId, intakeData, payload }) {
  const gid = Number(guardianUserId);
  if (gid) return gid;
  const email = String(
    payload?.guardian?.email || intakeData?.guardian?.email || intakeData?.responses?.guardian?.email || ''
  )
    .trim()
    .toLowerCase();
  if (!email.includes('@')) return null;
  const u = await User.findByEmail(email);
  if (!u?.id) return null;
  if (String(u.role || '').trim().toLowerCase() === 'client_guardian') {
    return Number(u.id);
  }
  return null;
}

async function getClientAgencyFeatureFlags(clientId) {
  const cid = Number(clientId);
  const [rows] = await pool.execute(
    `SELECT c.agency_id, a.feature_flags
     FROM clients c
     JOIN agencies a ON a.id = c.agency_id
     WHERE c.id = ?`,
    [cid]
  );
  return rows?.[0] || null;
}

export async function isWaiversEnabledForClient(clientId) {
  const row = await getClientAgencyFeatureFlags(clientId);
  if (!row) return false;
  return isGuardianWaiversFeatureEnabled(row.feature_flags);
}

async function ensureProfileRow(conn, guardianUserId, clientId) {
  const [existing] = await conn.execute(
    'SELECT * FROM guardian_client_waiver_profiles WHERE guardian_user_id = ? AND client_id = ? LIMIT 1',
    [guardianUserId, clientId]
  );
  if (existing[0]) return existing[0];
  const [ins] = await conn.execute(
    "INSERT INTO guardian_client_waiver_profiles (guardian_user_id, client_id, sections_json) VALUES (?, ?, CAST('{}' AS JSON))",
    [guardianUserId, clientId]
  );
  const [created] = await conn.execute('SELECT * FROM guardian_client_waiver_profiles WHERE id = ?', [ins.insertId]);
  return created[0];
}

function assertCanModifySection(sectionKey, sections, action) {
  if (!isValidSectionKey(sectionKey)) {
    throw Object.assign(new Error('Invalid section key'), { status: 400 });
  }
  if (sectionKey !== GUARDIAN_WAIVER_ESIGN_KEY) {
    const es = sections[GUARDIAN_WAIVER_ESIGN_KEY];
    if (!es || es.status !== 'active') {
      throw Object.assign(
        new Error('Complete electronic signature consent before updating other waivers.'),
        { status: 409, code: 'ESIGNATURE_CONSENT_REQUIRED' }
      );
    }
  }
  if (action === 'revoke') return;
}

/**
 * @param {object} params
 * @param {import('mysql2/promise').PoolConnection} [params.conn]
 */
export async function upsertGuardianWaiverSection({
  guardianUserId,
  clientId,
  sectionKey,
  payload,
  action,
  signatureData,
  consentAcknowledged,
  intentToSign,
  ipAddress,
  userAgent,
  conn: externalConn,
  /** @type {'strict' | 'relationship_exists'} */
  linkCheckMode = 'strict',
  skipAdultGuard = false
}) {
  const sig = normalizeSignatureData(signatureData);
  if (!sig) throw Object.assign(new Error('Signature is required'), { status: 400 });
  if (consentAcknowledged !== true || intentToSign !== true) {
    throw Object.assign(new Error('Consent and intent to sign are required'), { status: 400 });
  }

  const gid = Number(guardianUserId);
  const cid = Number(clientId);
  if (!skipAdultGuard && (await isClientAdultLockedForGuardian(cid))) {
    throw Object.assign(
      new Error('This client has aged out of guardian-managed waivers and documents.'),
      { status: 403, code: 'GUARDIAN_ADULT_CLIENT' }
    );
  }
  if (linkCheckMode === 'relationship_exists') {
    await assertGuardianClientRelationshipExists(gid, cid);
  } else {
    await assertGuardianLinkedToClient(gid, cid);
  }

  const enabled = await isWaiversEnabledForClient(cid);
  if (!enabled) throw Object.assign(new Error('Guardian waivers are not enabled for this agency'), { status: 403 });

  const act = String(action || '').toLowerCase();
  if (act !== 'create' && act !== 'update' && act !== 'revoke') {
    throw Object.assign(new Error('Invalid action'), { status: 400 });
  }

  const run = async (conn) => {
    const profile = await ensureProfileRow(conn, gid, cid);
    const sections = parseSectionsJson(profile.sections_json);
    assertCanModifySection(sectionKey, sections, act);

    const existingRow = sections[sectionKey];
    if (act === 'create' && existingRow?.status === 'active') {
      throw Object.assign(new Error('Section already active; use update'), { status: 409, code: 'SECTION_ALREADY_ACTIVE' });
    }
    if ((act === 'update' || act === 'revoke') && !existingRow) {
      throw Object.assign(new Error('Section does not exist yet; use create'), { status: 409, code: 'SECTION_NOT_INITIALIZED' });
    }
    if (act === 'update' && existingRow?.status === 'revoked') {
      throw Object.assign(new Error('Section is revoked; use create to re-activate'), { status: 409, code: 'SECTION_REVOKED_USE_CREATE' });
    }
    if (act === 'revoke' && existingRow?.status !== 'active') {
      throw Object.assign(new Error('Section is not active; nothing to revoke'), { status: 409, code: 'SECTION_NOT_ACTIVE' });
    }

    if (act === 'revoke') {
      // still require esign active for revoking non-esign sections (assertCanModifySection)
    } else {
      if (payload == null || typeof payload !== 'object' || Array.isArray(payload)) {
        throw Object.assign(new Error('Payload must be a JSON object'), { status: 400 });
      }
    }

    const [attRes] = await conn.execute(
      `INSERT INTO guardian_client_waiver_attestations
        (profile_id, section_key, action, signature_data, consent_acknowledged_at, intent_to_sign_at, ip_address, user_agent)
       VALUES (?, ?, ?, ?, NOW(), NOW(), ?, ?)`,
      [profile.id, sectionKey, act, sig, ipAddress || null, userAgent || null]
    );
    const attestationId = attRes.insertId;

    const payloadSnapshot = act === 'revoke' ? null : payload;
    await conn.execute(
      `INSERT INTO guardian_client_waiver_history (profile_id, section_key, action, payload_json, attestation_id)
       VALUES (?, ?, ?, ?, ?)`,
      [profile.id, sectionKey, act, payloadSnapshot ? JSON.stringify(payloadSnapshot) : null, attestationId]
    );

    const nextSections = { ...sections };
    nextSections[sectionKey] = {
      status: act === 'revoke' ? 'revoked' : 'active',
      payload: act === 'revoke' ? null : payload,
      updated_at: new Date().toISOString(),
      last_attestation_id: attestationId
    };

    await conn.execute('UPDATE guardian_client_waiver_profiles SET sections_json = ? WHERE id = ?', [
      JSON.stringify(nextSections),
      profile.id
    ]);

    const [updated] = await conn.execute('SELECT * FROM guardian_client_waiver_profiles WHERE id = ?', [profile.id]);
    return updated[0];
  };

  if (externalConn) {
    return run(externalConn);
  }

  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();
    const out = await run(conn);
    await conn.commit();
    return out;
  } catch (e) {
    await conn.rollback();
    throw e;
  } finally {
    conn.release();
  }
}

export async function getGuardianWaiverProfileForGuardian({ guardianUserId, clientId }) {
  const gid = Number(guardianUserId);
  const cid = Number(clientId);
  await assertGuardianLinkedToClient(gid, cid);
  if (await isClientAdultLockedForGuardian(cid)) {
    throw Object.assign(
      new Error('This client has aged out of guardian-managed waivers and documents.'),
      { status: 403, code: 'GUARDIAN_ADULT_CLIENT' }
    );
  }
  const enabled = await isWaiversEnabledForClient(cid);
  if (!enabled) {
    return { enabled: false, sectionKeys: GUARDIAN_WAIVER_SECTION_KEYS, sections: {} };
  }
  const [rows] = await pool.execute(
    'SELECT * FROM guardian_client_waiver_profiles WHERE guardian_user_id = ? AND client_id = ? LIMIT 1',
    [gid, cid]
  );
  const profile = rows[0];
  const sections = profile ? parseSectionsJson(profile.sections_json) : {};
  return {
    enabled: true,
    sectionKeys: GUARDIAN_WAIVER_SECTION_KEYS,
    profileId: profile?.id || null,
    sections,
    updatedAt: profile?.updated_at || null
  };
}

export async function getProgramSiteWaiverContext(programSiteId) {
  const sid = Number(programSiteId);
  if (!sid) return null;
  const [rows] = await pool.execute(
    `SELECT ps.id AS program_site_id,
            ps.guardian_waiver_required_sections_json AS site_required_json,
            p.agency_id,
            a.feature_flags
     FROM program_sites ps
     JOIN programs p ON p.id = ps.program_id
     JOIN agencies a ON a.id = p.agency_id
     WHERE ps.id = ?`,
    [sid]
  );
  return rows[0] || null;
}

export async function getCompanyEventWaiverJson(companyEventId) {
  const eid = Number(companyEventId);
  if (!eid) return null;
  const [rows] = await pool.execute(
    'SELECT id, agency_id, guardian_waiver_required_sections_json AS event_required_json FROM company_events WHERE id = ?',
    [eid]
  );
  return rows[0] || null;
}

/**
 * Kiosk / server: waiver gate for check-in.
 */
export async function evaluateKioskGuardianWaiverGate({
  programSiteId,
  guardianUserId,
  clientId,
  companyEventId = null
}) {
  const cid = Number(clientId);
  if (cid && (await isClientAdultLockedForGuardian(cid))) {
    return {
      enabled: false,
      complete: true,
      missing: [],
      requiredKeys: [],
      sections: {},
      adultLocked: true
    };
  }

  const ctx = await getProgramSiteWaiverContext(programSiteId);
  if (!ctx) return { enabled: false, complete: true, missing: [], requiredKeys: [], sections: {} };

  const flags = parseFeatureFlags(ctx.feature_flags);
  if (!isGuardianWaiversFeatureEnabled(flags)) {
    return { enabled: false, complete: true, missing: [], requiredKeys: [], sections: {} };
  }

  let eventJson = null;
  if (companyEventId) {
    const ev = await getCompanyEventWaiverJson(companyEventId);
    if (ev && Number(ev.agency_id) === Number(ctx.agency_id)) {
      eventJson = ev.event_required_json;
    }
  }

  const requiredKeys = resolveRequiredSectionKeys(ctx.site_required_json, eventJson);

  const [prows] = await pool.execute(
    'SELECT sections_json FROM guardian_client_waiver_profiles WHERE guardian_user_id = ? AND client_id = ? LIMIT 1',
    [guardianUserId, clientId]
  );
  const sectionsJson = prows[0]?.sections_json;
  const { complete, missing, sections } = evaluateWaiverCompleteness(sectionsJson, requiredKeys);

  return {
    enabled: true,
    complete,
    missing,
    requiredKeys,
    sections
  };
}

/**
 * @param {Record<string, unknown>} sections - evaluateKioskGuardianWaiverGate.sections shape
 * @param {string[]} requiredKeys
 */
export function buildKioskWaiverSectionDisplay(sections, requiredKeys) {
  const sec = sections && typeof sections === 'object' ? sections : {};
  const keys = Array.isArray(requiredKeys) && requiredKeys.length
    ? requiredKeys
    : [...GUARDIAN_WAIVER_SECTION_KEYS];
  const out = {};
  for (const key of keys) {
    const row = sec[key];
    const payload = row?.payload;
    out[key] = {
      status: row?.status || null,
      lines: summarizeWaiverPayloadForKiosk(key, payload)
    };
  }
  return out;
}

/**
 * Persist waiver sections captured on public intake into guardian_client_waiver_* tables.
 */
export async function persistIntakeGuardianWaiversFromFinalize({
  link,
  guardianUserId,
  clientIdsOrdered,
  intakeData,
  payload,
  ipAddress,
  userAgent
}) {
  if (!link || !linkHasGuardianWaiverStep(link)) return { applied: 0 };

  const gid = await resolveGuardianUserIdForIntakePersist({ guardianUserId, intakeData, payload });
  if (!gid) {
    return { applied: 0, skipped: 'no_guardian_user' };
  }

  const bundle =
    intakeData?.responses?.submission?.guardianWaiverIntake ||
    intakeData?.submission?.guardianWaiverIntake ||
    null;
  const bundleClients = Array.isArray(bundle?.clients) ? bundle.clients : [];
  if (!bundleClients.length) return { applied: 0, skipped: 'no_bundle' };

  const configuredKeys = guardianWaiverSectionKeysFromLink(link);
  const keyOrder = [
    GUARDIAN_WAIVER_ESIGN_KEY,
    ...configuredKeys.filter((k) => k !== GUARDIAN_WAIVER_ESIGN_KEY)
  ];

  let applied = 0;
  const n = Math.min(clientIdsOrdered.length, bundleClients.length);

  for (let i = 0; i < n; i += 1) {
    const clientId = Number(clientIdsOrdered[i]);
    if (!clientId) continue;

    if (await isClientAdultLockedForGuardian(clientId)) continue;
    const waiversOk = await isWaiversEnabledForClient(clientId);
    if (!waiversOk) continue;

    const row = bundleClients[i];
    const sections = row?.sections && typeof row.sections === 'object' ? row.sections : {};
    const [prow] = await pool.execute(
      'SELECT sections_json FROM guardian_client_waiver_profiles WHERE guardian_user_id = ? AND client_id = ? LIMIT 1',
      [gid, clientId]
    );
    let currentSections = parseSectionsJson(prow?.[0]?.sections_json);

    const extraKeys = Object.keys(sections).filter((k) => isValidSectionKey(k) && !keyOrder.includes(k));
    const orderedUnique = [...new Set([...keyOrder, ...extraKeys])];

    for (const sectionKey of orderedUnique) {
      if (!isValidSectionKey(sectionKey)) continue;
      const sec = sections[sectionKey];
      if (!sec || typeof sec !== 'object') continue;
      const sig = normalizeSignatureData(sec.signatureData);
      if (!sig) continue;
      if (sec.consentAcknowledged !== true || sec.intentToSign !== true) continue;

      const payloadSnap = sec.payload;
      if (payloadSnap == null || typeof payloadSnap !== 'object' || Array.isArray(payloadSnap)) {
        continue;
      }

      const existingRow = currentSections[sectionKey];
      const act =
        !existingRow || existingRow.status !== 'active' ? 'create' : 'update';

      try {
        const profile = await upsertGuardianWaiverSection({
          guardianUserId: gid,
          clientId,
          sectionKey,
          payload: payloadSnap,
          action: act,
          signatureData: sig,
          consentAcknowledged: true,
          intentToSign: true,
          ipAddress,
          userAgent,
          linkCheckMode: 'relationship_exists',
          skipAdultGuard: true
        });
        currentSections = parseSectionsJson(profile?.sections_json);
        applied += 1;
      } catch (e) {
        console.error('[guardianWaivers] intake persist section failed', {
          clientId,
          sectionKey,
          message: e?.message
        });
      }
    }
  }

  return { applied };
}

export async function recordKioskWaiverConfirmation({
  profileRow,
  kioskLocationId,
  programSiteId,
  guardianUserId,
  clientId,
  programTimePunchId,
  requiredKeys,
  sectionsSnapshot
}) {
  if (!profileRow?.id) return;
  await pool.execute(
    `INSERT INTO guardian_client_waiver_kiosk_confirmations
      (profile_id, kiosk_location_id, program_site_id, guardian_user_id, client_id, program_time_punch_id, required_sections_json, sections_snapshot_json)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      profileRow.id,
      kioskLocationId,
      programSiteId,
      guardianUserId,
      clientId,
      programTimePunchId || null,
      JSON.stringify(requiredKeys || []),
      JSON.stringify(sectionsSnapshot || {})
    ]
  );
}

export async function listWaiverAuditForClient(clientId) {
  const cid = Number(clientId);
  if (!cid) return { profiles: [], history: [] };
  const [profiles] = await pool.execute(
    `SELECT p.*, u.first_name AS guardian_first_name, u.last_name AS guardian_last_name, u.email AS guardian_email
     FROM guardian_client_waiver_profiles p
     JOIN users u ON u.id = p.guardian_user_id
     WHERE p.client_id = ?
     ORDER BY p.updated_at DESC`,
    [cid]
  );
  const ids = (profiles || []).map((p) => p.id);
  if (!ids.length) return { profiles, history: [] };

  const placeholders = ids.map(() => '?').join(',');
  const [history] = await pool.execute(
    `SELECT h.id, h.profile_id, h.section_key, h.action, h.payload_json, h.created_at,
            a.signature_data, a.ip_address, a.user_agent, a.created_at AS attested_at
     FROM guardian_client_waiver_history h
     JOIN guardian_client_waiver_attestations a ON a.id = h.attestation_id
     WHERE h.profile_id IN (${placeholders})
     ORDER BY h.created_at DESC
     LIMIT 500`,
    ids
  );
  return { profiles, history };
}
