import pool from '../config/database.js';
import multer from 'multer';
import LearningClassSession from '../models/LearningClassSession.model.js';
import tutoringTranscriptSummary from '../services/tutoringTranscriptSummary.service.js';
import LearningProgress from '../models/LearningProgress.model.js';
import { runAgentAssist } from '../services/agents/agentRuntime.service.js';
import { createOrGetRoomByUniqueName, createAccessTokenAsync, isVideoConfigured } from '../services/video.service.js';
import StripePaymentsService, { isStripeConfigured } from '../services/stripePayments.service.js';
import BillingMerchantContextService from '../services/billingMerchantContext.service.js';
import {
  buildInPersonMaterialDownload,
  buildInPersonTranscriptSummaryText,
  createInPersonMaterial,
  deleteInPersonMaterial,
  duplicateInPersonPlanFromSession,
  getInPersonMaterialFile,
  getInPersonMaterialResponse,
  getInPersonPlanPayload,
  upsertInPersonMaterialResponse,
  updateInPersonMaterial,
  upsertInPersonPlan
} from '../services/inPersonTutoring.service.js';
import {
  assertLearningClassAccess,
  assertLearningSessionAccess,
  canWriteEvidenceForClass,
  listClassParticipantClientIds,
  logClassSessionTelemetry
} from '../utils/learningClassAccess.js';

const asInt = (v) => {
  const n = Number.parseInt(v, 10);
  return Number.isInteger(n) ? n : null;
};

const asBool = (v) => v === true || v === 1 || v === '1' || String(v || '').toLowerCase() === 'true';

const inPersonMaterialStorage = multer.memoryStorage();

export const inPersonMaterialUpload = multer({
  storage: inPersonMaterialStorage,
  limits: { fileSize: 15 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    if (!file) return cb(null, true);
    if (String(file.mimetype || '').toLowerCase() === 'application/pdf') return cb(null, true);
    cb(new Error('Only PDF uploads are supported for in-person tutoring materials'));
  }
});

function defaultRoleCapabilities(role) {
  const r = String(role || 'participant').toLowerCase();
  if (r === 'presenter' || r === 'co_presenter' || r === 'proctor') {
    return {
      canUnmuteParticipants: true,
      canEnableParticipantVideo: true,
      canManageSlides: true,
      canManagePolls: true
    };
  }
  return {
    canUnmuteParticipants: false,
    canEnableParticipantVideo: false,
    canManageSlides: false,
    canManagePolls: false
  };
}

function pickPreferredSession(sessions = []) {
  const rows = Array.isArray(sessions) ? sessions : [];
  const live = rows.find((s) => String(s.status || '').toLowerCase() === 'live');
  if (live) return live;
  const scheduled = rows.find((s) => String(s.status || '').toLowerCase() === 'scheduled');
  if (scheduled) return scheduled;
  return rows[0] || null;
}

function normalizeDeliveryContext(raw) {
  return String(raw || '').trim().toLowerCase() === 'in_person' ? 'in_person' : null;
}

function parseObjectMaybe(raw, fallback = {}) {
  if (!raw) return fallback;
  if (typeof raw === 'object' && !Array.isArray(raw)) return raw;
  try {
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed : fallback;
  } catch {
    return fallback;
  }
}

function enrichInPersonMaterial(sessionId, material) {
  const hasFile = !!material?.storagePath;
  const hasFillablePdf = hasFile && Array.isArray(material?.config?.fieldDefinitions);
  return {
    ...material,
    hasFile,
    hasFillablePdf,
    fileUrl: hasFile ? `/api/learning-class-sessions/sessions/${sessionId}/in-person-materials/${material.id}/file` : null,
    downloadUrl: hasFile ? `/api/learning-class-sessions/sessions/${sessionId}/in-person-materials/${material.id}/download` : null
  };
}

function enrichInPersonPayload(payload) {
  if (!payload) return null;
  return {
    ...payload,
    materials: Array.isArray(payload.materials)
      ? payload.materials.map((material) => enrichInPersonMaterial(payload.session?.id, material))
      : []
  };
}

function sanitizeInPersonPayloadForViewer(payload, { canModerate = false } = {}) {
  if (!payload) return null;
  const shareWhiteboard = !!payload?.plan?.shareWhiteboardWithGuardian;
  if (canModerate || shareWhiteboard) return payload;
  return {
    ...payload,
    plan: {
      ...(payload.plan || {}),
      whiteboardData: { strokes: [] },
      shareWhiteboardWithGuardian: false
    }
  };
}

export const getPublicClassJoinInfo = async (req, res, next) => {
  try {
    const classId = asInt(req.params.classId);
    if (!classId) return res.status(400).json({ error: { message: 'Invalid classId' } });

    const [rows] = await pool.execute(
      `SELECT c.id, c.delivery_mode, c.status, c.is_active, c.registration_eligible, c.organization_id,
              a.slug AS organization_slug
       FROM learning_program_classes c
       JOIN agencies a ON a.id = c.organization_id AND a.is_active = TRUE
       WHERE c.id = ?
       LIMIT 1`,
      [classId]
    );
    const klass = rows?.[0];
    if (!klass) return res.status(404).json({ error: { message: 'Class not found' } });
    if (!(klass.is_active === 1 || klass.is_active === true) || String(klass.status || '').toLowerCase() === 'archived') {
      return res.status(404).json({ error: { message: 'Class not available' } });
    }

    const sessions = await LearningClassSession.listByClassId(classId);
    const preferredSession = pickPreferredSession(sessions);
    res.json({
      classId: Number(klass.id),
      organizationId: Number(klass.organization_id),
      organizationSlug: String(klass.organization_slug || '').trim().toLowerCase() || null,
      mode: String(klass.delivery_mode || 'group').toLowerCase() === 'individual' ? 'individual' : 'group',
      preferredSessionId: preferredSession ? Number(preferredSession.id) : null,
      preferredSessionStatus: preferredSession?.status || null
    });
  } catch (e) {
    next(e);
  }
};

export const resolveAuthenticatedClassJoin = async (req, res, next) => {
  try {
    const classId = asInt(req.params.classId);
    const { klass } = await assertLearningClassAccess(req, classId);
    const sessions = await LearningClassSession.listByClassId(classId);
    const preferredSession = pickPreferredSession(sessions);
    const mode = String(klass.delivery_mode || 'group').toLowerCase() === 'individual' ? 'individual' : 'group';
    const organizationSlug = String(klass.organization_slug || '').trim().toLowerCase() || null;
    const joinPath = organizationSlug
      ? `/${organizationSlug}/${mode === 'group' ? 'learning/classes' : 'challenges'}/${klass.id}`
      : `/${mode === 'group' ? 'learning/classes' : 'challenges'}/${klass.id}`;
    res.json({
      classId: Number(klass.id),
      mode,
      organizationSlug,
      preferredSessionId: preferredSession ? Number(preferredSession.id) : null,
      preferredSessionStatus: preferredSession?.status || null,
      joinPath
    });
  } catch (e) {
    next(e);
  }
};

export const listClassSessions = async (req, res, next) => {
  try {
    const classId = asInt(req.params.classId);
    const { klass } = await assertLearningClassAccess(req, classId);
    const sessions = await LearningClassSession.listByClassId(classId);
    res.json({ class: klass, sessions });
  } catch (e) {
    next(e);
  }
};

export const createClassSession = async (req, res, next) => {
  try {
    const classId = asInt(req.params.classId);
    const { canManage } = await assertLearningClassAccess(req, classId);
    if (!canManage) return res.status(403).json({ error: { message: 'Manage access required' } });
    const title = String(req.body?.title || '').trim();
    if (!title) return res.status(400).json({ error: { message: 'title is required' } });
    const mode = String(req.body?.mode || 'group').toLowerCase() === 'individual' ? 'individual' : 'group';
    const session = await LearningClassSession.create({
      classId,
      title,
      description: req.body?.description ? String(req.body.description) : null,
      mode,
      sessionSubtype: req.body?.sessionSubtype ? String(req.body.sessionSubtype) : null,
      deliveryContext: normalizeDeliveryContext(req.body?.deliveryContext),
      startsAt: req.body?.startsAt || null,
      createdByUserId: req.user.id
    });
    await LearningClassSession.ensureDefaultParticipants(session.id, classId);
    await logClassSessionTelemetry({
      sessionId: session.id,
      eventType: 'session_created',
      actorUserId: req.user.id,
      payload: { classId, mode }
    });
    res.status(201).json({ session });
  } catch (e) {
    next(e);
  }
};

export const getClassSession = async (req, res, next) => {
  try {
    const sessionId = asInt(req.params.sessionId);
    const { session, actorRole, canModerate } = await assertLearningSessionAccess(req, sessionId);
    const [roles, slides, state, handRaises] = await Promise.all([
      LearningClassSession.listParticipantRoles(sessionId),
      LearningClassSession.listSlides(sessionId),
      LearningClassSession.getSessionState(sessionId),
      LearningClassSession.listHandRaises(sessionId)
    ]);
    res.json({ session, actorRole, canModerate, roles, slides, state, handRaises });
  } catch (e) {
    next(e);
  }
};

export const startClassSession = async (req, res, next) => {
  try {
    const sessionId = asInt(req.params.sessionId);
    const { session, canModerate } = await assertLearningSessionAccess(req, sessionId);
    if (!canModerate) return res.status(403).json({ error: { message: 'Moderator access required' } });
    if (String(session?.delivery_context || '').toLowerCase() === 'in_person') {
      const updated = await LearningClassSession.update(sessionId, {
        status: 'live',
        startedByUserId: req.user.id,
        deliveryContext: 'in_person'
      });
      await logClassSessionTelemetry({
        sessionId,
        eventType: 'session_started',
        actorUserId: req.user.id,
        payload: { deliveryContext: 'in_person' }
      });
      return res.json({ session: updated });
    }
    if (!isVideoConfigured()) {
      return res.status(503).json({ error: { message: 'Video is not configured' } });
    }
    const roomName = session.twilio_room_unique_name || `learning-class-${session.learning_class_id}-session-${session.id}`;
    const room = await createOrGetRoomByUniqueName(roomName);
    const updated = await LearningClassSession.update(sessionId, {
      status: 'live',
      twilioRoomSid: room?.roomSid || session.twilio_room_sid,
      twilioRoomUniqueName: room?.uniqueName || roomName,
      startedByUserId: req.user.id
    });
    await logClassSessionTelemetry({
      sessionId,
      eventType: 'session_started',
      actorUserId: req.user.id,
      payload: { roomName }
    });
    res.json({ session: updated });
  } catch (e) {
    next(e);
  }
};

// ── Post-session billing (POST_SESSION payment policy) ─────────────────────────────────────────

async function triggerPostSessionCharge(session) {
  if (!isStripeConfigured()) return;
  const agencyId = Number(session?.agency_id || 0);
  const clientId = Number(session?.client_id || 0);
  const sessionId = Number(session?.id || 0);
  if (!agencyId || !clientId) return;

  try {
    // Only charge if the tutor has POST_SESSION policy
    const [profileRows] = await pool.execute(
      `SELECT p.session_rate_cents, p.payment_policy, p.user_id AS provider_user_id
       FROM provider_tutoring_profiles p
       WHERE p.user_id = ? AND p.agency_id = ?
       LIMIT 1`,
      [Number(session.provider_user_id || 0), agencyId]
    );
    const profile = profileRows?.[0];
    if (!profile || String(profile.payment_policy || '').toUpperCase() !== 'POST_SESSION') return;
    const rateCents = Number(profile.session_rate_cents || 0);
    if (!rateCents) return;

    // Find the guardian's auto_charge card for this agency+client
    const [cardRows] = await pool.execute(
      `SELECT gpc.stripe_payment_method_id, gpc.stripe_customer_id
       FROM guardian_payment_cards gpc
       JOIN client_guardians cg ON cg.guardian_user_id = gpc.guardian_user_id
       WHERE cg.client_id = ? AND gpc.agency_id = ? AND gpc.auto_charge = 1
       LIMIT 1`,
      [clientId, agencyId]
    );
    const card = cardRows?.[0];
    if (!card?.stripe_payment_method_id || !card?.stripe_customer_id) return;

    const ctx = await BillingMerchantContextService.getAgencyClientPaymentsContext(agencyId);
    const connectedAccountId = ctx?.stripeConnectedAccountId || null;

    const intent = await StripePaymentsService.chargePaymentMethod({
      customerId: card.stripe_customer_id,
      paymentMethodId: card.stripe_payment_method_id,
      amountCents: rateCents,
      currency: 'usd',
      description: `Tutoring session #${sessionId} — post-session charge`,
      metadata: { agency_id: String(agencyId), client_id: String(clientId), session_id: String(sessionId) },
      connectedAccountId
    });

    await pool.execute(
      `INSERT INTO learning_session_charges
         (agency_id, client_id, learning_class_session_id, total_cents, currency, charge_status, payment_mode, created_by_user_id)
       VALUES (?, ?, ?, ?, 'USD', 'CAPTURED', 'PAY_PER_EVENT', 0)`,
      [agencyId, clientId, sessionId, rateCents]
    );
    const [[chargeRow]] = await pool.execute(
      `SELECT LAST_INSERT_ID() AS id`
    );
    const chargeId = Number(chargeRow?.id || 0);
    if (chargeId) {
      await pool.execute(
        `INSERT INTO learning_payments
           (agency_id, learning_session_charge_id, amount_cents, currency, payment_status, processor, processor_intent_id)
         VALUES (?, ?, ?, 'USD', 'SUCCEEDED', 'STRIPE', ?)`,
        [agencyId, chargeId, rateCents, intent.id]
      );
    }
  } catch (err) {
    // Non-fatal: log but do not disrupt the session-end flow
    console.error('[learningClassSessions] Post-session charge failed:', err?.message);
  }
}

export const endClassSession = async (req, res, next) => {
  try {
    const sessionId = asInt(req.params.sessionId);
    const { session, canModerate } = await assertLearningSessionAccess(req, sessionId);
    if (!canModerate) return res.status(403).json({ error: { message: 'Moderator access required' } });

    // Support optional transcript submission from frontend or Vonage webhook
    let transcriptText = req.body?.transcript || req.body?.transcript_text || null;
    if (!transcriptText && String(session?.delivery_context || '').toLowerCase() === 'in_person') {
      transcriptText = await buildInPersonTranscriptSummaryText(sessionId);
    }
    if (transcriptText) {
      await LearningClassSession.updateWithJson(sessionId, { transcriptText });
    }

    const updated = await LearningClassSession.update(sessionId, {
      status: 'ended',
      endsAt: new Date(),
      endedByUserId: req.user.id
    });

    // If this is a tutoring session, trigger AI transcript analysis for strengths/needs, standards mapping,
    // progress update, and guardian homework generation (non-blocking)
    const freshSession = await LearningClassSession.findById(sessionId);
    if (freshSession?.session_subtype === 'tutoring' || String(freshSession?.mode || '').toLowerCase() === 'individual') {
      setImmediate(() => {
        tutoringTranscriptSummary.triggerTutoringSessionSummary(sessionId)
          .catch(err => console.error('Background tutoring transcript analysis failed:', err));
      });
      // Post-session charge for tutors who use POST_SESSION billing policy
      setImmediate(() => {
        triggerPostSessionCharge(freshSession)
          .catch(err => console.error('Background post-session charge failed:', err));
      });
    }

    await logClassSessionTelemetry({ sessionId, eventType: 'session_ended', actorUserId: req.user.id });
    res.json({ 
      session: updated, 
      message: freshSession?.session_subtype === 'tutoring'
        ? (String(freshSession?.delivery_context || '').toLowerCase() === 'in_person'
            ? 'In-person tutoring session ended. AI is analyzing tutor notes and saved responses for the progress summary and homework.'
            : 'Tutoring session ended. AI analyzing transcript for progress summary, strengths, needs work, and standards alignment. Guardian portal updated with homework.')
        : 'Session ended successfully.' 
    });
  } catch (e) {
    next(e);
  }
};

export const getClassSessionVideoToken = async (req, res, next) => {
  try {
    const sessionId = asInt(req.params.sessionId);
    const { session, actorRole } = await assertLearningSessionAccess(req, sessionId);
    if (String(session?.delivery_context || '').toLowerCase() === 'in_person') {
      return res.status(400).json({ error: { message: 'Video is not used for in-person tutoring sessions' } });
    }
    if (!isVideoConfigured()) {
      return res.status(503).json({ error: { message: 'Video is not configured' } });
    }

    // Support new virtual tutoring sessions using dedicated getVideoToken from model (uses vonage_session_id, creates if needed)
    const isTutoring = session.session_subtype === 'tutoring' || String(session.mode || '').toLowerCase() === 'individual';
    let videoResponse;
    
    if (isTutoring) {
      const isTutor = String(actorRole || '').includes('presenter') || String(actorRole || '').includes('tutor');
      videoResponse = await LearningClassSession.getVideoToken(sessionId, `user-${req.user.id}`, isTutor);
      // Update status if scheduled
      if (String(session.status || '').toLowerCase() === 'scheduled') {
        await LearningClassSession.update(sessionId, { status: 'live' });
      }
    } else {
      // Legacy group class path (Twilio/Vonage hybrid)
      const roomName = session.twilio_room_unique_name || `learning-class-${session.learning_class_id}-session-${session.id}`;
      const room = await createOrGetRoomByUniqueName(roomName);
      if (!room) return res.status(500).json({ error: { message: 'Failed to provision room' } });
      if (!session.twilio_room_sid || !session.twilio_room_unique_name || String(session.status || '').toLowerCase() === 'scheduled') {
        await LearningClassSession.update(sessionId, {
          status: String(session.status || '').toLowerCase() === 'scheduled' ? 'live' : session.status,
          twilioRoomSid: room.roomSid,
          twilioRoomUniqueName: room.uniqueName
        });
      }
      const token = await createAccessTokenAsync({
        identity: `user-${req.user.id}`,
        roomName: room.uniqueName
      });
      if (!token) return res.status(500).json({ error: { message: 'Failed to generate access token' } });
      videoResponse = {
        token,
        roomName: room.uniqueName,
        roomSid: room.roomSid,
        actorRole: String(actorRole || 'participant')
      };
    }

    const roleNorm = String(actorRole || 'participant');
    const participantDefaults = roleNorm === 'participant' || roleNorm === 'subscriber'
      ? { cameraOn: false, micOn: false }
      : { cameraOn: true, micOn: true };

    await LearningClassSession.markParticipantJoined(sessionId, req.user.id);
    
    res.json({
      ...videoResponse,
      actorRole: roleNorm,
      participantDefaults,
      isTutoringSession: isTutoring,
      message: isTutoring ? 'Vonage video session ready for virtual tutoring' : 'Video session ready'
    });
  } catch (e) {
    next(e);
  }
};

export const listSessionRoles = async (req, res, next) => {
  try {
    const sessionId = asInt(req.params.sessionId);
    const { canModerate } = await assertLearningSessionAccess(req, sessionId);
    if (!canModerate) return res.status(403).json({ error: { message: 'Moderator access required' } });
    const roles = await LearningClassSession.listParticipantRoles(sessionId);
    res.json({ roles });
  } catch (e) {
    next(e);
  }
};

export const upsertSessionRole = async (req, res, next) => {
  try {
    const sessionId = asInt(req.params.sessionId);
    const { canModerate } = await assertLearningSessionAccess(req, sessionId);
    if (!canModerate) return res.status(403).json({ error: { message: 'Moderator access required' } });
    const userId = asInt(req.body?.userId);
    const role = String(req.body?.role || 'participant').toLowerCase();
    if (!userId || !['presenter', 'co_presenter', 'proctor', 'participant'].includes(role)) {
      return res.status(400).json({ error: { message: 'Valid userId and role are required' } });
    }
    const caps = defaultRoleCapabilities(role);
    await LearningClassSession.upsertParticipantRole({
      sessionId,
      userId,
      role,
      canUnmuteParticipants: req.body?.canUnmuteParticipants != null ? asBool(req.body.canUnmuteParticipants) : caps.canUnmuteParticipants,
      canEnableParticipantVideo: req.body?.canEnableParticipantVideo != null ? asBool(req.body.canEnableParticipantVideo) : caps.canEnableParticipantVideo,
      canManageSlides: req.body?.canManageSlides != null ? asBool(req.body.canManageSlides) : caps.canManageSlides,
      canManagePolls: req.body?.canManagePolls != null ? asBool(req.body.canManagePolls) : caps.canManagePolls
    });
    await logClassSessionTelemetry({
      sessionId,
      eventType: 'role_updated',
      actorUserId: req.user.id,
      payload: { userId, role }
    });
    const roles = await LearningClassSession.listParticipantRoles(sessionId);
    res.json({ roles });
  } catch (e) {
    next(e);
  }
};

export const listSessionSlides = async (req, res, next) => {
  try {
    const sessionId = asInt(req.params.sessionId);
    await assertLearningSessionAccess(req, sessionId);
    const [slides, state] = await Promise.all([
      LearningClassSession.listSlides(sessionId),
      LearningClassSession.getSessionState(sessionId)
    ]);
    res.json({ slides, state });
  } catch (e) {
    next(e);
  }
};

export const createSessionSlide = async (req, res, next) => {
  try {
    const sessionId = asInt(req.params.sessionId);
    const { canModerate } = await assertLearningSessionAccess(req, sessionId);
    if (!canModerate) return res.status(403).json({ error: { message: 'Moderator access required' } });
    const slide = await LearningClassSession.addSlide({
      sessionId,
      slideOrder: asInt(req.body?.slideOrder) ?? 0,
      title: req.body?.title ? String(req.body.title) : null,
      bodyText: req.body?.bodyText ? String(req.body.bodyText) : null,
      mediaUrl: req.body?.mediaUrl ? String(req.body.mediaUrl) : null,
      linkedAssignmentId: asInt(req.body?.linkedAssignmentId),
      linkedResourceId: asInt(req.body?.linkedResourceId),
      metadataJson: req.body?.metadataJson && typeof req.body.metadataJson === 'object' ? req.body.metadataJson : null,
      createdByUserId: req.user.id
    });
    res.status(201).json({ slide });
  } catch (e) {
    next(e);
  }
};

export const updateSessionSlide = async (req, res, next) => {
  try {
    const sessionId = asInt(req.params.sessionId);
    const slideId = asInt(req.params.slideId);
    const { canModerate } = await assertLearningSessionAccess(req, sessionId);
    if (!canModerate) return res.status(403).json({ error: { message: 'Moderator access required' } });
    const slide = await LearningClassSession.updateSlide(slideId, {
      slideOrder: req.body?.slideOrder !== undefined ? asInt(req.body.slideOrder) : undefined,
      title: req.body?.title !== undefined ? String(req.body.title || '') : undefined,
      bodyText: req.body?.bodyText !== undefined ? String(req.body.bodyText || '') : undefined,
      mediaUrl: req.body?.mediaUrl !== undefined ? String(req.body.mediaUrl || '') : undefined,
      linkedAssignmentId: req.body?.linkedAssignmentId !== undefined ? asInt(req.body.linkedAssignmentId) : undefined,
      linkedResourceId: req.body?.linkedResourceId !== undefined ? asInt(req.body.linkedResourceId) : undefined,
      metadataJson: req.body?.metadataJson !== undefined ? req.body.metadataJson : undefined,
      isActive: req.body?.isActive !== undefined ? asBool(req.body.isActive) : undefined
    });
    res.json({ slide });
  } catch (e) {
    next(e);
  }
};

export const syncSessionPresentationState = async (req, res, next) => {
  try {
    const sessionId = asInt(req.params.sessionId);
    const { canModerate } = await assertLearningSessionAccess(req, sessionId);
    if (!canModerate) return res.status(403).json({ error: { message: 'Moderator access required' } });
    const state = await LearningClassSession.upsertSessionState({
      sessionId,
      currentSlideId: req.body?.currentSlideId !== undefined ? asInt(req.body.currentSlideId) : null,
      currentSlideOrder: req.body?.currentSlideOrder !== undefined ? asInt(req.body.currentSlideOrder) || 0 : 0,
      linkedDocumentUrl: req.body?.linkedDocumentUrl ? String(req.body.linkedDocumentUrl) : null,
      presenterUserId: req.body?.presenterUserId ? asInt(req.body.presenterUserId) : req.user.id,
      metadataJson: req.body?.metadataJson && typeof req.body.metadataJson === 'object' ? req.body.metadataJson : null,
      updatedByUserId: req.user.id
    });
    await LearningClassSession.createActivity({
      sessionId,
      userId: req.user.id,
      participantIdentity: `user-${req.user.id}`,
      activityType: req.body?.linkedDocumentUrl ? 'document_change' : 'slide_change',
      payload: {
        currentSlideId: state?.current_slide_id || null,
        currentSlideOrder: state?.current_slide_order || 0,
        linkedDocumentUrl: state?.linked_document_url || null
      }
    });
    res.json({ state });
  } catch (e) {
    next(e);
  }
};

export const listSessionActivity = async (req, res, next) => {
  try {
    const sessionId = asInt(req.params.sessionId);
    await assertLearningSessionAccess(req, sessionId);
    const activity = await LearningClassSession.listActivity(sessionId, asInt(req.query?.limit) || 500);
    res.json({ activity });
  } catch (e) {
    next(e);
  }
};

export const postSessionActivity = async (req, res, next) => {
  try {
    const sessionId = asInt(req.params.sessionId);
    await assertLearningSessionAccess(req, sessionId);
    const activityType = String(req.body?.activityType || 'chat').toLowerCase();
    if (!['chat', 'poll', 'poll_vote', 'question', 'answer'].includes(activityType)) {
      return res.status(400).json({ error: { message: 'Unsupported activityType' } });
    }
    const id = await LearningClassSession.createActivity({
      sessionId,
      userId: req.user.id,
      participantIdentity: `user-${req.user.id}`,
      activityType,
      payload: req.body?.payload && typeof req.body.payload === 'object' ? req.body.payload : {}
    });
    res.status(201).json({ id });
  } catch (e) {
    next(e);
  }
};

export const createHandRaise = async (req, res, next) => {
  try {
    const sessionId = asInt(req.params.sessionId);
    await assertLearningSessionAccess(req, sessionId);
    const handRaise = await LearningClassSession.createHandRaise({
      sessionId,
      userId: req.user.id,
      note: req.body?.note ? String(req.body.note).slice(0, 500) : null,
      requestedCamera: asBool(req.body?.requestedCamera)
    });
    await logClassSessionTelemetry({
      sessionId,
      eventType: 'hand_raise',
      actorUserId: req.user.id,
      payload: { requestedCamera: handRaise?.requested_camera === 1 || handRaise?.requested_camera === true }
    });
    res.status(201).json({ handRaise });
  } catch (e) {
    next(e);
  }
};

export const resolveHandRaise = async (req, res, next) => {
  try {
    const sessionId = asInt(req.params.sessionId);
    const handRaiseId = asInt(req.params.handRaiseId);
    const { canModerate } = await assertLearningSessionAccess(req, sessionId);
    if (!canModerate) return res.status(403).json({ error: { message: 'Moderator access required' } });
    const status = String(req.body?.status || '').toLowerCase();
    if (!['approved', 'dismissed', 'answered'].includes(status)) {
      return res.status(400).json({ error: { message: 'status must be approved, dismissed, or answered' } });
    }
    const handRaise = await LearningClassSession.resolveHandRaise({
      handRaiseId,
      status,
      approvedAudio: asBool(req.body?.approvedAudio),
      approvedVideo: asBool(req.body?.approvedVideo),
      approvedByUserId: req.user.id
    });
    await logClassSessionTelemetry({
      sessionId,
      eventType: `hand_raise_${status}`,
      actorUserId: req.user.id,
      payload: { handRaiseId, approvedAudio: asBool(req.body?.approvedAudio), approvedVideo: asBool(req.body?.approvedVideo) }
    });
    const handRaises = await LearningClassSession.listHandRaises(sessionId);
    res.json({ handRaise, handRaises });
  } catch (e) {
    next(e);
  }
};

export const scoreSessionEvidence = async (req, res, next) => {
  try {
    const sessionId = asInt(req.params.sessionId);
    const { session, klass } = await assertLearningSessionAccess(req, sessionId);
    const canWrite = await canWriteEvidenceForClass(req, session.learning_class_id);
    if (!canWrite) return res.status(403).json({ error: { message: 'Only moderators can score evidence' } });

    const clientId = asInt(req.body?.clientId);
    const skillId = asInt(req.body?.skillId);
    const domainId = asInt(req.body?.domainId);
    if (!clientId || !skillId || !domainId) {
      return res.status(400).json({ error: { message: 'clientId, domainId, and skillId are required' } });
    }
    const classClientIds = await listClassParticipantClientIds(session.learning_class_id);
    if (!classClientIds.includes(clientId)) {
      return res.status(403).json({ error: { message: 'Student is not enrolled in this class' } });
    }

    const evidence = await LearningProgress.createEvidence({
      clientId,
      sourceType: 'class_session',
      sourceId: session.id,
      assessmentType: req.body?.assessmentType ? String(req.body.assessmentType) : 'live_prompt',
      observedAt: req.body?.observedAt || new Date(),
      domainId,
      subdomainId: asInt(req.body?.subdomainId),
      standardId: asInt(req.body?.standardId),
      skillId,
      scoreValue: req.body?.scoreValue != null ? Number(req.body.scoreValue) : null,
      rubricLevel: req.body?.rubricLevel != null ? Number(req.body.rubricLevel) : null,
      completionStatus: req.body?.completionStatus ? String(req.body.completionStatus) : 'completed',
      notes: req.body?.notes ? String(req.body.notes) : null,
      confidenceScore: req.body?.confidenceScore != null ? Number(req.body.confidenceScore) : null,
      metadata: {
        source: 'phase4a-group-session',
        classId: session.learning_class_id,
        className: klass.class_name,
        sessionId: session.id,
        slideId: asInt(req.body?.slideId),
        slideOrder: asInt(req.body?.slideOrder),
        linkedDocumentUrl: req.body?.linkedDocumentUrl ? String(req.body.linkedDocumentUrl) : null,
        systemScore: asBool(req.body?.systemScore)
      },
      goalIds: Array.isArray(req.body?.goalIds) ? req.body.goalIds : []
    }, req.user.id);

    await logClassSessionTelemetry({
      sessionId,
      eventType: 'evidence_scored',
      actorUserId: req.user.id,
      payload: { clientId, skillId, domainId }
    });
    res.status(201).json({ evidence });
  } catch (e) {
    next(e);
  }
};

export const getInPersonPlan = async (req, res, next) => {
  try {
    const sessionId = asInt(req.params.sessionId);
    const { actorRole, canModerate } = await assertLearningSessionAccess(req, sessionId);
    const payload = await getInPersonPlanPayload({ sessionId });
    res.json({
      ...sanitizeInPersonPayloadForViewer(enrichInPersonPayload(payload), { canModerate }),
      actorRole,
      canModerate
    });
  } catch (e) {
    next(e);
  }
};

export const patchInPersonPlan = async (req, res, next) => {
  try {
    const sessionId = asInt(req.params.sessionId);
    const { canModerate } = await assertLearningSessionAccess(req, sessionId);
    if (!canModerate) return res.status(403).json({ error: { message: 'Moderator access required' } });
    const payload = await upsertInPersonPlan({
      sessionId,
      userId: req.user.id,
      updates: req.body || {}
    });
    await logClassSessionTelemetry({
      sessionId,
      eventType: 'in_person_plan_saved',
      actorUserId: req.user.id
    });
    res.json({
      ...enrichInPersonPayload(payload),
      actorRole: 'presenter',
      canModerate: true
    });
  } catch (e) {
    next(e);
  }
};

export const duplicateInPersonPlan = async (req, res, next) => {
  try {
    const sessionId = asInt(req.params.sessionId);
    const sourceSessionId = asInt(req.params.sourceSessionId);
    const { canModerate } = await assertLearningSessionAccess(req, sessionId);
    if (!canModerate) return res.status(403).json({ error: { message: 'Moderator access required' } });
    const payload = await duplicateInPersonPlanFromSession({
      sessionId,
      sourceSessionId,
      userId: req.user.id
    });
    await logClassSessionTelemetry({
      sessionId,
      eventType: 'in_person_plan_duplicated',
      actorUserId: req.user.id,
      payload: { sourceSessionId }
    });
    res.json({
      ...enrichInPersonPayload(payload),
      actorRole: 'presenter',
      canModerate: true
    });
  } catch (e) {
    next(e);
  }
};

export const listInPersonMaterials = async (req, res, next) => {
  try {
    const sessionId = asInt(req.params.sessionId);
    await assertLearningSessionAccess(req, sessionId);
    const payload = await getInPersonPlanPayload({ sessionId });
    res.json({
      student: payload?.student || null,
      materials: Array.isArray(payload?.materials)
        ? payload.materials.map((material) => enrichInPersonMaterial(sessionId, material))
        : []
    });
  } catch (e) {
    next(e);
  }
};

export const postInPersonMaterial = async (req, res, next) => {
  try {
    const sessionId = asInt(req.params.sessionId);
    const { canModerate } = await assertLearningSessionAccess(req, sessionId);
    if (!canModerate) return res.status(403).json({ error: { message: 'Moderator access required' } });

    const base = req.body?.material && typeof req.body.material === 'object' ? req.body.material : req.body || {};
    const material = {
      materialType: String(base.materialType || '').trim(),
      sourceId: asInt(base.sourceId),
      title: base.title,
      description: base.description,
      externalUrl: base.externalUrl,
      positionIndex: base.positionIndex !== undefined ? Number(base.positionIndex) : undefined,
      config: parseObjectMaybe(base.config, {})
    };

    if (base.fieldDefinitions !== undefined) {
      material.config.fieldDefinitions = base.fieldDefinitions;
    }

    const created = await createInPersonMaterial({
      sessionId,
      userId: req.user.id,
      material,
      file: req.file || null
    });

    await logClassSessionTelemetry({
      sessionId,
      eventType: 'in_person_material_created',
      actorUserId: req.user.id,
      payload: { materialId: created?.id, materialType: created?.materialType }
    });

    res.status(201).json({ material: enrichInPersonMaterial(sessionId, created) });
  } catch (e) {
    next(e);
  }
};

export const patchInPersonMaterial = async (req, res, next) => {
  try {
    const sessionId = asInt(req.params.sessionId);
    const materialId = asInt(req.params.materialId);
    const { canModerate } = await assertLearningSessionAccess(req, sessionId);
    if (!canModerate) return res.status(403).json({ error: { message: 'Moderator access required' } });

    const updated = await updateInPersonMaterial({
      sessionId,
      materialId,
      userId: req.user.id,
      updates: {
        ...req.body,
        config: req.body?.config !== undefined ? parseObjectMaybe(req.body.config, {}) : undefined
      }
    });
    if (!updated) return res.status(404).json({ error: { message: 'Material not found' } });

    await logClassSessionTelemetry({
      sessionId,
      eventType: 'in_person_material_updated',
      actorUserId: req.user.id,
      payload: { materialId }
    });

    res.json({ material: enrichInPersonMaterial(sessionId, updated) });
  } catch (e) {
    next(e);
  }
};

export const deleteInPersonMaterialController = async (req, res, next) => {
  try {
    const sessionId = asInt(req.params.sessionId);
    const materialId = asInt(req.params.materialId);
    const { canModerate } = await assertLearningSessionAccess(req, sessionId);
    if (!canModerate) return res.status(403).json({ error: { message: 'Moderator access required' } });
    const ok = await deleteInPersonMaterial({ sessionId, materialId });
    if (!ok) return res.status(404).json({ error: { message: 'Material not found' } });

    await logClassSessionTelemetry({
      sessionId,
      eventType: 'in_person_material_deleted',
      actorUserId: req.user.id,
      payload: { materialId }
    });

    res.json({ ok: true });
  } catch (e) {
    next(e);
  }
};

export const getInPersonMaterialFileController = async (req, res, next) => {
  try {
    const sessionId = asInt(req.params.sessionId);
    const materialId = asInt(req.params.materialId);
    await assertLearningSessionAccess(req, sessionId);
    const file = await getInPersonMaterialFile({ sessionId, materialId });
    if (!file) return res.status(404).json({ error: { message: 'Material file not found' } });
    res.setHeader('Content-Type', file.contentType || 'application/pdf');
    res.setHeader('Cache-Control', 'no-store');
    res.send(file.buffer);
  } catch (e) {
    next(e);
  }
};

export const getInPersonMaterialResponseController = async (req, res, next) => {
  try {
    const sessionId = asInt(req.params.sessionId);
    const materialId = asInt(req.params.materialId);
    await assertLearningSessionAccess(req, sessionId);
    const payload = await getInPersonPlanPayload({ sessionId });
    const clientId = asInt(req.query?.clientId) || payload?.student?.clientId || payload?.plan?.studentClientId;
    if (!clientId) return res.status(400).json({ error: { message: 'No active student is attached to this session' } });
    const response = await getInPersonMaterialResponse({ sessionId, materialId, clientId });
    res.json({ clientId, response });
  } catch (e) {
    next(e);
  }
};

export const putInPersonMaterialResponseController = async (req, res, next) => {
  try {
    const sessionId = asInt(req.params.sessionId);
    const materialId = asInt(req.params.materialId);
    const { canModerate } = await assertLearningSessionAccess(req, sessionId);
    if (!canModerate) return res.status(403).json({ error: { message: 'Moderator access required' } });
    const payload = await getInPersonPlanPayload({ sessionId });
    const clientId = asInt(req.body?.clientId) || payload?.student?.clientId || payload?.plan?.studentClientId;
    if (!clientId) return res.status(400).json({ error: { message: 'No active student is attached to this session' } });
    const response = await upsertInPersonMaterialResponse({
      sessionId,
      materialId,
      clientId,
      responseValues: req.body?.responseValues || {},
      status: req.body?.status || 'draft'
    });
    res.json({ clientId, response });
  } catch (e) {
    next(e);
  }
};

export const downloadInPersonMaterialResponseController = async (req, res, next) => {
  try {
    const sessionId = asInt(req.params.sessionId);
    const materialId = asInt(req.params.materialId);
    await assertLearningSessionAccess(req, sessionId);
    const payload = await getInPersonPlanPayload({ sessionId });
    const clientId = asInt(req.query?.clientId) || payload?.student?.clientId || payload?.plan?.studentClientId;
    if (!clientId) return res.status(400).json({ error: { message: 'No active student is attached to this session' } });
    const filled = await buildInPersonMaterialDownload({ sessionId, materialId, clientId });
    if (!filled) return res.status(404).json({ error: { message: 'Material not found' } });
    const filename = `${String(filled.material.title || 'tutoring-material').replace(/[^a-z0-9]+/gi, '-').replace(/^-+|-+$/g, '') || 'tutoring-material'}-completed.pdf`;
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    res.setHeader('Cache-Control', 'no-store');
    res.send(Buffer.from(filled.pdfBytes));
  } catch (e) {
    next(e);
  }
};

export const inPersonAiAssist = async (req, res, next) => {
  try {
    const sessionId = asInt(req.params.sessionId);
    await assertLearningSessionAccess(req, sessionId);
    const prompt = String(req.body?.prompt || '').trim();
    if (!prompt) return res.status(400).json({ error: { message: 'prompt is required' } });
    const payload = await getInPersonPlanPayload({ sessionId });
    const ai = await runAgentAssist({
      userId: req.user.id,
      prompt,
      context: {
        routeName: 'in_person_tutoring',
        agencyId: payload?.session?.organization_id || null,
        tutoringMode: 'in_person',
        sessionId,
        student: payload?.student || null,
        plan: payload?.plan || null,
        materials: Array.isArray(payload?.materials)
          ? payload.materials.map((material) => ({
              id: material.id,
              title: material.title,
              materialType: material.materialType,
              description: material.description,
              blocks: material.config?.blocks || []
            }))
          : []
      },
      agentConfig: req.body?.agentConfig && typeof req.body.agentConfig === 'object' ? req.body.agentConfig : null,
      allowSearch: false,
      user: req.user,
      history: Array.isArray(req.body?.history) ? req.body.history : []
    });

    res.json({
      assistantText: ai?.rawText || 'No response',
      runtime: ai?.runtime || 'vertex'
    });
  } catch (e) {
    next(e);
  }
};
