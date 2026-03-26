import pool from '../config/database.js';
import LearningClassSession from '../models/LearningClassSession.model.js';
import LearningProgress from '../models/LearningProgress.model.js';
import { createOrGetRoomByUniqueName, createAccessTokenAsync, isTwilioVideoConfigured } from '../services/twilioVideo.service.js';
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
    if (!isTwilioVideoConfigured()) {
      return res.status(503).json({ error: { message: 'Twilio Video is not configured' } });
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

export const endClassSession = async (req, res, next) => {
  try {
    const sessionId = asInt(req.params.sessionId);
    const { canModerate } = await assertLearningSessionAccess(req, sessionId);
    if (!canModerate) return res.status(403).json({ error: { message: 'Moderator access required' } });
    const updated = await LearningClassSession.update(sessionId, {
      status: 'ended',
      endsAt: new Date(),
      endedByUserId: req.user.id
    });
    await logClassSessionTelemetry({ sessionId, eventType: 'session_ended', actorUserId: req.user.id });
    res.json({ session: updated });
  } catch (e) {
    next(e);
  }
};

export const getClassSessionVideoToken = async (req, res, next) => {
  try {
    const sessionId = asInt(req.params.sessionId);
    const { session, actorRole } = await assertLearningSessionAccess(req, sessionId);
    if (!isTwilioVideoConfigured()) {
      return res.status(503).json({ error: { message: 'Twilio Video is not configured' } });
    }
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

    const roleNorm = String(actorRole || 'participant');
    const participantDefaults = roleNorm === 'participant'
      ? { cameraOn: false, micOn: false }
      : { cameraOn: true, micOn: true };
    await LearningClassSession.markParticipantJoined(sessionId, req.user.id);
    res.json({
      token,
      roomName: room.uniqueName,
      roomSid: room.roomSid,
      actorRole: roleNorm,
      participantDefaults
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
