import pool from '../config/database.js';
import User from '../models/User.model.js';
import CounselingSession from '../models/CounselingSession.model.js';
import CounselingSessionNotes from '../models/CounselingSessionNotes.model.js';
import CounselingSessionChat from '../models/CounselingSessionChat.model.js';
import CounselingSessionActivityRuntime from '../models/CounselingSessionActivityRuntime.model.js';
import ActivityRegistry from '../models/ActivityRegistry.model.js';
import {
  createOrGetRoomByUniqueName,
  createAccessTokenAsync,
  isVideoConfigured,
  resolveVideoProjectId,
  getVideoClientDiagnostics
} from '../services/video.service.js';
import {
  applyRollToSharedState,
  buildInitialEmotionDiceState,
  lighterPromptDepth,
  pickEmotion,
  pickPrompt,
  normalizePromptDepth,
  getPack
} from '../services/emotionDice.service.js';
import {
  pickSituationCard,
  pickCharadesEmotion,
  buildInitialFeelingsAdventureState,
  buildInitialCopingQuestState,
  buildInitialEmotionCharadesState,
  buildInitialCalmDownBuilderState,
  buildInitialStoryShelfState
} from '../services/phase3Activities.service.js';

function parseFeatureFlags(raw) {
  if (!raw) return {};
  if (typeof raw === 'object') return raw;
  try {
    return JSON.parse(raw) || {};
  } catch {
    return {};
  }
}

/** Roles allowed to create counseling sessions (provider seat). */
const SESSION_CREATOR_ROLES = new Set([
  'provider',
  'provider_plus',
  'supervisor',
  'clinical_practice_assistant',
  'admin',
  'agency_admin',
  'super_admin',
  'superadmin'
]);

function roleOfUserInSession(session, userId) {
  const uid = Number(userId);
  if (Number(session.provider_user_id) === uid) return 'provider';
  if (session.client_user_id != null && Number(session.client_user_id) === uid) return 'client';
  return null;
}

async function assertCanCreateCounselingSession(req, agencyId) {
  const role = String(req.user?.role || '').toLowerCase();
  if (!SESSION_CREATOR_ROLES.has(role)) {
    const err = new Error('Only providers can create counseling sessions');
    err.status = 403;
    throw err;
  }
  if (role === 'super_admin' || role === 'superadmin') return;
  const agencies = await User.getAgencies(req.user.id);
  const ids = (agencies || []).map((a) => Number(a?.id)).filter(Boolean);
  if (!ids.includes(Number(agencyId))) {
    const err = new Error('Access denied to this agency');
    err.status = 403;
    throw err;
  }
}

async function loadAgencyFlags(agencyId) {
  const [rows] = await pool.execute(
    `SELECT feature_flags FROM agencies WHERE id = ? LIMIT 1`,
    [Number(agencyId)]
  );
  return parseFeatureFlags(rows?.[0]?.feature_flags);
}

async function assertSessionAccess(req, sessionIdOrPublic, { allowOpenClientSeat = false } = {}) {
  const session = await CounselingSession.findByIdOrPublicId(sessionIdOrPublic);
  if (!session) {
    const err = new Error('Session not found');
    err.status = 404;
    throw err;
  }
  // Backfill opaque URL id for older rows
  if (!session.public_id) {
    const ensured = await CounselingSession.ensurePublicId(session.id);
    if (ensured) Object.assign(session, ensured);
  }
  const role = String(req.user?.role || '').toLowerCase();
  if (role === 'super_admin') {
    return { session, participantRole: roleOfUserInSession(session, req.user.id) || 'provider' };
  }
  let participantRole = roleOfUserInSession(session, req.user.id);
  // Open-seat claim is intentionally disabled by default. Guests must use invite tokens.
  if (
    !participantRole &&
    allowOpenClientSeat &&
    session.client_user_id == null &&
    Number(session.provider_user_id) !== Number(req.user.id)
  ) {
    participantRole = 'client';
  }
  if (!participantRole) {
    const err = new Error('You are not a participant in this session');
    err.status = 403;
    throw err;
  }
  return { session, participantRole };
}

function stripPrivateSharedState(sharedState, participantRole) {
  if (!sharedState || typeof sharedState !== 'object') return sharedState || {};
  const copy = { ...sharedState };
  if (participantRole !== 'provider') {
    delete copy.providerPrivate;
    delete copy.facilitationNotes;
  }
  // Unshared mood notes must never appear in API responses for either role.
  if (copy.mood && typeof copy.mood === 'object' && copy.mood.noteShared === false) {
    copy.mood = { ...copy.mood };
    delete copy.mood.note;
  }
  // Unshared activity reflections (e.g. Peaceful Pond) stay private until shared.
  if (copy.reflectionShared === false) {
    delete copy.reflection;
  }
  // Emotion Charades: hide the emotion from the guesser until reveal.
  if (copy.actorRole && copy.revealed !== true && participantRole !== copy.actorRole) {
    delete copy.currentEmotionId;
    delete copy.currentEmotionLabel;
  }
  return copy;
}

function initialSharedStateForActivity(activityId, activity, body = {}) {
  const base = {
    invitedAt: new Date().toISOString(),
    activityDisplayName: activity.displayName
  };
  switch (activityId) {
    case 'emotion-dice':
      return { ...base, ...buildInitialEmotionDiceState(body.setup || {}) };
    case 'peaceful-pond':
      return {
        ...base,
        phase: 'worry_select',
        worriesPlaced: [],
        currentWorry: null,
        breathingSeconds: 4,
        calmRating: null,
        reflection: null
      };
    case 'feelings-adventure':
      return { ...base, ...buildInitialFeelingsAdventureState(body.setup || {}) };
    case 'coping-quest':
      return { ...base, ...buildInitialCopingQuestState(body.setup || {}) };
    case 'emotion-charades':
      return { ...base, ...buildInitialEmotionCharadesState(body.setup || {}) };
    case 'calm-down-builder':
      return { ...base, ...buildInitialCalmDownBuilderState() };
    case 'story-shelf':
      return { ...base, ...buildInitialStoryShelfState() };
    default:
      return base;
  }
}

export async function listActivities(req, res) {
  try {
    const agencyId = Number(req.query.agencyId || req.user?.agencyId || req.headers['x-agency-id'] || 0);
    const platform = req.query.platform || null;
    const launchMode = req.query.launchMode || null;
    const includePlanned = req.query.includePlanned === 'true';
    const includeDisabled = req.query.includeDisabled === 'true';
    const isSuperAdmin = String(req.user?.role || '').toLowerCase() === 'super_admin';

    let featureFlags = {};
    if (agencyId) featureFlags = await loadAgencyFlags(agencyId);

    const user = await User.findById(req.user.id);
    const hasGamesAccess = !!(
      user?.has_games_access === true ||
      user?.has_games_access === 1 ||
      user?.has_games_access === '1'
    );

    const activities = await ActivityRegistry.listForCaller({
      platform,
      launchMode,
      includePlanned: includePlanned || isSuperAdmin,
      includeDisabled: includeDisabled && isSuperAdmin,
      featureFlags,
      hasGamesAccess,
      isSuperAdmin
    });

    // For non-super-admin, only surface live/pilot unless includePlanned
    const filtered = activities.filter((a) => {
      if (isSuperAdmin && includePlanned) return a.status !== 'retired';
      if (a.status === 'live_current' || a.status === 'current_pilot') return true;
      if (includePlanned && a.status === 'planned') return true;
      return false;
    });

    return res.json({ ok: true, activities: filtered });
  } catch (err) {
    console.error('[activities.list]', err);
    return res.status(500).json({ error: { message: 'Failed to list activities' } });
  }
}

export async function createSession(req, res) {
  try {
    const agencyId = Number(req.body?.agencyId || req.user?.agencyId || req.headers['x-agency-id'] || 0);
    // Never trust a spoofed providerUserId from the body — the authenticated caller is the provider.
    const providerUserId = Number(req.user?.id || 0);
    const clientUserId = req.body?.clientUserId != null ? Number(req.body.clientUserId) : null;
    const title = req.body?.title || 'Counseling Session';
    if (!agencyId || !providerUserId) {
      return res.status(400).json({ error: { message: 'agencyId is required' } });
    }

    await assertCanCreateCounselingSession(req, agencyId);

    const roomUniqueName = `counseling-${agencyId}-${Date.now()}`;
    let vonageSessionId = null;
    const vonageApplicationId = isVideoConfigured()
      ? String(process.env.VONAGE_APPLICATION_ID || '').trim() || null
      : null;
    if (isVideoConfigured()) {
      const room = await createOrGetRoomByUniqueName(roomUniqueName);
      vonageSessionId = room?.sid || null;
    }

    const session = await CounselingSession.create({
      agencyId,
      providerUserId,
      clientUserId,
      appointmentId: req.body?.appointmentId != null ? Number(req.body.appointmentId) : null,
      title,
      vonageSessionId,
      vonageApplicationId,
      roomUniqueName,
      status: 'scheduled'
    });

    const publicSession = CounselingSession.toPublic(session, { includeInviteToken: true });
    return res.status(201).json({
      ok: true,
      session: publicSession,
      sharePath: `/counseling/invite/${publicSession.guestInviteToken}`,
      videoConfigured: isVideoConfigured()
    });
  } catch (err) {
    if (err.status) return res.status(err.status).json({ error: { message: err.message } });
    console.error('[counseling.create]', err);
    return res.status(500).json({ error: { message: 'Failed to create session' } });
  }
}

/** Create or reopen a counseling video room linked to an office booking (client optional). */
export async function findOrCreateFromAppointment(req, res) {
  try {
    const appointmentId = Number(req.body?.appointmentId || req.params?.appointmentId || 0);
    const agencyId = Number(req.body?.agencyId || req.user?.agencyId || req.headers['x-agency-id'] || 0);
    // Never trust a spoofed providerUserId from the body — the authenticated caller is the provider.
    const providerUserId = Number(req.user?.id || 0);
    const title = req.body?.title || 'Telehealth Session';
    if (!appointmentId || !agencyId || !providerUserId) {
      return res.status(400).json({
        error: { message: 'appointmentId and agencyId are required' }
      });
    }

    await assertCanCreateCounselingSession(req, agencyId);

    let session = await CounselingSession.findByAppointmentId(appointmentId);
    if (!session) {
      const roomUniqueName = `counseling-appt-${appointmentId}-${Date.now()}`;
      let vonageSessionId = null;
      const vonageApplicationId = isVideoConfigured()
        ? String(process.env.VONAGE_APPLICATION_ID || '').trim() || null
        : null;
      if (isVideoConfigured()) {
        const room = await createOrGetRoomByUniqueName(roomUniqueName);
        vonageSessionId = room?.sid || null;
      }
      session = await CounselingSession.create({
        agencyId,
        providerUserId,
        clientUserId: req.body?.clientUserId != null ? Number(req.body.clientUserId) : null,
        appointmentId,
        title,
        vonageSessionId,
        vonageApplicationId,
        roomUniqueName,
        status: 'scheduled'
      });
    } else {
      // Existing session: only the seated provider (or super_admin) may reopen.
      const role = String(req.user?.role || '').toLowerCase();
      const isSuper = role === 'super_admin' || role === 'superadmin';
      if (!isSuper && Number(session.provider_user_id) !== providerUserId) {
        return res.status(403).json({ error: { message: 'Only the session provider can reopen this booking' } });
      }
      session = await CounselingSession.ensureInviteToken(session.id);
      session = (await CounselingSession.ensurePublicId(session.id)) || session;
    }

    const publicSession = CounselingSession.toPublic(session, { includeInviteToken: true });
    return res.json({
      ok: true,
      session: publicSession,
      sharePath: `/counseling/invite/${publicSession.guestInviteToken}`,
      videoConfigured: isVideoConfigured()
    });
  } catch (err) {
    if (err.status) return res.status(err.status).json({ error: { message: err.message } });
    console.error('[counseling.fromAppointment]', err);
    return res.status(500).json({ error: { message: 'Failed to open video for booking' } });
  }
}

export async function getShareLink(req, res) {
  try {
    const { session, participantRole } = await assertSessionAccess(req, req.params.sessionId);
    if (participantRole !== 'provider' && String(req.user?.role || '').toLowerCase() !== 'super_admin') {
      return res.status(403).json({ error: { message: 'Only the provider can share this session' } });
    }
    const withToken = await CounselingSession.ensureInviteToken(session.id);
    const publicSession = CounselingSession.toPublic(withToken, { includeInviteToken: true });
    return res.json({
      ok: true,
      session: publicSession,
      sharePath: `/counseling/invite/${publicSession.guestInviteToken}`
    });
  } catch (err) {
    if (err.status) return res.status(err.status).json({ error: { message: err.message } });
    return res.status(500).json({ error: { message: 'Failed to get share link' } });
  }
}

/** Authenticated guest accepts invite token and is seated as client (if seat open). */
export async function acceptInvite(req, res) {
  try {
    const token = String(req.params.token || '').trim();
    if (!token) return res.status(400).json({ error: { message: 'Invite token required' } });
    const session = await CounselingSession.findByInviteToken(token);
    if (!session) return res.status(404).json({ error: { message: 'Invite not found' } });
    if (session.status === 'ended') {
      return res.status(410).json({ error: { message: 'This session has ended' } });
    }
    if (session.guest_invite_expires_at && new Date(session.guest_invite_expires_at) < new Date()) {
      return res.status(410).json({ error: { message: 'This invite has expired' } });
    }

    const uid = Number(req.user.id);
    if (Number(session.provider_user_id) === uid) {
      return res.json({
        ok: true,
        session: CounselingSession.toPublic(session),
        participantRole: 'provider'
      });
    }

    if (session.client_user_id != null && Number(session.client_user_id) !== uid) {
      return res.status(409).json({ error: { message: 'This session already has a client' } });
    }

    const updated =
      session.client_user_id == null
        ? await CounselingSession.update(session.id, { client_user_id: uid })
        : session;

    return res.json({
      ok: true,
      session: CounselingSession.toPublic(updated),
      participantRole: 'client'
    });
  } catch (err) {
    console.error('[counseling.acceptInvite]', err);
    return res.status(500).json({ error: { message: 'Failed to accept invite' } });
  }
}

export async function listSessions(req, res) {
  try {
    const agencyId = req.query.agencyId ? Number(req.query.agencyId) : null;
    const rows = await CounselingSession.listForUser({
      userId: req.user.id,
      agencyId,
      limit: Number(req.query.limit || 50)
    });
    return res.json({
      ok: true,
      sessions: rows.map((r) => CounselingSession.toPublic(r))
    });
  } catch (err) {
    console.error('[counseling.list]', err);
    return res.status(500).json({ error: { message: 'Failed to list sessions' } });
  }
}

export async function getSession(req, res) {
  try {
    const { session, participantRole } = await assertSessionAccess(req, req.params.sessionId);
    const withToken =
      participantRole === 'provider' || String(req.user?.role || '').toLowerCase() === 'super_admin'
        ? await CounselingSession.ensureInviteToken(session.id)
        : session;
    const runtime = await CounselingSessionActivityRuntime.findActiveForSession(session.id);
    return res.json({
      ok: true,
      session: CounselingSession.toPublic(withToken, {
        includeInviteToken:
          participantRole === 'provider' || String(req.user?.role || '').toLowerCase() === 'super_admin'
      }),
      participantRole,
      activityRuntime: runtime
        ? {
            ...runtime,
            sharedState: stripPrivateSharedState(runtime.sharedState, participantRole)
          }
        : null,
      videoConfigured: isVideoConfigured()
    });
  } catch (err) {
    if (err.status) return res.status(err.status).json({ error: { message: err.message } });
    console.error('[counseling.get]', err);
    return res.status(500).json({ error: { message: 'Failed to get session' } });
  }
}

export async function joinSession(req, res) {
  try {
    // Clients must enter via invite token accept first (sets client_user_id).
    // Guessing /session/123 must not auto-claim an empty seat.
    const { session, participantRole } = await assertSessionAccess(req, req.params.sessionId);
    let vonageSessionId = session.vonage_session_id;
    let roomUniqueName = session.room_unique_name || `counseling-${session.id}`;

    if (!vonageSessionId && isVideoConfigured()) {
      const room = await createOrGetRoomByUniqueName(roomUniqueName);
      vonageSessionId = room?.sid || null;
      await CounselingSession.setVideoRoom(session.id, {
        vonageSessionId,
        roomUniqueName,
        vonageApplicationId: String(process.env.VONAGE_APPLICATION_ID || '').trim() || null
      });
    }

    const nextStatus = session.status === 'ended' ? 'ended' : 'active';
    const updates = { status: nextStatus };
    if (!session.started_at && nextStatus === 'active') {
      updates.started_at = new Date();
    }
    const updated = await CounselingSession.update(session.id, updates);

    return res.json({
      ok: true,
      session: CounselingSession.toPublic(updated),
      participantRole,
      videoConfigured: isVideoConfigured()
    });
  } catch (err) {
    if (err.status) return res.status(err.status).json({ error: { message: err.message } });
    console.error('[counseling.join]', err);
    return res.status(500).json({ error: { message: 'Failed to join session' } });
  }
}

export async function getVideoToken(req, res) {
  try {
    // Strict participant check — never allow "open seat" claim via video-token.
    const { session, participantRole } = await assertSessionAccess(req, req.params.sessionId);
    if (!isVideoConfigured()) {
      return res.status(503).json({
        error: { message: 'Video is not configured' },
        videoConfigured: false,
        diagnostics: getVideoClientDiagnostics()
      });
    }

    const currentAppId = String(process.env.VONAGE_APPLICATION_ID || '').trim();
    const projectId = resolveVideoProjectId();
    if (!projectId) {
      return res.status(503).json({
        error: {
          message:
            'Vonage Video Application ID is missing. Set VONAGE_APPLICATION_ID (Dashboard → Applications).'
        },
        videoConfigured: false,
        diagnostics: getVideoClientDiagnostics()
      });
    }

    const recreateRoom =
      req.query?.recreateRoom === '1' ||
      req.query?.recreateRoom === 'true' ||
      req.body?.recreateRoom === true;

    let vonageSessionId = session.vonage_session_id;
    const roomUniqueName = session.room_unique_name || `counseling-${session.id}`;
    const storedAppId = String(session.vonage_application_id || '').trim();
    const appMismatch = !!(vonageSessionId && storedAppId && currentAppId && storedAppId !== currentAppId);
    // Legacy rows (no stored app id) may have been created under a different Application
    // when local/stage/prod share a DB — recreate so token + session share the current app.
    const legacyUnstamped = !!(vonageSessionId && !storedAppId);
    const needsNewRoom =
      !vonageSessionId || appMismatch || legacyUnstamped || (recreateRoom && !!vonageSessionId);

    if (needsNewRoom) {
      const room = await createOrGetRoomByUniqueName(
        vonageSessionId || recreateRoom || appMismatch || legacyUnstamped
          ? `${roomUniqueName}-${Date.now()}`
          : roomUniqueName
      );
      vonageSessionId = room?.sid || null;
      await CounselingSession.setVideoRoom(session.id, {
        vonageSessionId,
        roomUniqueName,
        vonageApplicationId: currentAppId || null
      });
    }

    if (!vonageSessionId) {
      return res.status(503).json({
        error: { message: 'Could not create video room' },
        videoConfigured: true,
        diagnostics: getVideoClientDiagnostics()
      });
    }

    const identity = `user-${req.user.id}-${participantRole}`;
    const token = await createAccessTokenAsync({
      roomSid: vonageSessionId,
      identity,
      metadata: {
        role: participantRole,
        sessionId: session.id,
        displayName: req.user.name || req.user.email || identity
      }
    });

    // Vonage Video JWT client tokens require Application ID in OT.initSession(...).
    // Never return the account VONAGE_API_KEY here — it is not a Video project key.
    return res.json({
      ok: true,
      token,
      sessionId: vonageSessionId,
      applicationId: projectId,
      // Alias for older clients; same value as applicationId (never account API key).
      apiKey: projectId,
      identity,
      participantRole,
      videoConfigured: true,
      roomRecreated: !!(needsNewRoom && (recreateRoom || appMismatch || legacyUnstamped || !session.vonage_session_id)),
      diagnostics: getVideoClientDiagnostics({ token, sessionId: vonageSessionId })
    });
  } catch (err) {
    if (err.status) return res.status(err.status).json({ error: { message: err.message } });
    console.error('[counseling.videoToken]', err);
    return res.status(500).json({
      error: { message: 'Failed to create video token' },
      diagnostics: getVideoClientDiagnostics()
    });
  }
}

export async function endSession(req, res) {
  try {
    const { session, participantRole } = await assertSessionAccess(req, req.params.sessionId);
    if (participantRole !== 'provider' && String(req.user?.role || '').toLowerCase() !== 'super_admin') {
      // Client may end with confirmation — allowed per spec
    }
    const updated = await CounselingSession.update(session.id, {
      status: 'ended',
      ended_at: new Date()
    });
    const active = await CounselingSessionActivityRuntime.findActiveForSession(session.id);
    if (active) {
      await CounselingSessionActivityRuntime.update(active.id, {
        status: 'INACTIVE',
        pauseReason: 'session_ended'
      });
    }
    return res.json({ ok: true, session: CounselingSession.toPublic(updated) });
  } catch (err) {
    if (err.status) return res.status(err.status).json({ error: { message: err.message } });
    console.error('[counseling.end]', err);
    return res.status(500).json({ error: { message: 'Failed to end session' } });
  }
}

export async function listNotes(req, res) {
  try {
    const { session, participantRole } = await assertSessionAccess(req, req.params.sessionId);
    const notes = await CounselingSessionNotes.listForSession(session.id, participantRole);
    return res.json({ ok: true, notes });
  } catch (err) {
    if (err.status) return res.status(err.status).json({ error: { message: err.message } });
    console.error('[counseling.notes.list]', err);
    return res.status(500).json({ error: { message: 'Failed to list notes' } });
  }
}

export async function createNote(req, res) {
  try {
    const { session, participantRole } = await assertSessionAccess(req, req.params.sessionId);
    const visibility = String(req.body?.visibility || '');
    const body = String(req.body?.body || '').trim();
    if (!body) return res.status(400).json({ error: { message: 'body is required' } });

    if (visibility === 'provider_private' && participantRole !== 'provider') {
      return res.status(403).json({ error: { message: 'Only the provider can create private notes' } });
    }
    if (visibility === 'client_journal' && participantRole !== 'client') {
      return res.status(403).json({ error: { message: 'Only the client can create journal entries' } });
    }
    if (!['provider_private', 'shared', 'client_journal', 'activity_reflection'].includes(visibility)) {
      return res.status(400).json({ error: { message: 'Invalid visibility' } });
    }

    const note = await CounselingSessionNotes.create({
      sessionId: session.id,
      authorUserId: req.user.id,
      visibility,
      body,
      activityId: req.body?.activityId || null
    });
    return res.status(201).json({ ok: true, note: CounselingSessionNotes.toPublic(note) });
  } catch (err) {
    if (err.status) return res.status(err.status).json({ error: { message: err.message } });
    console.error('[counseling.notes.create]', err);
    return res.status(500).json({ error: { message: 'Failed to create note' } });
  }
}

export async function listChat(req, res) {
  try {
    const { session } = await assertSessionAccess(req, req.params.sessionId);
    const messages = await CounselingSessionChat.listForSession(session.id, {
      afterId: Number(req.query.afterId || 0),
      limit: Number(req.query.limit || 100)
    });
    return res.json({ ok: true, messages });
  } catch (err) {
    if (err.status) return res.status(err.status).json({ error: { message: err.message } });
    console.error('[counseling.chat.list]', err);
    return res.status(500).json({ error: { message: 'Failed to list chat' } });
  }
}

export async function postChat(req, res) {
  try {
    const { session, participantRole } = await assertSessionAccess(req, req.params.sessionId);
    const body = String(req.body?.body || '').trim();
    if (!body) return res.status(400).json({ error: { message: 'body is required' } });
    const message = await CounselingSessionChat.create({
      sessionId: session.id,
      senderUserId: req.user.id,
      senderRole: participantRole,
      body
    });
    return res.status(201).json({ ok: true, message: CounselingSessionChat.toPublic(message) });
  } catch (err) {
    if (err.status) return res.status(err.status).json({ error: { message: err.message } });
    return res.status(500).json({ error: { message: 'Failed to send chat' } });
  }
}

export async function getActivityRuntime(req, res) {
  try {
    const { session, participantRole } = await assertSessionAccess(req, req.params.sessionId);
    const runtime = await CounselingSessionActivityRuntime.findActiveForSession(session.id);
    if (!runtime) return res.json({ ok: true, runtime: null });
    return res.json({
      ok: true,
      runtime: {
        ...runtime,
        sharedState: stripPrivateSharedState(runtime.sharedState, participantRole)
      }
    });
  } catch (err) {
    if (err.status) return res.status(err.status).json({ error: { message: err.message } });
    return res.status(500).json({ error: { message: 'Failed to get activity runtime' } });
  }
}

export async function inviteActivity(req, res) {
  try {
    const { session, participantRole } = await assertSessionAccess(req, req.params.sessionId);
    if (participantRole !== 'provider' && String(req.user?.role || '').toLowerCase() !== 'super_admin') {
      return res.status(403).json({ error: { message: 'Only the provider can launch activities' } });
    }
    const activityId = String(req.body?.activityId || '');
    const activity = await ActivityRegistry.findById(activityId);
    if (!activity) return res.status(404).json({ error: { message: 'Activity not found' } });
    if (!['live_current', 'current_pilot'].includes(activity.status)) {
      return res.status(400).json({ error: { message: 'Activity is not available' } });
    }
    if (activity.launchMode === 'standalone') {
      return res.status(400).json({
        error: { message: 'This activity launches standalone, not inside the session host' }
      });
    }

    // Soft-close any other active runtime
    const existingActive = await CounselingSessionActivityRuntime.findActiveForSession(session.id);
    if (existingActive && existingActive.activityId !== activityId) {
      await CounselingSessionActivityRuntime.update(existingActive.id, {
        status: 'INACTIVE',
        pauseReason: 'replaced'
      });
    }

    const runtime = await CounselingSessionActivityRuntime.upsert({
      sessionId: session.id,
      activityId,
      status: 'CLIENT_PROMPT',
      roundNumber: 0,
      sharedState: initialSharedStateForActivity(activityId, activity, req.body || {}),
      invitedByUserId: req.user.id
    });

    return res.json({ ok: true, runtime });
  } catch (err) {
    if (err.status) return res.status(err.status).json({ error: { message: err.message } });
    console.error('[counseling.activity.invite]', err);
    return res.status(500).json({ error: { message: 'Failed to invite activity' } });
  }
}

/**
 * Server-authoritative random outcomes:
 * - emotion-dice: roll / reroll
 * - feelings-adventure: draw situation card
 * - emotion-charades: deal private emotion to actor
 * Clients may animate locally; results always come from here.
 */
export async function rollActivity(req, res) {
  try {
    const { session, participantRole } = await assertSessionAccess(req, req.params.sessionId);
    if (participantRole !== 'client' && participantRole !== 'provider') {
      return res.status(403).json({ error: { message: 'Not a session participant' } });
    }

    const runtime = await CounselingSessionActivityRuntime.findActiveForSession(session.id);
    if (!runtime) return res.status(404).json({ error: { message: 'No active activity' } });

    const supported = new Set(['emotion-dice', 'feelings-adventure', 'emotion-charades']);
    if (!supported.has(runtime.activityId)) {
      return res.status(400).json({
        error: { message: 'Server draw/roll is not available for this activity' }
      });
    }
    if (runtime.status !== 'ACTIVE') {
      return res.status(400).json({ error: { message: 'Activity must be ACTIVE to roll' } });
    }

    const shared = runtime.sharedState || {};
    if (shared.paused) {
      return res.status(400).json({ error: { message: 'Activity is paused' } });
    }

    // --- Feelings Adventure: draw card ---
    if (runtime.activityId === 'feelings-adventure') {
      const action = String(req.body?.action || 'draw');
      if (action !== 'draw') {
        return res.status(400).json({ error: { message: 'Unsupported action' } });
      }
      const currentTurn = shared.currentTurn || 'client';
      if (currentTurn !== participantRole) {
        return res.status(403).json({ error: { message: 'It is not your turn to draw' } });
      }
      if (!shared.packId) {
        return res.status(400).json({ error: { message: 'Choose a topic pack first' } });
      }
      const situation = pickSituationCard(shared.packId, {
        excludeId: shared.currentSituationId || undefined
      });
      const nextShared = {
        ...shared,
        phase: 'play',
        currentSituationId: situation.id,
        currentSituationText: situation.text,
        selectedFeelings: [],
        bodyClue: '',
        nextStep: '',
        lastDrawAt: new Date().toISOString(),
        lastDrawerRole: participantRole
      };
      const updated = await CounselingSessionActivityRuntime.update(runtime.id, {
        sharedState: nextShared,
        status: 'ACTIVE'
      });
      return res.json({
        ok: true,
        runtime: {
          ...updated,
          sharedState: stripPrivateSharedState(updated.sharedState, participantRole)
        },
        draw: { situationId: situation.id, situationText: situation.text }
      });
    }

    // --- Emotion Charades: deal private emotion ---
    if (runtime.activityId === 'emotion-charades') {
      const action = String(req.body?.action || 'deal');
      if (action !== 'deal') {
        return res.status(400).json({ error: { message: 'Unsupported action' } });
      }
      const actorRole = shared.actorRole || shared.firstActor || 'client';
      if (participantRole !== actorRole) {
        return res.status(403).json({ error: { message: 'Only the actor can deal an emotion' } });
      }
      const emotion = pickCharadesEmotion({
        excludeId: shared.currentEmotionId || undefined
      });
      const nextShared = {
        ...shared,
        actorRole,
        phase: shared.phase === 'setup' ? 'actor_ready' : shared.phase || 'actor_ready',
        currentEmotionId: emotion.id,
        currentEmotionLabel: emotion.label,
        revealed: false,
        lastDealAt: new Date().toISOString()
      };
      const updated = await CounselingSessionActivityRuntime.update(runtime.id, {
        sharedState: nextShared,
        roundNumber: Number(nextShared.round) || 1,
        status: 'ACTIVE'
      });
      return res.json({
        ok: true,
        runtime: {
          ...updated,
          sharedState: stripPrivateSharedState(updated.sharedState, participantRole)
        },
        deal: { emotionId: emotion.id, emotionLabel: emotion.label }
      });
    }

    // --- Emotion Dice (existing) ---
    if (shared.phase === 'rounds_complete') {
      return res.status(400).json({ error: { message: 'All rounds are complete' } });
    }

    const action = String(req.body?.action || 'roll'); // roll | reroll
    const isReroll = action === 'reroll';
    const currentTurn = shared.currentTurn || shared.whoRollsFirst || 'client';

    // Reroll is only allowed by the participant who just rolled (lastRollerRole).
    if (isReroll) {
      if (shared.lastRollerRole !== participantRole) {
        return res.status(403).json({ error: { message: 'Only the current roller can reroll' } });
      }
    } else if (currentTurn !== participantRole) {
      return res.status(403).json({ error: { message: 'It is not your turn to roll' } });
    }

    const packId = shared.packId || 'core-6';
    getPack(packId);

    let promptDepth = normalizePromptDepth(
      req.body?.promptDepth || shared.promptDepth || 'light'
    );
    if (req.body?.lighterPrompt === true) {
      promptDepth = lighterPromptDepth(promptDepth);
    }

    const emotion = pickEmotion(packId);
    const prompt = pickPrompt(promptDepth, {
      excludeId: isReroll ? shared.currentPromptId : undefined
    });

    let nextShared;
    if (isReroll) {
      const history = Array.isArray(shared.rollHistory) ? [...shared.rollHistory] : [];
      const entry = {
        round: Number(shared.round) || 1,
        rollerRole: participantRole,
        emotionId: emotion.id,
        emotionLabel: emotion.label,
        promptId: prompt.id,
        promptText: prompt.text,
        promptDepth: prompt.depth,
        at: new Date().toISOString(),
        reroll: true
      };
      if (history.length) history[history.length - 1] = entry;
      else history.push(entry);
      nextShared = {
        ...shared,
        currentEmotionId: emotion.id,
        currentEmotionLabel: emotion.label,
        currentPromptId: prompt.id,
        currentPromptText: prompt.text,
        promptDepth: prompt.depth,
        rollHistory: history,
        phase: 'discuss',
        lastRollAt: entry.at,
        lastRollerRole: participantRole
      };
    } else {
      nextShared = applyRollToSharedState(shared, {
        rollerRole: participantRole,
        emotion,
        prompt
      });
    }

    const updated = await CounselingSessionActivityRuntime.update(runtime.id, {
      sharedState: nextShared,
      roundNumber: nextShared.round,
      status: 'ACTIVE'
    });

    return res.json({
      ok: true,
      runtime: {
        ...updated,
        sharedState: stripPrivateSharedState(updated.sharedState, participantRole)
      },
      roll: {
        emotionId: emotion.id,
        emotionLabel: emotion.label,
        promptId: prompt.id,
        promptText: prompt.text,
        promptDepth: prompt.depth
      }
    });
  } catch (err) {
    if (err.status) return res.status(err.status).json({ error: { message: err.message } });
    console.error('[counseling.activity.roll]', err);
    return res.status(500).json({ error: { message: 'Failed to roll' } });
  }
}

export async function respondActivity(req, res) {
  try {
    const { session, participantRole } = await assertSessionAccess(req, req.params.sessionId);
    const action = String(req.body?.action || ''); // accept | decline
    const runtime = await CounselingSessionActivityRuntime.findActiveForSession(session.id);
    if (!runtime) return res.status(404).json({ error: { message: 'No active activity invitation' } });

    if (action === 'decline') {
      if (participantRole !== 'client' && participantRole !== 'provider') {
        return res.status(403).json({ error: { message: 'Not allowed' } });
      }
      const updated = await CounselingSessionActivityRuntime.update(runtime.id, {
        status: 'INACTIVE',
        pauseReason: 'declined',
        sharedState: { ...runtime.sharedState, declinedAt: new Date().toISOString() }
      });
      return res.json({ ok: true, runtime: updated });
    }

    if (action === 'accept') {
      if (participantRole !== 'client') {
        return res.status(403).json({
          error: { message: 'Only the client can accept an activity invitation' }
        });
      }
      const updated = await CounselingSessionActivityRuntime.update(runtime.id, {
        status: 'ACTIVE',
        startedAt: runtime.startedAt || new Date(),
        sharedState: { ...runtime.sharedState, acceptedAt: new Date().toISOString() }
      });
      return res.json({ ok: true, runtime: updated });
    }

    return res.status(400).json({ error: { message: 'action must be accept or decline' } });
  } catch (err) {
    if (err.status) return res.status(err.status).json({ error: { message: err.message } });
    return res.status(500).json({ error: { message: 'Failed to respond to activity' } });
  }
}

export async function patchActivityRuntime(req, res) {
  try {
    const { session, participantRole } = await assertSessionAccess(req, req.params.sessionId);
    const runtime = await CounselingSessionActivityRuntime.findActiveForSession(session.id);
    if (!runtime) return res.status(404).json({ error: { message: 'No active activity' } });

    const nextStatus = req.body?.status;
    const sharedStateIn = req.body?.sharedState;
    const checkpoint = req.body?.checkpoint;
    const pauseReason = req.body?.pauseReason;

    let mergedState = runtime.sharedState || {};
    if (sharedStateIn && typeof sharedStateIn === 'object') {
      // Clients cannot write providerPrivate
      if (participantRole === 'client') {
        const { providerPrivate, facilitationNotes, ...safe } = sharedStateIn;
        mergedState = { ...mergedState, ...safe };
      } else {
        mergedState = { ...mergedState, ...sharedStateIn };
      }
    }

    const updated = await CounselingSessionActivityRuntime.update(runtime.id, {
      status: nextStatus || runtime.status,
      sharedState: mergedState,
      checkpoint: checkpoint !== undefined ? checkpoint : undefined,
      pauseReason: pauseReason !== undefined ? pauseReason : undefined,
      roundNumber: req.body?.roundNumber !== undefined ? req.body.roundNumber : undefined,
      completedAt: nextStatus === 'COMPLETED' ? new Date() : undefined
    });

    return res.json({
      ok: true,
      runtime: {
        ...updated,
        sharedState: stripPrivateSharedState(updated.sharedState, participantRole)
      }
    });
  } catch (err) {
    if (err.status) return res.status(err.status).json({ error: { message: err.message } });
    console.error('[counseling.activity.patch]', err);
    return res.status(500).json({ error: { message: 'Failed to update activity' } });
  }
}

export async function pauseActivity(req, res) {
  try {
    const { session, participantRole } = await assertSessionAccess(req, req.params.sessionId);
    const runtime = await CounselingSessionActivityRuntime.findActiveForSession(session.id);
    if (!runtime) return res.status(404).json({ error: { message: 'No active activity' } });
    const updated = await CounselingSessionActivityRuntime.update(runtime.id, {
      status: 'PAUSED',
      pauseReason: req.body?.reason || `paused_by_${participantRole}`,
      checkpoint: req.body?.checkpoint || runtime.checkpoint || runtime.sharedState
    });
    return res.json({ ok: true, runtime: updated });
  } catch (err) {
    if (err.status) return res.status(err.status).json({ error: { message: err.message } });
    return res.status(500).json({ error: { message: 'Failed to pause activity' } });
  }
}

export async function resumeActivity(req, res) {
  try {
    const { session } = await assertSessionAccess(req, req.params.sessionId);
    const runtime = await CounselingSessionActivityRuntime.findBySessionAndActivity(
      session.id,
      req.body?.activityId || (await CounselingSessionActivityRuntime.findActiveForSession(session.id))?.activityId
    );
    // Prefer latest paused
    const activeOrPaused = await CounselingSessionActivityRuntime.findActiveForSession(session.id);
    const target = activeOrPaused || runtime;
    if (!target) return res.status(404).json({ error: { message: 'No activity to resume' } });
    const updated = await CounselingSessionActivityRuntime.update(target.id, {
      status: 'ACTIVE',
      pauseReason: null
    });
    return res.json({ ok: true, runtime: updated });
  } catch (err) {
    if (err.status) return res.status(err.status).json({ error: { message: err.message } });
    return res.status(500).json({ error: { message: 'Failed to resume activity' } });
  }
}

export async function exitActivity(req, res) {
  try {
    const { session, participantRole } = await assertSessionAccess(req, req.params.sessionId);
    const runtime = await CounselingSessionActivityRuntime.findActiveForSession(session.id);
    if (!runtime) return res.json({ ok: true, runtime: null });

    const save = req.body?.save !== false;
    const updated = await CounselingSessionActivityRuntime.update(runtime.id, {
      status: 'INACTIVE',
      pauseReason: `exited_by_${participantRole}`,
      checkpoint: save ? (req.body?.checkpoint || runtime.sharedState) : null,
      completedAt: req.body?.completed ? new Date() : runtime.completedAt
    });
    return res.json({ ok: true, runtime: updated });
  } catch (err) {
    if (err.status) return res.status(err.status).json({ error: { message: err.message } });
    return res.status(500).json({ error: { message: 'Failed to exit activity' } });
  }
}
