import crypto from 'crypto';
import { validationResult } from 'express-validator';
import clinicalPool from '../config/clinicalDatabase.js';
import ClinicalSession from '../models/clinical/ClinicalSession.model.js';
import ClinicalNote from '../models/clinical/ClinicalNote.model.js';
import ClinicalClaim from '../models/clinical/ClinicalClaim.model.js';
import ClinicalTreatmentPlan from '../models/clinical/ClinicalTreatmentPlan.model.js';
import AgencyClaimMdCredentials from '../models/AgencyClaimMdCredentials.model.js';
import ClinicalEligibilityService from '../services/clinicalEligibility.service.js';
import { getMedicalBillingFlags } from '../services/medicalBillingFlags.service.js';
import { maybeEncryptNotePayload, maybeDecryptNotePayload } from '../services/clinicalNoteCrypto.service.js';
import { encryptChatText, decryptChatText, isChatEncryptionConfigured } from '../services/chatEncryption.service.js';
import {
  uploadClaims,
  fetchResponses,
  fetchEraList,
  requestEligibilityJson,
  buildClaimMdJsonClaim
} from '../services/claimMd.service.js';
import pool from '../config/database.js';
import AgencyMedicalServiceCode from '../models/AgencyMedicalServiceCode.model.js';
import AgencyServiceLocation from '../models/AgencyServiceLocation.model.js';
import OfficeLocation from '../models/OfficeLocation.model.js';
import {
  buildMedicaid8MinuteBands,
  resolveWithOverflowChain,
  ruleFromMedicalServiceCodeRow
} from '../services/serviceCodeUnits.service.js';
import {
  getMedicalBillingReportCatalogWithAvailability as getBillingReportCatalog,
  runMedicalBillingReport as executeBillingReport
} from '../services/medicalBillingReports.service.js';

function parseIntValue(v) {
  const n = Number(v);
  return Number.isInteger(n) && n > 0 ? n : null;
}

function contentHash(text) {
  return crypto.createHash('sha256').update(String(text || ''), 'utf8').digest('hex');
}

async function loadAgencyFlags(agencyId) {
  const [rows] = await pool.execute('SELECT id, feature_flags FROM agencies WHERE id = ?', [agencyId]);
  return rows?.[0] || null;
}

export const getMedicalBillingStatus = async (req, res, next) => {
  try {
    const agencyId = parseIntValue(req.query.agencyId || req.params.agencyId);
    if (!agencyId) return res.status(400).json({ error: { message: 'agencyId is required' } });
    await ClinicalEligibilityService.ensureAgencyAccess({ reqUser: req.user, agencyId });
    const agency = await loadAgencyFlags(agencyId);
    const flags = getMedicalBillingFlags(agency);
    const claimMd = flags.claimMdEnabled ? await AgencyClaimMdCredentials.publicMeta(agencyId) : { configured: false };
    return res.json({ flags, claimMd });
  } catch (e) {
    next(e);
  }
};

/** Save structured treatment plan + optional note payload to chart (requires clinicalChartEnabled). */
export const saveTreatmentPlanToChart = async (req, res, next) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ error: { message: 'Validation failed', details: errors.array() } });
    }
    const agencyId = parseIntValue(req.body.agencyId);
    const clientId = parseIntValue(req.body.clientId);
    const sessionId = parseIntValue(req.body.clinicalSessionId);
    if (!agencyId || !clientId) {
      return res.status(400).json({ error: { message: 'agencyId and clientId are required' } });
    }
    await ClinicalEligibilityService.ensureAgencyAccess({ reqUser: req.user, agencyId });

    let clinicalSessionId = sessionId;
    if (!clinicalSessionId && parseIntValue(req.body.officeEventId)) {
      const session = await ClinicalSession.upsert({
        agencyId,
        clientId,
        officeEventId: parseIntValue(req.body.officeEventId),
        providerUserId: req.user.id,
        createdByUserId: req.user.id
      });
      clinicalSessionId = session?.id || null;
    }

    const goals = Array.isArray(req.body.goals) ? req.body.goals : [];
    const plan = await ClinicalTreatmentPlan.create({
      agencyId,
      clientId,
      clinicalSessionId: clinicalSessionId || null,
      clinicalNoteId: parseIntValue(req.body.clinicalNoteId),
      title: String(req.body.title || 'Treatment Plan').trim(),
      dischargePlan: req.body.dischargePlan ? String(req.body.dischargePlan) : null,
      sourceToolId: req.body.sourceToolId ? String(req.body.sourceToolId) : null,
      createdByUserId: req.user.id,
      goals: goals.map((g, i) => ({
        goalIndex: g.goalIndex || i + 1,
        goalText: String(g.goalText || g.text || ''),
        projectedCompletion: g.projectedCompletion || null,
        objectives: (g.objectives || []).map((o, j) => ({
          objectiveIndex: o.objectiveIndex || j + 1,
          objectiveText: String(o.objectiveText || o.text || ''),
          scaleCurrent: o.scaleCurrent ?? null,
          scaleTarget: o.scaleTarget ?? null,
          measurementMethod: o.measurementMethod || null
        }))
      }))
    });

    return res.status(201).json({ plan });
  } catch (e) {
    next(e);
  }
};

export const listClientChart = async (req, res, next) => {
  try {
    const agencyId = parseIntValue(req.query.agencyId);
    const clientId = parseIntValue(req.params.clientId);
    if (!agencyId || !clientId) {
      return res.status(400).json({ error: { message: 'agencyId and clientId are required' } });
    }
    await ClinicalEligibilityService.ensureAgencyAccess({ reqUser: req.user, agencyId });

    const [notes] = await clinicalPool.execute(
      `SELECT id, clinical_session_id, title, note_type, version_number, provider_signed_at, supervisor_cosigned_at,
              is_billable, created_at, updated_at, created_by_user_id
       FROM clinical_notes
       WHERE agency_id = ? AND client_id = ? AND is_deleted = 0
       ORDER BY created_at DESC
       LIMIT 200`,
      [agencyId, clientId]
    );
    const plans = await ClinicalTreatmentPlan.listByClient({ agencyId, clientId });
    const latestPlanId = Number(plans?.[0]?.id || 0);
    const latestPlan = latestPlanId > 0 ? await ClinicalTreatmentPlan.findById(latestPlanId) : null;
    const [diagnoses] = await clinicalPool.execute(
      `SELECT id, icd10_code, description, is_primary, is_active, onset_date, created_at
       FROM clinical_diagnoses
       WHERE agency_id = ? AND client_id = ?
       ORDER BY is_active DESC, is_primary DESC, created_at DESC
       LIMIT 100`,
      [agencyId, clientId]
    );
    const [sessions] = await clinicalPool.execute(
      `SELECT id, office_event_id, encounter_status, place_of_service, duration_minutes, is_telehealth,
              rendering_provider_user_id, scheduled_start_at, scheduled_end_at, created_at
       FROM clinical_sessions
       WHERE agency_id = ? AND client_id = ?
       ORDER BY COALESCE(scheduled_start_at, created_at) DESC
       LIMIT 100`,
      [agencyId, clientId]
    );

    return res.json({
      notes: notes || [],
      plans: plans || [],
      latestPlan: latestPlan || null,
      diagnoses: diagnoses || [],
      sessions: sessions || []
    });
  } catch (e) {
    next(e);
  }
};

export const updateEncounter = async (req, res, next) => {
  try {
    const sessionId = parseIntValue(req.params.sessionId);
    const session = await ClinicalSession.findById(sessionId);
    if (!session) return res.status(404).json({ error: { message: 'Clinical session not found' } });
    await ClinicalEligibilityService.ensureAgencyAccess({ reqUser: req.user, agencyId: session.agency_id });

    const fields = [];
    const vals = [];
    const map = {
      encounterStatus: 'encounter_status',
      placeOfService: 'place_of_service',
      durationMinutes: 'duration_minutes',
      isTelehealth: 'is_telehealth',
      renderingProviderUserId: 'rendering_provider_user_id'
    };
    for (const [bodyKey, col] of Object.entries(map)) {
      if (req.body?.[bodyKey] === undefined) continue;
      fields.push(`${col} = ?`);
      if (bodyKey === 'isTelehealth') vals.push(req.body[bodyKey] ? 1 : 0);
      else if (bodyKey === 'durationMinutes' || bodyKey === 'renderingProviderUserId') {
        vals.push(parseIntValue(req.body[bodyKey]));
      } else vals.push(String(req.body[bodyKey]));
    }
    if (!fields.length) return res.status(400).json({ error: { message: 'No encounter fields to update' } });
    vals.push(sessionId);
    await clinicalPool.execute(
      `UPDATE clinical_sessions SET ${fields.join(', ')}, updated_at = CURRENT_TIMESTAMP WHERE id = ?`,
      vals
    );
    const updated = await ClinicalSession.findById(sessionId);
    return res.json({ session: updated });
  } catch (e) {
    next(e);
  }
};

export const signClinicalNote = async (req, res, next) => {
  try {
    const noteId = parseIntValue(req.params.noteId);
    const [rows] = await clinicalPool.execute(`SELECT * FROM clinical_notes WHERE id = ? LIMIT 1`, [noteId]);
    const note = rows?.[0];
    if (!note || note.is_deleted) return res.status(404).json({ error: { message: 'Note not found' } });
    await ClinicalEligibilityService.ensureAgencyAccess({ reqUser: req.user, agencyId: note.agency_id });

    const plain = maybeDecryptNotePayload(note.note_payload);
    const hash = contentHash(plain);
    await clinicalPool.execute(
      `UPDATE clinical_notes
       SET provider_signed_at = NOW(),
           provider_signed_by_user_id = ?,
           content_hash = ?,
           updated_at = CURRENT_TIMESTAMP
       WHERE id = ?`,
      [req.user.id, hash, noteId]
    );
    return res.json({ ok: true, noteId, contentHash: hash, signedAt: new Date().toISOString() });
  } catch (e) {
    next(e);
  }
};

export const cosignClinicalNote = async (req, res, next) => {
  try {
    const noteId = parseIntValue(req.params.noteId);
    const [rows] = await clinicalPool.execute(`SELECT * FROM clinical_notes WHERE id = ? LIMIT 1`, [noteId]);
    const note = rows?.[0];
    if (!note || note.is_deleted) return res.status(404).json({ error: { message: 'Note not found' } });
    await ClinicalEligibilityService.ensureAgencyAccess({ reqUser: req.user, agencyId: note.agency_id });
    if (!note.provider_signed_at) {
      return res.status(400).json({ error: { message: 'Provider must sign before supervisor cosign' } });
    }
    await clinicalPool.execute(
      `UPDATE clinical_notes
       SET supervisor_cosigned_at = NOW(),
           supervisor_cosigned_by_user_id = ?,
           is_billable = 1,
           updated_at = CURRENT_TIMESTAMP
       WHERE id = ?`,
      [req.user.id, noteId]
    );
    return res.json({ ok: true, noteId, cosignedAt: new Date().toISOString(), isBillable: true });
  } catch (e) {
    next(e);
  }
};

export const listNotesForSigning = async (req, res, next) => {
  try {
    const agencyId = parseIntValue(req.query.agencyId);
    if (!agencyId) return res.status(400).json({ error: { message: 'agencyId is required' } });
    await ClinicalEligibilityService.ensureAgencyAccess({ reqUser: req.user, agencyId });
    const mode = String(req.query.mode || 'cosign').toLowerCase();
    let sql = `
      SELECT id, clinical_session_id, client_id, title, note_type, provider_signed_at, supervisor_cosigned_at,
             is_billable, created_by_user_id, created_at
      FROM clinical_notes
      WHERE agency_id = ? AND is_deleted = 0`;
    if (mode === 'unsigned') {
      sql += ` AND provider_signed_at IS NULL`;
    } else {
      sql += ` AND provider_signed_at IS NOT NULL AND supervisor_cosigned_at IS NULL`;
    }
    sql += ` ORDER BY created_at DESC LIMIT 200`;
    const [rows] = await clinicalPool.execute(sql, [agencyId]);
    return res.json({ notes: rows || [] });
  } catch (e) {
    next(e);
  }
};

export const upsertDiagnosis = async (req, res, next) => {
  try {
    const agencyId = parseIntValue(req.body.agencyId);
    const clientId = parseIntValue(req.body.clientId);
    const code = String(req.body.icd10Code || '').trim().toUpperCase();
    if (!agencyId || !clientId || !code) {
      return res.status(400).json({ error: { message: 'agencyId, clientId, and icd10Code are required' } });
    }
    await ClinicalEligibilityService.ensureAgencyAccess({ reqUser: req.user, agencyId });
    const [result] = await clinicalPool.execute(
      `INSERT INTO clinical_diagnoses
       (agency_id, client_id, clinical_session_id, clinical_note_id, icd10_code, description, is_primary, is_active, onset_date, created_by_user_id)
       VALUES (?, ?, ?, ?, ?, ?, ?, 1, ?, ?)`,
      [
        agencyId,
        clientId,
        parseIntValue(req.body.clinicalSessionId),
        parseIntValue(req.body.clinicalNoteId),
        code,
        req.body.description ? String(req.body.description).slice(0, 500) : null,
        req.body.isPrimary ? 1 : 0,
        req.body.onsetDate || null,
        req.user.id
      ]
    );
    return res.status(201).json({ id: result.insertId });
  } catch (e) {
    next(e);
  }
};

export const listFeeSchedule = async (req, res, next) => {
  try {
    const agencyId = parseIntValue(req.query.agencyId);
    if (!agencyId) return res.status(400).json({ error: { message: 'agencyId is required' } });
    await ClinicalEligibilityService.ensureAgencyAccess({ reqUser: req.user, agencyId });
    const [rows] = await clinicalPool.execute(
      `SELECT * FROM medical_fee_schedule_items WHERE agency_id = ? AND is_active = 1 ORDER BY procedure_code ASC`,
      [agencyId]
    );
    return res.json({ items: rows || [] });
  } catch (e) {
    next(e);
  }
};

export const upsertFeeScheduleItem = async (req, res, next) => {
  try {
    const agencyId = parseIntValue(req.body.agencyId);
    const procedureCode = String(req.body.procedureCode || '').trim().toUpperCase();
    if (!agencyId || !procedureCode) {
      return res.status(400).json({ error: { message: 'agencyId and procedureCode are required' } });
    }
    await ClinicalEligibilityService.ensureAgencyAccess({ reqUser: req.user, agencyId });
    const [result] = await clinicalPool.execute(
      `INSERT INTO medical_fee_schedule_items
       (agency_id, payer_label, procedure_code, modifier, description, unit_price_cents, unit_minutes, is_active)
       VALUES (?, ?, ?, ?, ?, ?, ?, 1)`,
      [
        agencyId,
        req.body.payerLabel || null,
        procedureCode,
        req.body.modifier || null,
        req.body.description || null,
        Number(req.body.unitPriceCents || 0),
        parseIntValue(req.body.unitMinutes)
      ]
    );
    return res.status(201).json({ id: result.insertId });
  } catch (e) {
    next(e);
  }
};

export const createMedicalClaim = async (req, res, next) => {
  try {
    const agencyId = parseIntValue(req.body.agencyId);
    const clientId = parseIntValue(req.body.clientId);
    const sessionId = parseIntValue(req.body.clinicalSessionId);
    const noteId = parseIntValue(req.body.clinicalNoteId);
    if (!agencyId || !clientId || !sessionId) {
      return res.status(400).json({ error: { message: 'agencyId, clientId, and clinicalSessionId are required' } });
    }
    await ClinicalEligibilityService.ensureAgencyAccess({ reqUser: req.user, agencyId });

    if (noteId) {
      const [nRows] = await clinicalPool.execute(
        `SELECT id, provider_signed_at, supervisor_cosigned_at, is_billable FROM clinical_notes WHERE id = ? LIMIT 1`,
        [noteId]
      );
      const note = nRows?.[0];
      if (!note) return res.status(404).json({ error: { message: 'Clinical note not found' } });
      const agency = await loadAgencyFlags(agencyId);
      const flags = getMedicalBillingFlags(agency);
      if (flags.clinicalNoteSigningEnabled) {
        if (!note.provider_signed_at) {
          return res.status(400).json({ error: { message: 'Note must be provider-signed before creating a claim' } });
        }
        if (!note.supervisor_cosigned_at && !note.is_billable) {
          return res.status(400).json({ error: { message: 'Note must be supervisor-cosigned before creating a claim' } });
        }
      }
    }

    const lines = Array.isArray(req.body.lines) ? req.body.lines : [];
    const amountCents = lines.reduce((s, l) => s + Number(l.chargeCents || 0), 0);
    const claim = await ClinicalClaim.create({
      clinicalSessionId: sessionId,
      agencyId,
      clientId,
      claimNumber: req.body.claimNumber || null,
      claimStatus: 'PENDING',
      amountCents,
      currencyCode: 'USD',
      claimPayload: JSON.stringify({ source: 'medical_billing', lines }),
      metadataJson: { createdVia: 'medicalBilling.createMedicalClaim' },
      createdByUserId: req.user.id
    });

    // Best-effort lifecycle columns (requires migration 002)
    try {
      await clinicalPool.execute(
        `UPDATE clinical_claims SET
           clinical_note_id = ?,
           payer_name = ?,
           member_id = ?,
           billing_npi = ?,
           rendering_npi = ?,
           taxonomy_code = ?,
           place_of_service = ?,
           date_of_service = ?,
           claim_lifecycle = 'draft',
           diagnosis_codes_json = ?
         WHERE id = ?`,
        [
          noteId,
          req.body.payerName || null,
          req.body.memberId || null,
          req.body.billingNpi || null,
          req.body.renderingNpi || null,
          req.body.taxonomyCode || null,
          req.body.placeOfService || null,
          req.body.dateOfService || null,
          req.body.diagnosisCodes ? JSON.stringify(req.body.diagnosisCodes) : null,
          claim.id
        ]
      );
      let lineNum = 1;
      for (const l of lines) {
        await clinicalPool.execute(
          `INSERT INTO clinical_claim_lines
           (clinical_claim_id, line_number, procedure_code, modifiers_json, units, charge_cents, diagnosis_pointers, clinical_note_id, service_date)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          [
            claim.id,
            lineNum++,
            String(l.procedureCode || '').toUpperCase(),
            l.modifiers ? JSON.stringify(l.modifiers) : null,
            Number(l.units || 1),
            Number(l.chargeCents || 0),
            l.diagnosisPointers || '1',
            noteId,
            l.serviceDate || req.body.dateOfService || null
          ]
        );
      }
    } catch (schemaErr) {
      console.warn('[medicalBilling] claim line insert skipped (run clinical migration 002):', schemaErr?.message);
    }

    return res.status(201).json({ claim });
  } catch (e) {
    next(e);
  }
};

export const listMedicalClaims = async (req, res, next) => {
  try {
    const agencyId = parseIntValue(req.query.agencyId);
    if (!agencyId) return res.status(400).json({ error: { message: 'agencyId is required' } });
    await ClinicalEligibilityService.ensureAgencyAccess({ reqUser: req.user, agencyId });
    const [rows] = await clinicalPool.execute(
      `SELECT id, clinical_session_id, client_id, claim_number, claim_status, amount_cents, currency_code,
              clinical_note_id, payer_name, claim_lifecycle, claimmd_claim_id, claimmd_last_status,
              date_of_service, created_at, updated_at
       FROM clinical_claims
       WHERE agency_id = ? AND is_deleted = 0
       ORDER BY created_at DESC
       LIMIT 200`,
      [agencyId]
    );
    return res.json({ claims: rows || [] });
  } catch (e) {
    next(e);
  }
};

export const saveClaimMdCredentials = async (req, res, next) => {
  try {
    const agencyId = parseIntValue(req.body.agencyId);
    const accountKey = String(req.body.accountKey || '').trim();
    if (!agencyId || !accountKey) {
      return res.status(400).json({ error: { message: 'agencyId and accountKey are required' } });
    }
    await ClinicalEligibilityService.ensureAgencyAccess({ reqUser: req.user, agencyId });
    if (!isChatEncryptionConfigured()) {
      return res.status(500).json({ error: { message: 'Encryption key not configured; cannot store Claim.MD AccountKey' } });
    }
    const { ciphertextB64, ivB64, authTagB64, keyId } = encryptChatText(accountKey);
    const envelope = JSON.stringify({
      _enc: true,
      keyId,
      iv: ivB64,
      tag: authTagB64,
      ciphertext: ciphertextB64
    });
    await AgencyClaimMdCredentials.upsert({
      agencyId,
      accountId: req.body.accountId ? String(req.body.accountId) : null,
      accountKeyEnc: envelope,
      actorUserId: req.user.id
    });
    return res.json({ ok: true, meta: await AgencyClaimMdCredentials.publicMeta(agencyId) });
  } catch (e) {
    next(e);
  }
};

async function resolveClaimMdAccountKey(agencyId) {
  const row = await AgencyClaimMdCredentials.findByAgencyId(agencyId);
  if (!row?.account_key_enc) {
    const err = new Error('Claim.MD credentials are not configured for this agency');
    err.status = 400;
    throw err;
  }
  const parsed = JSON.parse(row.account_key_enc);
  return decryptChatText({
    ciphertextB64: parsed.ciphertext,
    ivB64: parsed.iv,
    authTagB64: parsed.tag,
    keyId: parsed.keyId
  });
}

export const submitClaimToClaimMd = async (req, res, next) => {
  try {
    const agencyId = parseIntValue(req.body.agencyId);
    const claimId = parseIntValue(req.params.claimId || req.body.claimId);
    if (!agencyId || !claimId) {
      return res.status(400).json({ error: { message: 'agencyId and claimId are required' } });
    }
    await ClinicalEligibilityService.ensureAgencyAccess({ reqUser: req.user, agencyId });
    const accountKey = await resolveClaimMdAccountKey(agencyId);

    const [cRows] = await clinicalPool.execute(
      `SELECT * FROM clinical_claims WHERE id = ? AND agency_id = ? LIMIT 1`,
      [claimId, agencyId]
    );
    const claim = cRows?.[0];
    if (!claim) return res.status(404).json({ error: { message: 'Claim not found' } });

    const [lines] = await clinicalPool.execute(
      `SELECT * FROM clinical_claim_lines WHERE clinical_claim_id = ? ORDER BY line_number ASC`,
      [claimId]
    );
    const payload = buildClaimMdJsonClaim(claim, lines || []);
    const result = await uploadClaims({
      accountKey,
      fileContents: JSON.stringify({ claims: [payload] }),
      filename: `claim-${claimId}.json`
    });

    await clinicalPool.execute(
      `UPDATE clinical_claims SET
         claim_lifecycle = 'submitted',
         claim_status = 'SUBMITTED',
         claimmd_last_status = ?,
         claimmd_submitted_at = NOW(),
         claimmd_claim_id = COALESCE(?, claimmd_claim_id),
         updated_at = CURRENT_TIMESTAMP
       WHERE id = ?`,
      [
        typeof result === 'object' ? JSON.stringify(result).slice(0, 120) : String(result).slice(0, 120),
        result?.claimid || result?.ClaimID || result?.claims?.[0]?.claimid || null,
        claimId
      ]
    );

    return res.json({
      ok: true,
      message: 'Submitted to Claim.MD (may require portal approval before payer transmit)',
      result
    });
  } catch (e) {
    next(e);
  }
};

export const refreshClaimMdResponses = async (req, res, next) => {
  try {
    const agencyId = parseIntValue(req.query.agencyId || req.body.agencyId);
    if (!agencyId) return res.status(400).json({ error: { message: 'agencyId is required' } });
    await ClinicalEligibilityService.ensureAgencyAccess({ reqUser: req.user, agencyId });
    const accountKey = await resolveClaimMdAccountKey(agencyId);
    const responseId = String(req.query.responseId || req.body.responseId || '0');
    const result = await fetchResponses({ accountKey, responseId });
    return res.json({ result });
  } catch (e) {
    next(e);
  }
};

export const listClaimMdEras = async (req, res, next) => {
  try {
    const agencyId = parseIntValue(req.query.agencyId);
    if (!agencyId) return res.status(400).json({ error: { message: 'agencyId is required' } });
    await ClinicalEligibilityService.ensureAgencyAccess({ reqUser: req.user, agencyId });
    const accountKey = await resolveClaimMdAccountKey(agencyId);
    const result = await fetchEraList({ accountKey, page: req.query.page || '1' });
    return res.json({ result });
  } catch (e) {
    next(e);
  }
};

export const checkClaimMdEligibility = async (req, res, next) => {
  try {
    const agencyId = parseIntValue(req.body.agencyId);
    if (!agencyId) return res.status(400).json({ error: { message: 'agencyId is required' } });
    await ClinicalEligibilityService.ensureAgencyAccess({ reqUser: req.user, agencyId });
    const accountKey = await resolveClaimMdAccountKey(agencyId);
    const result = await requestEligibilityJson({ accountKey, payload: req.body.eligibility || {} });
    return res.json({ result });
  } catch (e) {
    next(e);
  }
};

/** Parse Note Aid panels into goals array for saveTreatmentPlanToChart. */
export function panelsToTreatmentPlanGoals(panels = []) {
  const goals = [];
  let current = null;
  for (const p of panels) {
    if (p.kind === 'goal' || /^Goal\s*\d+/i.test(p.id || p.title || '')) {
      current = {
        goalIndex: p.index || goals.length + 1,
        goalText: p.text || '',
        projectedCompletion: null,
        objectives: []
      };
      goals.push(current);
    } else if (current && (p.kind === 'objective' || /^Objective\s*\d+/i.test(p.id || p.title || ''))) {
      current.objectives.push({
        objectiveIndex: p.index || current.objectives.length + 1,
        objectiveText: p.text || ''
      });
    } else if (current && (p.kind === 'projected_time' || /^Projected/i.test(p.id || p.title || ''))) {
      current.projectedCompletion = p.text || '';
    }
  }
  return goals;
}

export const encryptPayloadForChart = maybeEncryptNotePayload;
export const decryptPayloadFromChart = maybeDecryptNotePayload;

const billingReportFiltersFromRequest = (req) => ({
  startDate: req.query.startDate || null,
  endDate: req.query.endDate || null,
  clientId: req.query.clientId || null,
  providerId: req.query.providerId || null,
  status: req.query.status || null,
  serviceCode: req.query.serviceCode || null,
  payer: req.query.payer || null,
  placeOfService: req.query.placeOfService || null,
  search: req.query.search || null
});

const numericReportSummary = (summary = {}) => Object.fromEntries(
  Object.entries(summary).map(([key, value]) => [key, Number(value || 0)])
);

const billingCsvEscape = (value) => {
  let output = value;
  if (value instanceof Date && !Number.isNaN(value.getTime())) output = value.toISOString();
  else if (value && typeof value === 'object') output = JSON.stringify(value);
  const str = output == null ? '' : String(output);
  return /[",\n\r]/.test(str) ? `"${str.replace(/"/g, '""')}"` : str;
};

/** Report definitions used by the Medical Billing report builder. */
export const listMedicalBillingReportCatalog = async (req, res, next) => {
  try {
    const agencyId = parseIntValue(req.query.agencyId);
    if (!agencyId) return res.status(400).json({ error: { message: 'agencyId is required' } });
    await ClinicalEligibilityService.ensureAgencyAccess({ reqUser: req.user, agencyId });
    return res.json({ reports: await getBillingReportCatalog() });
  } catch (e) {
    next(e);
  }
};

/** Run a filtered, read-only report over the medical billing data plane. */
export const runMedicalBillingReport = async (req, res, next) => {
  try {
    const agencyId = parseIntValue(req.query.agencyId);
    if (!agencyId) return res.status(400).json({ error: { message: 'agencyId is required' } });
    await ClinicalEligibilityService.ensureAgencyAccess({ reqUser: req.user, agencyId });
    const limit = Math.min(200, Math.max(1, Number(req.query.limit) || 50));
    const offset = Math.max(0, Number(req.query.offset) || 0);
    const result = await executeBillingReport({
      agencyId,
      type: req.query.type || 'claims',
      filters: billingReportFiltersFromRequest(req),
      limit,
      offset
    });
    return res.json({
      report: result.report,
      rows: result.rows,
      summary: numericReportSummary(result.summary),
      pagination: {
        total: result.total,
        limit: result.limit,
        offset: result.offset,
        hasNextPage: result.offset + result.rows.length < result.total
      },
      readOnly: true,
      notice: result.notice || null
    });
  } catch (e) {
    next(e);
  }
};

/** Export all filtered report rows (up to 10,000) as CSV. */
export const exportMedicalBillingReportCsv = async (req, res, next) => {
  try {
    const agencyId = parseIntValue(req.query.agencyId);
    if (!agencyId) return res.status(400).json({ error: { message: 'agencyId is required' } });
    await ClinicalEligibilityService.ensureAgencyAccess({ reqUser: req.user, agencyId });
    const result = await executeBillingReport({
      agencyId,
      type: req.query.type || 'claims',
      filters: billingReportFiltersFromRequest(req),
      limit: 10000,
      offset: 0
    });
    const columns = result.report.columns || [];
    const lines = [columns.map((column) => billingCsvEscape(column.label)).join(',')];
    for (const row of result.rows || []) {
      lines.push(columns.map((column) => billingCsvEscape(row[column.key])).join(','));
    }
    const safeType = String(result.report.type || 'report').replace(/[^a-z0-9_-]/gi, '-');
    const filename = `medical-billing-${safeType}-${new Date().toISOString().slice(0, 10)}.csv`;
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    return res.status(200).send(lines.join('\n'));
  } catch (e) {
    next(e);
  }
};

export const listMedicalServiceCodes = async (req, res, next) => {
  try {
    const agencyId = parseIntValue(req.query.agencyId);
    if (!agencyId) return res.status(400).json({ error: { message: 'agencyId is required' } });
    await ClinicalEligibilityService.ensureAgencyAccess({ reqUser: req.user, agencyId });
    try {
      const { ensureAgencyMedicalBillingDefaults } = await import('../services/medicalBillingDefaults.service.js');
      await ensureAgencyMedicalBillingDefaults(agencyId, { actorUserId: req.user.id });
    } catch {
      // ignore seed failures
    }
    try {
      const { reconcileAgencyServiceCodeCatalog } = await import('../services/agencyServiceCodeCatalog.service.js');
      await reconcileAgencyServiceCodeCatalog(agencyId, { actorUserId: req.user.id });
    } catch {
      // ignore sync failures
    }
    const items = await AgencyMedicalServiceCode.listByAgency(agencyId, {
      includeInactive: String(req.query.includeInactive || '') === '1'
    });
    return res.json({ items });
  } catch (e) {
    next(e);
  }
};

export const upsertMedicalServiceCode = async (req, res, next) => {
  try {
    const agencyId = parseIntValue(req.body.agencyId);
    const serviceCode = String(req.body.serviceCode || '').trim().toUpperCase();
    if (!agencyId || !serviceCode) {
      return res.status(400).json({ error: { message: 'agencyId and serviceCode are required' } });
    }
    await ClinicalEligibilityService.ensureAgencyAccess({ reqUser: req.user, agencyId });

    let ladderBandsJson = req.body.ladderBands || req.body.ladderBandsJson || null;
    const mode = String(req.body.unitCalcMode || 'SINGLE').toUpperCase();
    if (!ladderBandsJson && mode === 'MEDICAID_8_MINUTE_LADDER') {
      ladderBandsJson = buildMedicaid8MinuteBands({
        unitMinutes: req.body.unitMinutes || 15,
        maxUnits: req.body.maxUnitsPerSession || 12,
        minMinutes: req.body.minMinutes || 8
      });
    }

    const allowedCredentialTiers = Array.isArray(req.body.allowedCredentialTiers)
      ? req.body.allowedCredentialTiers
      : (typeof req.body.allowedCredentialTiers === 'string' && req.body.allowedCredentialTiers.trim()
        ? req.body.allowedCredentialTiers.split(',').map((t) => t.trim()).filter(Boolean)
        : null);

    const allowedPlaceOfService = Array.isArray(req.body.allowedPlaceOfService)
      ? req.body.allowedPlaceOfService
      : (typeof req.body.allowedPlaceOfService === 'string' && req.body.allowedPlaceOfService.trim()
        ? req.body.allowedPlaceOfService.split(',').map((t) => t.trim()).filter(Boolean)
        : null);

    const isActive = req.body.isActive !== false;
    const item = await AgencyMedicalServiceCode.upsert({
      agencyId,
      serviceCode,
      description: req.body.description || null,
      unitCalcMode: mode,
      unitMinutes: req.body.unitMinutes ?? null,
      minMinutes: req.body.minMinutes ?? null,
      maxMinutes: req.body.maxMinutes ?? null,
      maxUnitsPerSession: req.body.maxUnitsPerSession ?? null,
      maxUnitsPerDay: req.body.maxUnitsPerDay ?? null,
      ladderBandsJson,
      overflowServiceCode: req.body.overflowServiceCode || null,
      overflowAtMinutes: req.body.overflowAtMinutes ?? null,
      defaultPlaceOfService: req.body.defaultPlaceOfService || null,
      allowedPlaceOfService,
      allowedCredentialTiers,
      isActive,
      createdByUserId: req.user.id
    });

    // Best-effort: ensure code exists in scheduling dictionary so calendar can select it
    try {
      await pool.execute(
        `INSERT INTO scheduling_service_codes (service_code, description, is_active)
         VALUES (?, ?, 1)
         ON DUPLICATE KEY UPDATE description = COALESCE(VALUES(description), description), is_active = 1`,
        [serviceCode, req.body.description || null]
      );
    } catch {
      // table/columns may differ
    }

    try {
      const {
        syncClinicalCodePresent,
        removeServiceCodeEverywhere
      } = await import('../services/agencyServiceCodeCatalog.service.js');
      if (!isActive) {
        await removeServiceCodeEverywhere(agencyId, serviceCode, {
          skipMedical: true,
          forceAllSurfaces: true
        });
      } else {
        await syncClinicalCodePresent(agencyId, serviceCode, { actorUserId: req.user.id });
      }
    } catch {
      /* best-effort catalog sync */
    }

    return res.status(201).json({ item });
  } catch (e) {
    next(e);
  }
};

export const previewServiceCodeUnits = async (req, res, next) => {
  try {
    const agencyId = parseIntValue(req.body.agencyId || req.query.agencyId);
    const serviceCode = String(req.body.serviceCode || req.query.serviceCode || '').trim().toUpperCase();
    const minutes = Number(req.body.minutes || req.query.minutes || 0);
    if (!agencyId || !serviceCode) {
      return res.status(400).json({ error: { message: 'agencyId and serviceCode are required' } });
    }
    await ClinicalEligibilityService.ensureAgencyAccess({ reqUser: req.user, agencyId });

    const row = await AgencyMedicalServiceCode.findByAgencyAndCode(agencyId, serviceCode);
    if (!row) {
      return res.status(404).json({ error: { message: `No medical service code ${serviceCode} for this agency` } });
    }
    const primary = ruleFromMedicalServiceCodeRow(row);
    const codes = await AgencyMedicalServiceCode.listByAgency(agencyId, { includeInactive: false });
    const byCode = new Map(codes.map((c) => [String(c.service_code).toUpperCase(), c]));
    const result = resolveWithOverflowChain(minutes, primary, (code) => {
      const hit = byCode.get(String(code).toUpperCase());
      return hit ? ruleFromMedicalServiceCodeRow(hit) : null;
    });
    return res.json({
      ...result,
      ladderBands: primary.ladderBandsJson
        || (String(primary.unitCalcMode).toUpperCase() === 'MEDICAID_8_MINUTE_LADDER'
          ? buildMedicaid8MinuteBands({
            unitMinutes: primary.unitMinutes || 15,
            maxUnits: primary.maxUnitsPerSession || 12,
            minMinutes: primary.minMinutes || 8
          })
          : null)
    });
  } catch (e) {
    next(e);
  }
};

export const listServiceLocations = async (req, res, next) => {
  try {
    const agencyId = parseIntValue(req.query.agencyId);
    if (!agencyId) return res.status(400).json({ error: { message: 'agencyId is required' } });
    await ClinicalEligibilityService.ensureAgencyAccess({ reqUser: req.user, agencyId });
    const items = await AgencyServiceLocation.listByAgency(agencyId, {
      includeInactive: String(req.query.includeInactive || '') === '1'
    });
    const offices = await OfficeLocation.findByAgencyMembership(agencyId, { includeInactive: false }).catch(() =>
      OfficeLocation.findByAgency(agencyId, { includeInactive: false })
    );
    return res.json({ items, billingOffices: offices || [] });
  } catch (e) {
    next(e);
  }
};

export const createServiceLocation = async (req, res, next) => {
  try {
    const agencyId = parseIntValue(req.body.agencyId);
    const name = String(req.body.name || '').trim();
    const placeOfService = String(req.body.placeOfService || '').trim();
    if (!agencyId || !name || !placeOfService) {
      return res.status(400).json({ error: { message: 'agencyId, name, and placeOfService are required' } });
    }
    await ClinicalEligibilityService.ensureAgencyAccess({ reqUser: req.user, agencyId });
    const item = await AgencyServiceLocation.create({
      agencyId,
      name,
      placeOfService,
      streetAddress: req.body.streetAddress || null,
      city: req.body.city || null,
      state: req.body.state || null,
      postalCode: req.body.postalCode || null,
      notes: req.body.notes || null,
      requiresCredentialing: !!req.body.requiresCredentialing,
      billingOfficeLocationId: parseIntValue(req.body.billingOfficeLocationId),
      schoolOrganizationId: parseIntValue(req.body.schoolOrganizationId),
      createdByUserId: req.user.id
    });
    return res.status(201).json({ item });
  } catch (e) {
    next(e);
  }
};

/**
 * Find-or-create a POS 03 school service location for booking.
 * Claims still bill under the tenant billing office; school is the clinical site only.
 */
export const ensureSchoolServiceLocation = async (req, res, next) => {
  try {
    const agencyId = parseIntValue(req.body.agencyId);
    const schoolOrganizationId = parseIntValue(req.body.schoolOrganizationId);
    if (!agencyId || !schoolOrganizationId) {
      return res.status(400).json({ error: { message: 'agencyId and schoolOrganizationId are required' } });
    }
    await ClinicalEligibilityService.ensureAgencyAccess({ reqUser: req.user, agencyId });

    const [schoolRows] = await pool.execute(
      `SELECT id, name FROM agencies
       WHERE id = ?
         AND LOWER(COALESCE(organization_type, '')) = 'school'
       LIMIT 1`,
      [schoolOrganizationId]
    );
    const school = schoolRows?.[0];
    if (!school) {
      return res.status(404).json({ error: { message: 'School organization not found' } });
    }

    let item = await AgencyServiceLocation.findByAgencyAndSchool(agencyId, schoolOrganizationId);
    if (item) return res.json({ item, created: false });

    let billingOfficeLocationId = parseIntValue(req.body.billingOfficeLocationId);
    if (!billingOfficeLocationId) {
      const offices = await OfficeLocation.findByAgencyMembership(agencyId, { includeInactive: false }).catch(() =>
        OfficeLocation.findByAgency(agencyId, { includeInactive: false })
      );
      billingOfficeLocationId = Number(offices?.[0]?.id || 0) || null;
    }

    item = await AgencyServiceLocation.create({
      agencyId,
      name: String(school.name || '').trim() || `School #${schoolOrganizationId}`,
      placeOfService: '03',
      notes: 'Auto-added school site. Claims bill under the tenant billing office + POS.',
      requiresCredentialing: false,
      billingOfficeLocationId,
      schoolOrganizationId,
      createdByUserId: req.user.id
    });
    return res.status(201).json({ item, created: true });
  } catch (e) {
    next(e);
  }
};

export const updateServiceLocation = async (req, res, next) => {
  try {
    const id = parseIntValue(req.params.locationId);
    const agencyId = parseIntValue(req.body.agencyId);
    if (!id || !agencyId) return res.status(400).json({ error: { message: 'locationId and agencyId are required' } });
    await ClinicalEligibilityService.ensureAgencyAccess({ reqUser: req.user, agencyId });
    const existing = await AgencyServiceLocation.findById(id);
    if (!existing || Number(existing.agency_id) !== agencyId) {
      return res.status(404).json({ error: { message: 'Service location not found' } });
    }
    const item = await AgencyServiceLocation.update(id, {
      name: req.body.name,
      placeOfService: req.body.placeOfService,
      streetAddress: req.body.streetAddress,
      city: req.body.city,
      state: req.body.state,
      postalCode: req.body.postalCode,
      notes: req.body.notes,
      requiresCredentialing: req.body.requiresCredentialing,
      billingOfficeLocationId: req.body.billingOfficeLocationId === null
        ? null
        : parseIntValue(req.body.billingOfficeLocationId),
      isActive: req.body.isActive
    });
    return res.json({ item });
  } catch (e) {
    next(e);
  }
};

/**
 * Apply service code + location + unit resolution onto a clinical session (encounter).
 */
export const applyEncounterBilling = async (req, res, next) => {
  try {
    const sessionId = parseIntValue(req.params.sessionId);
    const agencyId = parseIntValue(req.body.agencyId);
    const session = await ClinicalSession.findById(sessionId);
    if (!session) return res.status(404).json({ error: { message: 'Clinical session not found' } });
    const aid = agencyId || Number(session.agency_id);
    await ClinicalEligibilityService.ensureAgencyAccess({ reqUser: req.user, agencyId: aid });

    const serviceCode = String(req.body.serviceCode || session.service_code || '').trim().toUpperCase();
    const minutes = Number(req.body.durationMinutes ?? session.duration_minutes ?? 0);
    const serviceLocationId = parseIntValue(req.body.serviceLocationId) || session.service_location_id || null;
    let billingOfficeLocationId =
      parseIntValue(req.body.billingOfficeLocationId) || session.billing_office_location_id || null;
    let placeOfService = req.body.placeOfService || session.place_of_service || null;

    let location = null;
    if (serviceLocationId) {
      location = await AgencyServiceLocation.findById(serviceLocationId);
      if (location && Number(location.agency_id) === aid) {
        placeOfService = placeOfService || location.place_of_service;
        billingOfficeLocationId = billingOfficeLocationId || location.billing_office_location_id || null;
      }
    }

    let resolution = null;
    if (serviceCode && minutes > 0) {
      const row = await AgencyMedicalServiceCode.findByAgencyAndCode(aid, serviceCode);
      if (row) {
        const primary = ruleFromMedicalServiceCodeRow(row);
        const codes = await AgencyMedicalServiceCode.listByAgency(aid);
        const byCode = new Map(codes.map((c) => [String(c.service_code).toUpperCase(), c]));
        resolution = resolveWithOverflowChain(minutes, primary, (code) => {
          const hit = byCode.get(String(code).toUpperCase());
          return hit ? ruleFromMedicalServiceCodeRow(hit) : null;
        });
        placeOfService = placeOfService || primary.defaultPlaceOfService || null;
      }
    }

    try {
      await clinicalPool.execute(
        `UPDATE clinical_sessions SET
           service_code = ?,
           effective_service_code = ?,
           service_location_id = ?,
           billing_office_location_id = ?,
           place_of_service = ?,
           duration_minutes = ?,
           billed_units = ?,
           claim_blocked_reason = ?,
           updated_at = CURRENT_TIMESTAMP
         WHERE id = ?`,
        [
          serviceCode || null,
          resolution?.effectiveServiceCode || serviceCode || null,
          serviceLocationId,
          billingOfficeLocationId,
          placeOfService || null,
          minutes || null,
          resolution?.claimable ? resolution.units : null,
          resolution && !resolution.claimable ? resolution.reason : null,
          sessionId
        ]
      );
    } catch (schemaErr) {
      return res.status(500).json({
        error: {
          message: 'Clinical session billing columns missing. Run clinical migration 003_session_service_code_location.sql',
          details: schemaErr?.message
        }
      });
    }

    const updated = await ClinicalSession.findById(sessionId);
    return res.json({
      session: updated,
      billing: resolution,
      serviceLocation: location,
      billingAddressNote:
        'Claims bill under the linked office address (billing_office_location_id); service location POS is stored on the encounter/note.'
    });
  } catch (e) {
    next(e);
  }
};
