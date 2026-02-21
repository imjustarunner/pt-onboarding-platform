import { validationResult } from 'express-validator';
import AdminAuditLog from '../models/AdminAuditLog.model.js';
import User from '../models/User.model.js';
import { logClientAccess } from '../services/clientAccessLog.service.js';
import ClinicalRecordRef from '../models/ClinicalRecordRef.model.js';
import ClinicalSession from '../models/clinical/ClinicalSession.model.js';
import ClinicalNote from '../models/clinical/ClinicalNote.model.js';
import ClinicalClaim from '../models/clinical/ClinicalClaim.model.js';
import ClinicalDocument from '../models/clinical/ClinicalDocument.model.js';
import ClinicalEligibilityService from '../services/clinicalEligibility.service.js';
import SupervisorAssignment from '../models/SupervisorAssignment.model.js';
import pool from '../config/database.js';

const BACKOFFICE_ROLES = new Set(['admin', 'super_admin', 'support']);
const CLINICAL_DB_HINT = 'Clinical database schema missing. Run database/clinical_migrations/001_create_clinical_data_plane.sql';
const MAIN_DB_HINT = 'Main database clinical references missing. Run database/migrations/443_create_clinical_record_refs.sql';

function isBackoffice(role) {
  return BACKOFFICE_ROLES.has(String(role || '').toLowerCase());
}

function parseIntValue(v) {
  const n = Number(v);
  return Number.isInteger(n) && n > 0 ? n : null;
}

function handleSchemaError(error, res) {
  const code = error?.code || error?.errno;
  const msg = String(error?.sqlMessage || error?.message || '');
  if (code === 'ER_NO_SUCH_TABLE' || msg.includes('ER_NO_SUCH_TABLE')) {
    if (msg.includes('clinical_')) {
      res.status(500).json({ error: { message: CLINICAL_DB_HINT } });
      return true;
    }
    if (msg.includes('clinical_record_refs')) {
      res.status(500).json({ error: { message: MAIN_DB_HINT } });
      return true;
    }
  }
  return false;
}

async function resolveAuditAgencyId({ targetUserId, actorUserId, explicitAgencyId = null }) {
  if (explicitAgencyId) return explicitAgencyId;
  if (targetUserId) {
    const targetAgencies = await User.getAgencies(targetUserId);
    const targetAgencyId = targetAgencies?.[0]?.id ? Number(targetAgencies[0].id) : null;
    if (targetAgencyId) return targetAgencyId;
  }
  if (actorUserId) {
    const actorAgencies = await User.getAgencies(actorUserId);
    const actorAgencyId = actorAgencies?.[0]?.id ? Number(actorAgencies[0].id) : null;
    return actorAgencyId || null;
  }
  return null;
}

async function logAudit(req, {
  actionType,
  targetUserId,
  agencyId,
  clinicalSessionId,
  recordType,
  recordId,
  metadata = {}
}) {
  try {
    const auditAgencyId = await resolveAuditAgencyId({
      targetUserId,
      actorUserId: req.user?.id || null,
      explicitAgencyId: agencyId
    });
    if (!auditAgencyId) return;
    await AdminAuditLog.logAction({
      actionType,
      actorUserId: req.user?.id || null,
      targetUserId: targetUserId || null,
      agencyId: auditAgencyId,
      metadata: {
        clinicalSessionId,
        recordType,
        recordId,
        ...metadata
      }
    });
  } catch (err) {
    console.error('[clinicalData] Audit log failed:', err?.message || err);
  }
}

function modelByType(recordType) {
  const t = String(recordType || '').toLowerCase();
  if (t === 'note') return ClinicalNote;
  if (t === 'claim') return ClinicalClaim;
  if (t === 'document') return ClinicalDocument;
  return null;
}

export const bootstrapClinicalSession = async (req, res, next) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ error: { message: 'Validation failed', details: errors.array() } });
    }

    const agencyId = parseIntValue(req.body?.agencyId);
    const clientId = parseIntValue(req.body?.clientId);
    const officeEventId = parseIntValue(req.body?.officeEventId);
    if (!agencyId || !clientId || !officeEventId) {
      return res.status(400).json({ error: { message: 'agencyId, clientId, and officeEventId are required' } });
    }

    await ClinicalEligibilityService.ensureAgencyAccess({ reqUser: req.user, agencyId });
    await ClinicalEligibilityService.assertAgencyHasClinicalOrg(agencyId);
    const { event } = await ClinicalEligibilityService.assertBookedClinicalSession({ agencyId, clientId, officeEventId });

    const session = await ClinicalSession.upsert({
      agencyId,
      clientId,
      officeEventId,
      providerUserId: parseIntValue(event.booked_provider_id) || parseIntValue(event.assigned_provider_id) || null,
      sourceTimezone: String(req.body?.sourceTimezone || 'America/New_York'),
      scheduledStartAt: event.start_at || null,
      scheduledEndAt: event.end_at || null,
      metadataJson: req.body?.metadata || null,
      createdByUserId: req.user.id
    });

    await logAudit(req, {
      actionType: 'clinical_session_started',
      targetUserId: session.provider_user_id || null,
      agencyId,
      clinicalSessionId: session.id,
      recordType: 'session',
      recordId: session.id,
      metadata: { clientId, officeEventId }
    });

    res.json({ ok: true, session });
  } catch (error) {
    if (handleSchemaError(error, res)) return;
    next(error);
  }
};

export const listSessionArtifacts = async (req, res, next) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ error: { message: 'Validation failed', details: errors.array() } });
    }
    const sessionId = parseIntValue(req.params.sessionId);
    const includeDeleted = String(req.query?.includeDeleted || '').toLowerCase() === 'true' && isBackoffice(req.user?.role);
    if (!sessionId) return res.status(400).json({ error: { message: 'Invalid sessionId' } });
    const session = await ClinicalSession.findById(sessionId);
    if (!session) return res.status(404).json({ error: { message: 'Clinical session not found' } });
    await ClinicalEligibilityService.ensureAgencyAccess({ reqUser: req.user, agencyId: session.agency_id });
    await ClinicalEligibilityService.assertAgencyHasClinicalOrg(session.agency_id);

    const [notes, claims, documents, refs] = await Promise.all([
      ClinicalNote.listBySession({ clinicalSessionId: session.id, includeDeleted }),
      ClinicalClaim.listBySession({ clinicalSessionId: session.id, includeDeleted }),
      ClinicalDocument.listBySession({ clinicalSessionId: session.id, includeDeleted }),
      ClinicalRecordRef.listForSession({
        agencyId: session.agency_id,
        clientId: session.client_id,
        officeEventId: session.office_event_id
      })
    ]);

    logClientAccess(req, session.client_id, 'clinical_artifacts_viewed').catch(() => {});

    res.json({
      ok: true,
      session,
      artifacts: { notes, claims, documents },
      refs
    });
  } catch (error) {
    if (handleSchemaError(error, res)) return;
    next(error);
  }
};

export const createSessionNote = async (req, res, next) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ error: { message: 'Validation failed', details: errors.array() } });
    }
    const sessionId = parseIntValue(req.params.sessionId);
    const session = await ClinicalSession.findById(sessionId);
    if (!session) return res.status(404).json({ error: { message: 'Clinical session not found' } });
    await ClinicalEligibilityService.ensureAgencyAccess({ reqUser: req.user, agencyId: session.agency_id });
    await ClinicalEligibilityService.assertAgencyHasClinicalOrg(session.agency_id);
    await ClinicalEligibilityService.assertBookedClinicalSession({
      agencyId: session.agency_id,
      clientId: session.client_id,
      officeEventId: session.office_event_id
    });

    const title = String(req.body?.title || '').trim();
    if (!title) return res.status(400).json({ error: { message: 'title is required' } });
    const notePayload =
      req.body?.notePayload !== undefined && req.body?.notePayload !== null
        ? String(req.body.notePayload)
        : null;
    const metadata = {
      ...(req.body?.metadata && typeof req.body.metadata === 'object' ? req.body.metadata : {}),
      noteType: req.body?.noteType ? String(req.body.noteType).trim() : null,
      templateVersion: req.body?.templateVersion ? String(req.body.templateVersion).trim() : null,
      serviceCode: req.body?.serviceCode ? String(req.body.serviceCode).trim().toUpperCase() : null,
      modifiers: Array.isArray(req.body?.modifiers)
        ? req.body.modifiers.map((m) => String(m || '').trim().toUpperCase()).filter(Boolean)
        : [],
      officeEventId: parseIntValue(req.body?.officeEventId) || session.office_event_id || null,
      source: req.body?.source ? String(req.body.source).trim() : null
    };
    const note = await ClinicalNote.create({
      clinicalSessionId: session.id,
      agencyId: session.agency_id,
      clientId: session.client_id,
      title,
      notePayload,
      metadataJson: metadata,
      createdByUserId: req.user.id
    });

    await ClinicalRecordRef.upsert({
      agencyId: session.agency_id,
      clientId: session.client_id,
      officeEventId: session.office_event_id,
      clinicalSessionId: session.id,
      recordType: 'note',
      clinicalRecordId: note.id
    });

    await logAudit(req, {
      actionType: 'clinical_note_created',
      targetUserId: session.provider_user_id || null,
      agencyId: session.agency_id,
      clinicalSessionId: session.id,
      recordType: 'note',
      recordId: note.id,
      metadata: { clientId: session.client_id, officeEventId: session.office_event_id, title: note.title || null }
    });

    // Auto-create signoff when provider has a supervisor (clinical org)
    const providerUserId = session.provider_user_id || req.user.id;
    const supervisors = await SupervisorAssignment.findBySupervisee(providerUserId, session.agency_id);
    const primarySupervisor = supervisors.find((s) => s.is_primary) || supervisors[0];
    if (primarySupervisor) {
      try {
        await pool.execute(
          `INSERT INTO clinical_note_signoffs (agency_id, clinical_note_id, provider_user_id, supervisor_user_id, provider_signed_at, status)
           VALUES (?, ?, ?, ?, NOW(), 'awaiting_supervisor')`,
          [session.agency_id, note.id, providerUserId, primarySupervisor.supervisor_id]
        );
      } catch (e) {
        if (e?.code !== 'ER_DUP_ENTRY') console.error('[clinicalData] Signoff create failed:', e?.message);
      }
    }

    res.status(201).json({ ok: true, note });
  } catch (error) {
    if (handleSchemaError(error, res)) return;
    next(error);
  }
};

export const createSessionClaim = async (req, res, next) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ error: { message: 'Validation failed', details: errors.array() } });
    }
    const sessionId = parseIntValue(req.params.sessionId);
    const session = await ClinicalSession.findById(sessionId);
    if (!session) return res.status(404).json({ error: { message: 'Clinical session not found' } });
    await ClinicalEligibilityService.ensureAgencyAccess({ reqUser: req.user, agencyId: session.agency_id });
    await ClinicalEligibilityService.assertAgencyHasClinicalOrg(session.agency_id);
    await ClinicalEligibilityService.assertBookedClinicalSession({
      agencyId: session.agency_id,
      clientId: session.client_id,
      officeEventId: session.office_event_id
    });

    const claim = await ClinicalClaim.create({
      clinicalSessionId: session.id,
      agencyId: session.agency_id,
      clientId: session.client_id,
      claimNumber: req.body?.claimNumber ? String(req.body.claimNumber).trim() : null,
      claimStatus: String(req.body?.claimStatus || 'PENDING').toUpperCase(),
      amountCents: Number(req.body?.amountCents || 0),
      currencyCode: String(req.body?.currencyCode || 'USD').toUpperCase(),
      claimPayload: req.body?.claimPayload ? String(req.body.claimPayload) : null,
      metadataJson: req.body?.metadata || null,
      createdByUserId: req.user.id
    });

    await ClinicalRecordRef.upsert({
      agencyId: session.agency_id,
      clientId: session.client_id,
      officeEventId: session.office_event_id,
      clinicalSessionId: session.id,
      recordType: 'claim',
      clinicalRecordId: claim.id
    });

    await logAudit(req, {
      actionType: 'clinical_claim_created',
      targetUserId: session.provider_user_id || null,
      agencyId: session.agency_id,
      clinicalSessionId: session.id,
      recordType: 'claim',
      recordId: claim.id,
      metadata: { clientId: session.client_id, officeEventId: session.office_event_id }
    });

    res.status(201).json({ ok: true, claim });
  } catch (error) {
    if (handleSchemaError(error, res)) return;
    next(error);
  }
};

export const createSessionDocument = async (req, res, next) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ error: { message: 'Validation failed', details: errors.array() } });
    }
    const sessionId = parseIntValue(req.params.sessionId);
    const session = await ClinicalSession.findById(sessionId);
    if (!session) return res.status(404).json({ error: { message: 'Clinical session not found' } });
    await ClinicalEligibilityService.ensureAgencyAccess({ reqUser: req.user, agencyId: session.agency_id });
    await ClinicalEligibilityService.assertAgencyHasClinicalOrg(session.agency_id);
    await ClinicalEligibilityService.assertBookedClinicalSession({
      agencyId: session.agency_id,
      clientId: session.client_id,
      officeEventId: session.office_event_id
    });
    const title = String(req.body?.title || '').trim();
    if (!title) return res.status(400).json({ error: { message: 'title is required' } });

    const doc = await ClinicalDocument.create({
      clinicalSessionId: session.id,
      agencyId: session.agency_id,
      clientId: session.client_id,
      title,
      documentType: req.body?.documentType ? String(req.body.documentType).trim() : null,
      storagePath: req.body?.storagePath ? String(req.body.storagePath).trim() : null,
      originalName: req.body?.originalName ? String(req.body.originalName).trim() : null,
      mimeType: req.body?.mimeType ? String(req.body.mimeType).trim() : null,
      metadataJson: req.body?.metadata || null,
      createdByUserId: req.user.id
    });

    await ClinicalRecordRef.upsert({
      agencyId: session.agency_id,
      clientId: session.client_id,
      officeEventId: session.office_event_id,
      clinicalSessionId: session.id,
      recordType: 'document',
      clinicalRecordId: doc.id
    });

    await logAudit(req, {
      actionType: 'clinical_document_created',
      targetUserId: session.provider_user_id || null,
      agencyId: session.agency_id,
      clinicalSessionId: session.id,
      recordType: 'document',
      recordId: doc.id,
      metadata: { clientId: session.client_id, officeEventId: session.office_event_id, title: doc.title || null }
    });

    res.status(201).json({ ok: true, document: doc });
  } catch (error) {
    if (handleSchemaError(error, res)) return;
    next(error);
  }
};

async function getRecordForMutation(req, res) {
  const recordType = String(req.params.recordType || '').toLowerCase();
  const id = parseIntValue(req.params.id);
  if (!id) {
    res.status(400).json({ error: { message: 'Invalid id' } });
    return null;
  }
  const model = modelByType(recordType);
  if (!model) {
    res.status(400).json({ error: { message: 'Unsupported record type' } });
    return null;
  }
  const record = await model.findById(id);
  if (!record) {
    res.status(404).json({ error: { message: 'Record not found' } });
    return null;
  }
  const session = await ClinicalSession.findById(record.clinical_session_id);
  if (!session) {
    res.status(404).json({ error: { message: 'Clinical session not found' } });
    return null;
  }
  await ClinicalEligibilityService.ensureAgencyAccess({ reqUser: req.user, agencyId: session.agency_id });
  await ClinicalEligibilityService.assertAgencyHasClinicalOrg(session.agency_id);
  return { model, record, session, recordType };
}

export const softDeleteClinicalRecord = async (req, res, next) => {
  try {
    const loaded = await getRecordForMutation(req, res);
    if (!loaded) return;
    const { model, record, session, recordType } = loaded;
    const ok = await model.softDeleteById(record.id, req.user.id);
    if (!ok) {
      return res.status(400).json({ error: { message: 'Record cannot be deleted (already deleted or under legal hold)' } });
    }
    await logAudit(req, {
      actionType: `clinical_${recordType}_deleted`,
      targetUserId: session.provider_user_id || null,
      agencyId: session.agency_id,
      clinicalSessionId: session.id,
      recordType,
      recordId: record.id,
      metadata: { clientId: session.client_id, officeEventId: session.office_event_id, title: record.title || null }
    });
    res.json({ ok: true });
  } catch (error) {
    if (handleSchemaError(error, res)) return;
    next(error);
  }
};

export const restoreClinicalRecord = async (req, res, next) => {
  try {
    if (!isBackoffice(req.user?.role)) {
      return res.status(403).json({ error: { message: 'Admin access required' } });
    }
    const loaded = await getRecordForMutation(req, res);
    if (!loaded) return;
    const { model, record, session, recordType } = loaded;
    const ok = await model.restoreById(record.id);
    if (!ok) return res.status(400).json({ error: { message: 'Record is not deleted' } });
    await logAudit(req, {
      actionType: `clinical_${recordType}_restored`,
      targetUserId: session.provider_user_id || null,
      agencyId: session.agency_id,
      clinicalSessionId: session.id,
      recordType,
      recordId: record.id,
      metadata: { clientId: session.client_id, officeEventId: session.office_event_id, title: record.title || null }
    });
    res.json({ ok: true });
  } catch (error) {
    if (handleSchemaError(error, res)) return;
    next(error);
  }
};

export const setClinicalRecordLegalHold = async (req, res, next) => {
  try {
    if (!isBackoffice(req.user?.role)) {
      return res.status(403).json({ error: { message: 'Admin access required' } });
    }
    const loaded = await getRecordForMutation(req, res);
    if (!loaded) return;
    const { model, record, session, recordType } = loaded;
    const reason = String(req.body?.reason || '').trim();
    if (!reason) return res.status(400).json({ error: { message: 'reason is required' } });
    const ok = await model.setLegalHoldById(record.id, reason, req.user.id);
    if (!ok) return res.status(400).json({ error: { message: 'Failed to set legal hold' } });
    await logAudit(req, {
      actionType: `clinical_${recordType}_legal_hold_set`,
      targetUserId: session.provider_user_id || null,
      agencyId: session.agency_id,
      clinicalSessionId: session.id,
      recordType,
      recordId: record.id,
      metadata: { clientId: session.client_id, officeEventId: session.office_event_id, reason, title: record.title || null }
    });
    res.json({ ok: true });
  } catch (error) {
    if (handleSchemaError(error, res)) return;
    next(error);
  }
};

export const releaseClinicalRecordLegalHold = async (req, res, next) => {
  try {
    if (!isBackoffice(req.user?.role)) {
      return res.status(403).json({ error: { message: 'Admin access required' } });
    }
    const loaded = await getRecordForMutation(req, res);
    if (!loaded) return;
    const { model, record, session, recordType } = loaded;
    const ok = await model.releaseLegalHoldById(record.id, req.user.id);
    if (!ok) return res.status(400).json({ error: { message: 'Legal hold is not active' } });
    await logAudit(req, {
      actionType: `clinical_${recordType}_legal_hold_released`,
      targetUserId: session.provider_user_id || null,
      agencyId: session.agency_id,
      clinicalSessionId: session.id,
      recordType,
      recordId: record.id,
      metadata: { clientId: session.client_id, officeEventId: session.office_event_id, title: record.title || null }
    });
    res.json({ ok: true });
  } catch (error) {
    if (handleSchemaError(error, res)) return;
    next(error);
  }
};

