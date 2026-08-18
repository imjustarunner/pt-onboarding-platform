import multer from 'multer';
import { validationResult } from 'express-validator';

import Agency from '../models/Agency.model.js';
import User from '../models/User.model.js';
import Client from '../models/Client.model.js';
import SessionRecording from '../models/SessionRecording.model.js';
import SessionRecordingNote from '../models/SessionRecordingNote.model.js';
import SessionRecordingConsent from '../models/SessionRecordingConsent.model.js';
import LearningClassSession from '../models/LearningClassSession.model.js';
import DocumentTemplate from '../models/DocumentTemplate.model.js';
import TaskAssignmentService from '../services/taskAssignment.service.js';
import TaskAuditLog from '../models/TaskAuditLog.model.js';
import { maybeEncryptNotePayload, maybeDecryptNotePayload } from '../services/clinicalNoteCrypto.service.js';
import { transcribeLongAudio } from '../services/speechTranscription.service.js';
import {
  summarizeSessionRecording,
  generateStructuredNoteFromSummary
} from '../services/sessionRecordingSummary.service.js';
import { getUserFeatureCurrent } from '../services/featureEntitlement.service.js';
import { attachSignedPdfToClient } from '../services/phiDocumentAttachment.service.js';
import { generateUniqueSixDigitClientCode } from '../utils/clientCode.js';
import { seedClientAffiliations } from '../utils/clientProvisioning.js';
import {
  SESSION_RECORDING_FEATURE_FLAG,
  SESSION_RECORDING_FEATURE_KEY,
  SESSION_RECORDING_NOTE_AIDS,
  canUseSessionRecordingRole,
  isTruthyFeatureFlag,
  resolveSessionRecordingNoteAid,
  NLU_AGENCY_ID
} from '../config/sessionRecordingAccess.js';

function safeInt(v) {
  const n = Number(v);
  return Number.isInteger(n) && n > 0 ? n : null;
}

function initialsFromFullName(fullName) {
  const parts = String(fullName || '')
    .trim()
    .split(/\s+/)
    .filter(Boolean);
  if (!parts.length) return 'XX';
  return parts
    .map((p) => p[0])
    .join('')
    .toUpperCase()
    .slice(0, 8);
}

/**
 * Match an existing client by name + DOB, or create one so the signed waiver
 * can live on their file and not be re-prompted later.
 */
async function ensureClientForRecordingConsent({
  agencyId,
  fullName,
  dateOfBirth,
  existingClientId = null,
  createdByUserId = null
}) {
  const givenId = safeInt(existingClientId);
  if (givenId) {
    const row = await Client.findById(givenId, { includeSensitive: true });
    if (row && Number(row.agency_id) === Number(agencyId)) {
      return { client: row, matchedBy: 'client_id', created: false };
    }
  }

  const match = await SessionRecordingConsent.findMatchingClient({
    agencyId,
    fullName,
    dateOfBirth
  });
  if (match?.ambiguous) {
    const err = new Error(
      'Multiple clients match that name and date of birth. Select the correct client from the list.'
    );
    err.status = 409;
    throw err;
  }
  if (match?.client) {
    return { client: match.client, matchedBy: 'name_dob', created: false };
  }

  let identifierCode = null;
  try {
    identifierCode = await generateUniqueSixDigitClientCode({ agencyId });
  } catch {
    identifierCode = null;
  }

  const client = await Client.create({
    agency_id: agencyId,
    organization_id: agencyId,
    provider_id: null,
    initials: initialsFromFullName(fullName),
    full_name: String(fullName || '').trim(),
    date_of_birth: String(dateOfBirth || '').slice(0, 10),
    status: 'ACTIVE',
    submission_date: new Date().toISOString().slice(0, 10),
    document_status: 'UPLOADED',
    source: 'SESSION_RECORDING',
    created_by_user_id: createdByUserId || null,
    client_type: 'basic_nonclinical',
    identifier_code: identifierCode || undefined
  });
  await seedClientAffiliations({
    clientId: client.id,
    agencyId,
    organizationId: agencyId
  });
  return { client, matchedBy: 'created', created: true };
}

async function attachConsentPdfToClientFile({
  clientId,
  agencyId,
  signedPdfPath,
  uploadedByUserId,
  documentTitle = 'Audio Recording Consent'
}) {
  const storagePath = String(signedPdfPath || '').trim();
  if (!clientId || !storagePath) return { ok: false, reason: 'missing_inputs' };
  return attachSignedPdfToClient({
    clientId,
    storagePath,
    originalName: 'audio-recording-consent.pdf',
    documentTitle,
    documentType: 'audio_recording_consent',
    mimeType: 'application/pdf',
    uploadedByUserId: uploadedByUserId || null,
    agencyIdOverride: agencyId,
    schoolOrganizationIdOverride: agencyId,
    callerLabel: 'session_recording_consent',
    auditMetadata: { source: 'session_recording' }
  });
}

function parseFlags(raw) {
  if (!raw) return {};
  if (typeof raw === 'object') return raw || {};
  if (typeof raw === 'string') {
    try {
      return JSON.parse(raw) || {};
    } catch {
      return {};
    }
  }
  return {};
}

async function requireUserHasAgencyAccess(req, res, agencyId) {
  const roleNorm = String(req.user?.role || '').toLowerCase();
  if (roleNorm === 'super_admin') return true;
  const userId = req.user?.id;
  if (!userId) {
    res.status(401).json({ error: { message: 'Not authenticated' } });
    return false;
  }
  const agencies = await User.getAgencies(userId);
  const ids = (agencies || []).map((a) => Number(a?.id)).filter((n) => Number.isFinite(n));
  if (!ids.includes(Number(agencyId))) {
    res.status(403).json({ error: { message: 'You do not have access to this organization' } });
    return false;
  }
  return true;
}

async function requireSessionRecordingAccess(req, res, agencyId) {
  if (!(await requireUserHasAgencyAccess(req, res, agencyId))) return false;
  try {
    const agency = await Agency.findById(agencyId);
    const flags = parseFlags(agency?.feature_flags);
    if (!isTruthyFeatureFlag(flags?.[SESSION_RECORDING_FEATURE_FLAG])) {
      res.status(403).json({ error: { message: 'Session Recording is not enabled for this organization' } });
      return false;
    }
  } catch {
    res.status(403).json({ error: { message: 'Session Recording is not enabled for this organization' } });
    return false;
  }

  const role = String(req.user?.role || '').toLowerCase();
  if (!canUseSessionRecordingRole({ role, agencyId })) {
    res.status(403).json({ error: { message: 'Your role cannot use Session Recording for this organization' } });
    return false;
  }

  // Super admins bypass per-user seat check; others need an entitlement (or launch auto-seat).
  if (role !== 'super_admin') {
    const seat = await getUserFeatureCurrent(req.user.id, SESSION_RECORDING_FEATURE_KEY);
    if (!seat?.enabled) {
      res.status(403).json({
        error: { message: 'Session Recording is not activated for your account. Ask an admin to entitle you.' }
      });
      return false;
    }
  }
  return true;
}

function sessionSpeakerLabels(sessionKind) {
  const kind = String(sessionKind || '').toLowerCase();
  return kind === 'tutoring'
    ? { providerLabel: 'Tutor', clientLabel: 'Student' }
    : { providerLabel: 'Therapist', clientLabel: 'Client' };
}

function sanitizeRecording(row) {
  if (!row) return null;
  return {
    id: row.id,
    agencyId: row.agency_id,
    createdByUserId: row.created_by_user_id,
    clientId: row.client_id,
    officeEventId: row.office_event_id,
    learningClassSessionId: row.learning_class_session_id,
    sessionKind: row.session_kind,
    status: row.status,
    serviceCode: row.service_code,
    toolId: row.tool_id,
    noteAidId: row.note_aid_id,
    sessionTypeLabel: row.session_type_label,
    modalityLabel: row.modality_label,
    dateOfService: row.date_of_service,
    startedAt: row.started_at,
    endedAt: row.ended_at,
    durationSeconds: row.duration_seconds,
    autoTranscribe: !!row.auto_transcribe,
    speakerIdentification: !!row.speaker_identification,
    generateStructuredNote: !!row.generate_structured_note,
    highlightInterventions: !!row.highlight_interventions,
    transcriptText: maybeDecryptNotePayload(row.transcript_text),
    summaryText: maybeDecryptNotePayload(row.summary_text),
    topics: row.topics_json || [],
    techniques: row.techniques_json || [],
    markers: row.markers_json || [],
    options: row.options_json || null,
    consentId: row.consent_id,
    errorMessage: row.error_message,
    createdAt: row.created_at,
    updatedAt: row.updated_at
  };
}

function sanitizeNote(row) {
  if (!row) return null;
  let output = null;
  const decrypted = maybeDecryptNotePayload(row.output_json);
  try {
    output = decrypted ? JSON.parse(decrypted) : null;
  } catch {
    output = { text: decrypted };
  }
  return {
    id: row.id,
    sessionRecordingId: row.session_recording_id,
    agencyId: row.agency_id,
    toolId: row.tool_id,
    serviceCode: row.service_code,
    noteAidId: row.note_aid_id,
    output,
    createdAt: row.created_at,
    sessionKind: row.session_kind,
    clientId: row.client_id,
    dateOfService: row.date_of_service
  };
}

export const getSessionRecordingContext = async (req, res, next) => {
  try {
    const agencyId = safeInt(req.query?.agencyId);
    if (!agencyId) return res.status(400).json({ error: { message: 'agencyId is required' } });
    if (!(await requireSessionRecordingAccess(req, res, agencyId))) return;

    const templates = await DocumentTemplate.findByAgency(agencyId);
    const audioAgreementTemplates = (Array.isArray(templates) ? templates : []).filter(
      (t) => String(t.document_type || '').toLowerCase() === 'audio_recording_consent' && t.is_active
    );

    res.json({
      agencyId,
      noteAids: SESSION_RECORDING_NOTE_AIDS,
      audioAgreementTemplates: audioAgreementTemplates.map((t) => ({
        id: t.id,
        name: t.name
      })),
      isTutoringTenant: Number(agencyId) === NLU_AGENCY_ID
    });
  } catch (e) {
    next(e);
  }
};

export const listClientsForRecording = async (req, res, next) => {
  try {
    const agencyId = safeInt(req.query?.agencyId);
    const q = String(req.query?.q || '').trim();
    if (!agencyId) return res.status(400).json({ error: { message: 'agencyId is required' } });
    if (!(await requireSessionRecordingAccess(req, res, agencyId))) return;

    const clients = await Client.findByAgencyId(agencyId, { limit: 50, search: q || undefined });
    const rows = Array.isArray(clients) ? clients : clients?.rows || [];
    res.json({
      clients: rows.slice(0, 50).map((c) => ({
        id: c.id,
        fullName: c.full_name || c.initials || `Client ${c.id}`,
        initials: c.initials,
        dateOfBirth: c.date_of_birth || null
      }))
    });
  } catch (e) {
    next(e);
  }
};

export const createRecording = async (req, res, next) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ error: { message: 'Validation failed', errors: errors.array() } });
    }
    const agencyId = safeInt(req.body?.agencyId);
    if (!agencyId) return res.status(400).json({ error: { message: 'agencyId is required' } });
    if (!(await requireSessionRecordingAccess(req, res, agencyId))) return;

    let sessionKind = String(req.body?.sessionKind || 'standalone').toLowerCase();
    if (!['tutoring', 'clinical', 'standalone'].includes(sessionKind)) sessionKind = 'standalone';
    if (Number(agencyId) === NLU_AGENCY_ID && sessionKind === 'standalone') {
      sessionKind = 'tutoring';
    }

    const serviceCode = req.body?.serviceCode ? String(req.body.serviceCode).trim().toUpperCase() : null;
    const noteAidId = req.body?.noteAidId ? String(req.body.noteAidId).trim() : null;
    const aid = resolveSessionRecordingNoteAid({ serviceCode, noteAidId });
    const generateStructuredNote =
      sessionKind === 'tutoring'
        ? false
        : req.body?.generateStructuredNote !== false && !!aid;

    const recording = await SessionRecording.create({
      agencyId,
      createdByUserId: req.user.id,
      clientId: safeInt(req.body?.clientId),
      officeEventId: safeInt(req.body?.officeEventId),
      learningClassSessionId: safeInt(req.body?.learningClassSessionId),
      sessionKind,
      status: 'setup',
      serviceCode: serviceCode || aid?.serviceCode || null,
      toolId: aid?.toolId || null,
      noteAidId: aid?.id || noteAidId || null,
      sessionTypeLabel: req.body?.sessionTypeLabel || null,
      modalityLabel: req.body?.modalityLabel || null,
      dateOfService: req.body?.dateOfService || null,
      autoTranscribe: false,
      speakerIdentification: true,
      generateStructuredNote,
      highlightInterventions: req.body?.highlightInterventions !== false,
      consentId: safeInt(req.body?.consentId),
      optionsJson: req.body?.sessionFocus ? { sessionFocus: req.body.sessionFocus } : null
    });

    res.status(201).json({ recording: sanitizeRecording(recording) });
  } catch (e) {
    next(e);
  }
};

export const getRecording = async (req, res, next) => {
  try {
    const id = safeInt(req.params?.id);
    const agencyId = safeInt(req.query?.agencyId);
    if (!id || !agencyId) return res.status(400).json({ error: { message: 'id and agencyId are required' } });
    if (!(await requireSessionRecordingAccess(req, res, agencyId))) return;
    const row = await SessionRecording.findByIdForUser({ id, userId: req.user.id, agencyId });
    if (!row) return res.status(404).json({ error: { message: 'Recording not found' } });
    const notes = await SessionRecordingNote.listForRecording({
      sessionRecordingId: id,
      userId: req.user.id
    });
    res.json({ recording: sanitizeRecording(row), notes: notes.map(sanitizeNote) });
  } catch (e) {
    next(e);
  }
};

export const listRecordings = async (req, res, next) => {
  try {
    const agencyId = safeInt(req.query?.agencyId);
    if (!agencyId) return res.status(400).json({ error: { message: 'agencyId is required' } });
    if (!(await requireSessionRecordingAccess(req, res, agencyId))) return;
    const rows = await SessionRecording.listForUser({
      userId: req.user.id,
      agencyId,
      limit: safeInt(req.query?.limit) || 40
    });
    const shelfNotes = await SessionRecordingNote.listRecentForUser({
      userId: req.user.id,
      agencyId
    });
    res.json({
      recordings: rows.map(sanitizeRecording),
      notes: shelfNotes.map(sanitizeNote)
    });
  } catch (e) {
    next(e);
  }
};

export const patchRecording = async (req, res, next) => {
  try {
    const id = safeInt(req.params?.id);
    const agencyId = safeInt(req.body?.agencyId);
    if (!id || !agencyId) return res.status(400).json({ error: { message: 'id and agencyId are required' } });
    if (!(await requireSessionRecordingAccess(req, res, agencyId))) return;
    const existing = await SessionRecording.findByIdForUser({ id, userId: req.user.id, agencyId });
    if (!existing) return res.status(404).json({ error: { message: 'Recording not found' } });

    const patch = {};
    for (const key of [
      'clientId',
      'officeEventId',
      'learningClassSessionId',
      'sessionKind',
      'status',
      'serviceCode',
      'toolId',
      'noteAidId',
      'sessionTypeLabel',
      'modalityLabel',
      'dateOfService',
      'autoTranscribe',
      'speakerIdentification',
      'generateStructuredNote',
      'highlightInterventions',
      'markersJson',
      'consentId'
    ]) {
      if (req.body?.[key] !== undefined) patch[key] = req.body[key];
    }
    if (req.body?.transcriptText !== undefined) {
      patch.transcriptText = maybeEncryptNotePayload(String(req.body.transcriptText || ''));
    }
    if (req.body?.markers !== undefined) patch.markersJson = req.body.markers;

    const updated = await SessionRecording.update(id, patch);
    res.json({ recording: sanitizeRecording(updated) });
  } catch (e) {
    next(e);
  }
};

export const appendTranscript = async (req, res, next) => {
  try {
    const id = safeInt(req.params?.id);
    const agencyId = safeInt(req.body?.agencyId);
    if (!id || !agencyId) return res.status(400).json({ error: { message: 'id and agencyId are required' } });
    if (!(await requireSessionRecordingAccess(req, res, agencyId))) return;
    const existing = await SessionRecording.findByIdForUser({ id, userId: req.user.id, agencyId });
    if (!existing) return res.status(404).json({ error: { message: 'Recording not found' } });

    const chunk = String(req.body?.chunk || '').trim();
    const speakerLabel = String(req.body?.speakerLabel || '').trim();
    if (!chunk) return res.status(400).json({ error: { message: 'chunk is required' } });

    const prior = maybeDecryptNotePayload(existing.transcript_text) || '';
    const stamped = speakerLabel ? `[${speakerLabel}] ${chunk}` : chunk;
    const next = `${prior}${prior ? '\n' : ''}${stamped}`.slice(0, 200000);
    const updated = await SessionRecording.update(id, {
      transcriptText: maybeEncryptNotePayload(next),
      status: existing.status === 'setup' ? 'recording' : existing.status
    });
    res.json({ recording: sanitizeRecording(updated) });
  } catch (e) {
    next(e);
  }
};

export const startRecording = async (req, res, next) => {
  try {
    const id = safeInt(req.params?.id);
    const agencyId = safeInt(req.body?.agencyId);
    if (!id || !agencyId) return res.status(400).json({ error: { message: 'id and agencyId are required' } });
    if (!(await requireSessionRecordingAccess(req, res, agencyId))) return;
    const existing = await SessionRecording.findByIdForUser({ id, userId: req.user.id, agencyId });
    if (!existing) return res.status(404).json({ error: { message: 'Recording not found' } });
    const updated = await SessionRecording.update(id, {
      status: 'recording',
      startedAt: existing.started_at || new Date()
    });
    res.json({ recording: sanitizeRecording(updated) });
  } catch (e) {
    next(e);
  }
};

export const transcribeRecordingAudio = async (req, res, next) => {
  try {
    const id = safeInt(req.params?.id);
    const agencyId = safeInt(req.body?.agencyId);
    if (!id || !agencyId) return res.status(400).json({ error: { message: 'id and agencyId are required' } });
    if (!(await requireSessionRecordingAccess(req, res, agencyId))) return;
    const existing = await SessionRecording.findByIdForUser({ id, userId: req.user.id, agencyId });
    if (!existing) return res.status(404).json({ error: { message: 'Recording not found' } });
    if (!req.file?.buffer) return res.status(400).json({ error: { message: 'audio file is required' } });

    const transcript = await transcribeLongAudio({
      buffer: req.file.buffer,
      mimeType: req.file.mimetype,
      languageCode: 'en-US',
      userId: req.user.id,
      enableSpeakerDiarization: true,
      diarizationSpeakerCount: 2
    });

    const prior = maybeDecryptNotePayload(existing.transcript_text) || '';
    const merged = prior
      ? `${prior}\n\n--- Server transcription ---\n${transcript}`
      : String(transcript || '');
    const updated = await SessionRecording.update(id, {
      transcriptText: maybeEncryptNotePayload(merged.slice(0, 200000))
    });

    // Audio buffer is discarded with the request; never persisted.
    res.json({
      transcriptText: String(transcript || ''),
      recording: sanitizeRecording(updated)
    });
  } catch (e) {
    next(e);
  }
};

export const endAndSummarizeRecording = async (req, res, next) => {
  try {
    const id = safeInt(req.params?.id);
    const agencyId = safeInt(req.body?.agencyId);
    if (!id || !agencyId) return res.status(400).json({ error: { message: 'id and agencyId are required' } });
    if (!(await requireSessionRecordingAccess(req, res, agencyId))) return;
    const existing = await SessionRecording.findByIdForUser({ id, userId: req.user.id, agencyId });
    if (!existing) return res.status(404).json({ error: { message: 'Recording not found' } });

    await SessionRecording.update(id, { status: 'processing' });

    const labels = sessionSpeakerLabels(existing.session_kind);
    if (!req.file?.buffer) {
      await SessionRecording.update(id, { status: 'recording', errorMessage: 'No audio uploaded' });
      return res.status(400).json({ error: { message: 'Session audio is required to transcribe and summarize' } });
    }

    let transcript = '';
    let transcriptSource = 'diarized';
    try {
      const stt = await transcribeLongAudio({
        buffer: req.file.buffer,
        mimeType: req.file.mimetype,
        languageCode: 'en-US',
        userId: req.user.id,
        enableSpeakerDiarization: true,
        diarizationSpeakerCount: 2
      });
      transcript = String(stt || '').trim();
    } catch (e) {
      await SessionRecording.update(id, {
        status: 'recording',
        errorMessage: e?.message || 'Transcription failed'
      });
      return res.status(502).json({ error: { message: 'Audio transcription failed', details: e?.message } });
    }

    if (!transcript) {
      await SessionRecording.update(id, { status: 'recording', errorMessage: 'No transcript available' });
      return res.status(400).json({ error: { message: 'No transcript available to summarize' } });
    }

    const kind = String(existing.session_kind || 'standalone');
    const summary = await summarizeSessionRecording({
      transcriptText: transcript,
      sessionKind: kind,
      providerLabel: labels.providerLabel,
      clientLabel: labels.clientLabel
    });

    const started = existing.started_at ? new Date(existing.started_at) : null;
    const ended = new Date();
    const durationSeconds = started
      ? Math.max(0, Math.round((ended.getTime() - started.getTime()) / 1000))
      : safeInt(req.body?.durationSeconds);

    let updated = await SessionRecording.update(id, {
      status: 'completed',
      endedAt: ended,
      durationSeconds,
      transcriptText: maybeEncryptNotePayload(transcript),
      summaryText: maybeEncryptNotePayload(summary.narrative || summary.rawText || ''),
      topicsJson: summary.topics,
      techniquesJson: summary.techniques,
      markersJson: summary.keyMoments,
      errorMessage: null
    });

    let note = null;
    if (existing.generate_structured_note && existing.tool_id) {
      const generated = await generateStructuredNoteFromSummary({
        toolId: existing.tool_id,
        summaryNarrative: summary.narrative,
        transcriptText: transcript,
        topics: summary.topics,
        techniques: summary.techniques
      });
      const outputPayload = JSON.stringify({
        text: generated.noteText,
        modelName: generated.modelName,
        topics: summary.topics,
        techniques: summary.techniques
      });
      note = await SessionRecordingNote.create({
        sessionRecordingId: id,
        agencyId,
        createdByUserId: req.user.id,
        toolId: existing.tool_id,
        serviceCode: existing.service_code,
        noteAidId: existing.note_aid_id,
        outputJson: maybeEncryptNotePayload(outputPayload)
      });
    }

    // Tutoring: persist summary onto learning class session when linked
    if (kind === 'tutoring' && existing.learning_class_session_id) {
      try {
        await LearningClassSession.updateWithJson(existing.learning_class_session_id, {
          aiSummaryJson: {
            narrative: summary.narrative,
            topics: summary.topics,
            techniques: summary.techniques,
            keyMoments: summary.keyMoments,
            source: 'session_recording',
            sessionRecordingId: id,
            generatedAt: new Date().toISOString()
          },
          transcriptText: transcript.slice(0, 50000)
        });
      } catch (e) {
        console.warn('[sessionRecording] failed to write learning session summary', e?.message);
      }
    }

    updated = await SessionRecording.findById(id);
    res.json({
      recording: sanitizeRecording(updated),
      transcriptSource,
      summary: {
        narrative: summary.narrative,
        topics: summary.topics,
        techniques: summary.techniques,
        keyMoments: summary.keyMoments,
        speakerNotes: summary.speakerNotes || null
      },
      note: note ? sanitizeNote(note) : null
    });
  } catch (e) {
    next(e);
  }
};

export const checkConsentOnFile = async (req, res, next) => {
  try {
    const agencyId = safeInt(req.query?.agencyId || req.body?.agencyId);
    if (!agencyId) return res.status(400).json({ error: { message: 'agencyId is required' } });
    if (!(await requireSessionRecordingAccess(req, res, agencyId))) return;
    const consent = await SessionRecordingConsent.findOnFile({
      agencyId,
      clientId: safeInt(req.query?.clientId || req.body?.clientId),
      signerFullName: req.query?.fullName || req.body?.fullName,
      signerDob: req.query?.dateOfBirth || req.body?.dateOfBirth
    });
    res.json({
      onFile: !!consent,
      consent: consent || null,
      clientId: consent?.client_id || safeInt(req.query?.clientId) || null
    });
  } catch (e) {
    next(e);
  }
};

export const matchClientByNameDob = async (req, res, next) => {
  try {
    const agencyId = safeInt(req.body?.agencyId);
    const fullName = String(req.body?.fullName || '').trim();
    const dateOfBirth = String(req.body?.dateOfBirth || '').trim();
    if (!agencyId || !fullName || !dateOfBirth) {
      return res.status(400).json({ error: { message: 'agencyId, fullName, and dateOfBirth are required' } });
    }
    if (!(await requireSessionRecordingAccess(req, res, agencyId))) return;
    const match = await SessionRecordingConsent.findMatchingClient({ agencyId, fullName, dateOfBirth });
    res.json({ match });
  } catch (e) {
    next(e);
  }
};

export const createConsentSigning = async (req, res, next) => {
  try {
    const agencyId = safeInt(req.body?.agencyId);
    const templateId = safeInt(req.body?.templateId);
    const fullName = String(req.body?.fullName || '').trim();
    const dateOfBirth = String(req.body?.dateOfBirth || '').trim();
    if (!agencyId || !templateId || !fullName || !dateOfBirth) {
      return res.status(400).json({
        error: { message: 'agencyId, templateId, fullName, and dateOfBirth are required' }
      });
    }
    if (!(await requireSessionRecordingAccess(req, res, agencyId))) return;

    const existing = await SessionRecordingConsent.findOnFile({
      agencyId,
      clientId: safeInt(req.body?.clientId),
      signerFullName: fullName,
      signerDob: dateOfBirth
    });
    if (existing?.signed_at) {
      let clientId = safeInt(existing.client_id) || safeInt(req.body?.clientId);
      let createdClient = false;
      let matchedBy = existing.matched_by || (clientId ? 'client_id' : 'name_dob');
      if (!clientId) {
        const ensured = await ensureClientForRecordingConsent({
          agencyId,
          fullName,
          dateOfBirth,
          createdByUserId: req.user.id
        });
        clientId = Number(ensured.client.id);
        matchedBy = ensured.matchedBy;
        createdClient = !!ensured.created;
        if (existing.id) {
          await SessionRecordingConsent.update(existing.id, { clientId, matchedBy });
        }
      }
      if (clientId && existing.id) {
        try {
          const pool = (await import('../config/database.js')).default;
          const [docRows] = await pool.execute(
            `SELECT sd.signed_pdf_path
             FROM session_recording_consents c
             LEFT JOIN signed_documents sd ON sd.id = c.signed_document_id
             WHERE c.id = ? LIMIT 1`,
            [existing.id]
          );
          const signedPdfPath = docRows?.[0]?.signed_pdf_path || null;
          if (signedPdfPath) {
            await attachConsentPdfToClientFile({
              clientId,
              agencyId,
              signedPdfPath,
              uploadedByUserId: req.user.id
            });
          }
        } catch {
          // consent is already on file; attaching a copy is best-effort
        }
      }
      return res.json({
        onFile: true,
        consent: { ...existing, client_id: clientId },
        taskId: existing.task_id || null,
        matchedClientId: clientId || null,
        matchedBy,
        createdClient
      });
    }

    const template = await DocumentTemplate.findById(templateId);
    if (!template || Number(template.agency_id) !== agencyId) {
      return res.status(404).json({ error: { message: 'Consent template not found' } });
    }
    if (String(template.document_type || '').toLowerCase() !== 'audio_recording_consent') {
      return res.status(400).json({ error: { message: 'Template must be audio_recording_consent' } });
    }

    let clientId = safeInt(req.body?.clientId);
    let matchedBy = clientId ? 'client_id' : 'none';
    let createdClient = false;
    const ensured = await ensureClientForRecordingConsent({
      agencyId,
      fullName,
      dateOfBirth,
      existingClientId: clientId,
      createdByUserId: req.user.id
    });
    if (!ensured?.client?.id) {
      return res.status(500).json({ error: { message: 'Could not match or create a client for this consent.' } });
    }
    clientId = Number(ensured.client.id);
    matchedBy = ensured.matchedBy || matchedBy;
    createdClient = !!ensured.created;

    let assignedToUserId = req.user.id;
    if (clientId) {
      try {
        const ClientGuardian = (await import('../models/ClientGuardian.model.js')).default;
        const guardians = await ClientGuardian.listForClient(clientId);
        const selfGuardian = (guardians || []).find(
          (g) => String(g.relationship_type || '').toLowerCase() === 'self'
        );
        const primary = selfGuardian || (guardians || [])[0];
        if (primary?.guardian_user_id) assignedToUserId = primary.guardian_user_id;
      } catch {
        // keep provider as assignee
      }
    }

    const task = await TaskAssignmentService.assignDocumentTask({
      title: `Audio recording consent — ${fullName}`,
      description: 'Created by Session Recording consent workflow.',
      documentTemplateId: templateId,
      assignedByUserId: req.user.id,
      assignedToUserId,
      assignedToAgencyId: agencyId,
      documentActionType: template.document_action_type || 'signature'
    });

    await TaskAuditLog.logAction({
      taskId: task.id,
      actionType: 'assigned',
      actorUserId: req.user.id,
      targetUserId: assignedToUserId,
      metadata: {
        source: 'session_recording_consent',
        clientId: clientId || undefined,
        matchedBy
      }
    });

    const consent = await SessionRecordingConsent.create({
      agencyId,
      clientId,
      sessionRecordingId: safeInt(req.body?.sessionRecordingId),
      signerFullName: fullName,
      signerDob: dateOfBirth,
      matchedBy,
      documentTemplateId: templateId,
      taskId: task.id,
      createdByUserId: req.user.id
    });

    if (safeInt(req.body?.sessionRecordingId)) {
      await SessionRecording.update(req.body.sessionRecordingId, { consentId: consent.id });
    }

    res.status(201).json({
      onFile: false,
      consent,
      taskId: task.id,
      matchedClientId: clientId || null,
      matchedBy,
      createdClient
    });
  } catch (e) {
    if (e?.status) {
      return res.status(e.status).json({ error: { message: e.message } });
    }
    next(e);
  }
};

export const finalizeConsent = async (req, res, next) => {
  try {
    const consentId = safeInt(req.params?.consentId || req.body?.consentId);
    const agencyId = safeInt(req.body?.agencyId);
    if (!consentId || !agencyId) {
      return res.status(400).json({ error: { message: 'consentId and agencyId are required' } });
    }
    if (!(await requireSessionRecordingAccess(req, res, agencyId))) return;
    const consent = await SessionRecordingConsent.findById(consentId);
    if (!consent || Number(consent.agency_id) !== agencyId) {
      return res.status(404).json({ error: { message: 'Consent not found' } });
    }

    let signedDocumentId = safeInt(req.body?.signedDocumentId);
    let signedPdfPath = null;
    if (!signedDocumentId && consent.task_id) {
      const pool = (await import('../config/database.js')).default;
      const [rows] = await pool.execute(
        `SELECT id, signed_pdf_path FROM signed_documents WHERE task_id = ? ORDER BY id DESC LIMIT 1`,
        [consent.task_id]
      );
      if (rows?.[0]?.signed_pdf_path) {
        signedDocumentId = rows[0].id;
        signedPdfPath = rows[0].signed_pdf_path;
      }
    } else if (signedDocumentId) {
      const pool = (await import('../config/database.js')).default;
      const [rows] = await pool.execute(
        `SELECT signed_pdf_path FROM signed_documents WHERE id = ? LIMIT 1`,
        [signedDocumentId]
      );
      signedPdfPath = rows?.[0]?.signed_pdf_path || null;
    }
    if (!signedDocumentId) {
      return res.status(400).json({ error: { message: 'Consent is not finalized yet' } });
    }

    let clientId = safeInt(consent.client_id);
    let matchedBy = consent.matched_by || 'none';
    if (!clientId && consent.signer_full_name && consent.signer_dob) {
      const ensured = await ensureClientForRecordingConsent({
        agencyId,
        fullName: consent.signer_full_name,
        dateOfBirth: consent.signer_dob,
        createdByUserId: req.user.id
      });
      if (ensured?.client?.id) {
        clientId = Number(ensured.client.id);
        matchedBy = ensured.matchedBy || 'created';
      }
    }

    const updated = await SessionRecordingConsent.update(consentId, {
      signedDocumentId,
      signedAt: new Date(),
      clientId: clientId || undefined,
      matchedBy
    });

    if (clientId && signedPdfPath) {
      await attachConsentPdfToClientFile({
        clientId,
        agencyId,
        signedPdfPath,
        uploadedByUserId: req.user.id,
        documentTitle: 'Audio Recording Consent'
      });
    }

    if (clientId && safeInt(consent.session_recording_id)) {
      await SessionRecording.update(consent.session_recording_id, { clientId, consentId });
    }

    res.json({ consent: updated, clientId: clientId || null });
  } catch (e) {
    if (e?.status) {
      return res.status(e.status).json({ error: { message: e.message } });
    }
    next(e);
  }
};

export const sessionRecordingUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 300 * 1024 * 1024 }
});
